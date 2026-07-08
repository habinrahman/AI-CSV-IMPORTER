import { randomUUID } from "node:crypto";
import type {
  ImportJobProgress,
  ImportJobSnapshot,
  ImportJobStatus,
  ImportResult,
} from "@groweasy/shared";
import type { Logger } from "../../logger";

export interface ImportJobRecord {
  id: string;
  status: ImportJobStatus;
  progress: ImportJobProgress;
  result?: ImportResult;
  error?: string;
  createdAt: Date;
  /** Cancels the pipeline run (job sweep, graceful shutdown). */
  abort: AbortController;
}

export type JobListener = (snapshot: ImportJobSnapshot) => void;

export type JobUpdate = Partial<
  Pick<ImportJobRecord, "status" | "progress" | "result" | "error">
>;

/**
 * Job state seam. In-memory today; the interface is what the SSE hub and
 * controllers depend on, so a Redis-backed implementation (multi-instance,
 * restart-safe) slots in without call-site changes.
 */
export interface JobStore {
  create(): ImportJobRecord;
  get(jobId: string): ImportJobRecord | undefined;
  /**
   * Apply a patch and notify every subscriber with the fresh snapshot.
   * Terminal jobs (completed/failed) are immutable: late patches — e.g. the
   * pipeline's abort handler racing a cancellation — are ignored, so
   * subscribers see exactly one terminal event.
   */
  update(jobId: string, patch: JobUpdate): void;
  /** Listen for updates; returns the unsubscribe function. */
  subscribe(jobId: string, listener: JobListener): () => void;
  /** Jobs not yet terminal — the backpressure signal for accepting new ones. */
  countActive(): number;
  dispose(): void;
}

function isTerminal(record: ImportJobRecord): boolean {
  return record.status === "completed" || record.status === "failed";
}

export function toSnapshot(record: ImportJobRecord): ImportJobSnapshot {
  return {
    jobId: record.id,
    status: record.status,
    progress: record.progress,
    ...(record.error !== undefined ? { error: record.error } : {}),
    ...(record.result ? { stats: record.result.stats } : {}),
  };
}

const EMPTY_PROGRESS: ImportJobProgress = {
  totalRows: 0,
  processedRows: 0,
  skippedRows: 0,
  failedRows: 0,
  currentBatch: 0,
  totalBatches: 0,
};

const SWEEP_INTERVAL_MS = 60_000;

export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, ImportJobRecord>();
  private readonly listeners = new Map<string, Set<JobListener>>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(
    private readonly ttlMs: number,
    private readonly logger: Logger,
  ) {
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  create(): ImportJobRecord {
    const record: ImportJobRecord = {
      id: randomUUID(),
      status: "queued",
      progress: { ...EMPTY_PROGRESS },
      createdAt: new Date(),
      abort: new AbortController(),
    };
    this.jobs.set(record.id, record);
    return record;
  }

  get(jobId: string): ImportJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  update(jobId: string, patch: JobUpdate): void {
    const record = this.jobs.get(jobId);
    if (!record || isTerminal(record)) return;
    Object.assign(record, patch);
    const snapshot = toSnapshot(record);
    for (const listener of this.listeners.get(jobId) ?? []) {
      try {
        listener(snapshot);
      } catch (err) {
        // One broken subscriber (e.g. a half-closed socket) must not block
        // the update or the other listeners.
        this.logger.warn({ err, jobId }, "Job listener threw");
      }
    }
  }

  subscribe(jobId: string, listener: JobListener): () => void {
    let set = this.listeners.get(jobId);
    if (!set) {
      set = new Set();
      this.listeners.set(jobId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(jobId);
    };
  }

  countActive(): number {
    let active = 0;
    for (const record of this.jobs.values()) {
      if (!isTerminal(record)) active += 1;
    }
    return active;
  }

  dispose(): void {
    clearInterval(this.sweeper);
    // Graceful shutdown: stop in-flight pipelines from spending tokens.
    for (const record of this.jobs.values()) {
      if (!isTerminal(record)) {
        record.abort.abort();
      }
    }
  }

  private sweep(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, record] of this.jobs) {
      if (record.createdAt.getTime() > cutoff) continue;

      if (isTerminal(record)) {
        this.jobs.delete(id);
        this.listeners.delete(id);
        this.logger.debug({ jobId: id }, "Swept expired job");
        continue;
      }
      // A job still running past its TTL is failed, not deleted: subscribers
      // must receive a terminal event (deleting silently would leave SSE
      // clients on heartbeats forever). The record itself — now terminal and
      // still past the cutoff — is deleted on the next sweep.
      this.logger.warn({ jobId: id }, "Job exceeded its TTL while running — cancelling");
      this.update(id, {
        status: "failed",
        error: `Import exceeded the ${Math.round(this.ttlMs / 60_000)} minute job time limit and was cancelled`,
      });
      record.abort.abort();
    }
  }
}
