import type { ImportJobProgress, ImportJobSnapshot, ImportResult } from "@groweasy/shared";
import type { Logger } from "../../logger";
import type { StoredFile } from "../../types/files";
import { AppError, NotFoundError } from "../../utils/errors";
import { isAbortError, withRetry, type RetryPolicy } from "../ai/retry";
import type { FileStorage } from "../files/file-storage.service";
import type { JobStore } from "../jobs/job-store";
import { toSnapshot } from "../jobs/job-store";
import type { ImportPersistence } from "../persistence/import-persistence";
import type { PipelineHooks } from "./import-pipeline";

/** Retry budget for the final durable write — transient DB blips, not outages. */
const DEFAULT_PERSIST_RETRY: RetryPolicy = { maxRetries: 2, baseDelayMs: 500, maxDelayMs: 5_000 };

/** Structural seam over ImportPipeline so tests can hand in a fake runner. */
export interface ImportRunner {
  run(filePath: string, hooks?: PipelineHooks): Promise<ImportResult>;
}

export interface ImportJobServiceOptions {
  /**
   * Ceiling on simultaneously running pipelines. Each active job costs
   * memory for its rows/result plus AI_CONCURRENCY provider calls — without
   * a cap, a burst of starts multiplies into a rate-limit death spiral and
   * unbounded heap growth. Excess starts are rejected with 429.
   */
  maxConcurrentJobs: number;
  /** Override of the durable-write retry policy (tests use instant delays). */
  persistRetry?: RetryPolicy;
}

/**
 * Owns the job lifecycle: accept → run the pipeline in the background →
 * stream state into the JobStore (which fans out to SSE subscribers).
 *
 * The pipeline is created lazily and memoized: the server must boot (and
 * serve upload/preview) without an AI key, but the first import attempt
 * surfaces a clear 503 when the provider is unconfigured.
 */
export class ImportJobService {
  private runner: ImportRunner | null = null;

  constructor(
    private readonly files: FileStorage,
    private readonly jobs: JobStore,
    private readonly runnerFactory: () => ImportRunner,
    private readonly persistence: ImportPersistence,
    private readonly options: ImportJobServiceOptions,
    private readonly logger: Logger,
  ) {}

  start(fileId: string): ImportJobSnapshot {
    if (this.jobs.countActive() >= this.options.maxConcurrentJobs) {
      throw new AppError(
        429,
        `Too many imports are running (limit ${this.options.maxConcurrentJobs}) — wait for one to finish and try again`,
      );
    }

    const stored = this.files.get(fileId);
    if (!stored) {
      throw new NotFoundError(
        `No uploaded file found for id "${fileId}" — it may have expired; upload again`,
      );
    }
    // Resolve the runner BEFORE creating a job: a misconfigured provider
    // must fail the request, not produce a background-failed job.
    const runner = this.getRunner();

    const job = this.jobs.create();
    // Snapshot BEFORE launching: execute() runs synchronously up to its
    // first await and may have advanced the status already — the caller
    // must see the job as it was accepted.
    const accepted = toSnapshot(job);
    this.persistence.mirrorStatus(job.id, { status: "queued", progress: accepted.progress });
    void this.execute(runner, job.id, stored);
    return accepted;
  }

  /**
   * Cancel a running job. Marks it failed FIRST (subscribers get exactly one
   * terminal event — the store ignores the abort handler's later patch), then
   * aborts the pipeline so it stops spending tokens. Idempotent: cancelling a
   * terminal job returns its snapshot unchanged.
   */
  cancel(jobId: string): ImportJobSnapshot {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundError(`No import job found for id "${jobId}"`);
    }
    this.jobs.update(jobId, { status: "failed", error: "Import was cancelled" });
    job.abort.abort();
    this.persistence.mirrorStatus(jobId, {
      status: "failed",
      progress: job.progress,
      error: "Import was cancelled",
    });
    return toSnapshot(job);
  }

  /** Restart/TTL fallback: a job no longer in memory may still be on disk. */
  loadPersistedSnapshot(jobId: string): Promise<ImportJobSnapshot | null> {
    return this.persistence.loadSnapshot(jobId);
  }

  loadPersistedResult(jobId: string): Promise<ImportResult | null> {
    return this.persistence.loadResult(jobId);
  }

  private getRunner(): ImportRunner {
    if (this.runner) return this.runner;
    try {
      this.runner = this.runnerFactory();
      return this.runner;
    } catch (err) {
      throw new AppError(
        503,
        `AI provider is not configured: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async execute(runner: ImportRunner, jobId: string, stored: StoredFile): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Mirror lifecycle TRANSITIONS to durable storage, not every progress
    // tick — batches can fire dozens of updates a second and the database
    // is the system of record, not a live progress channel (SSE is).
    let mirrored: "queued" | "parsing" | "mapping" = "queued";

    try {
      this.jobs.update(jobId, { status: "parsing" });
      this.persistence.mirrorStatus(jobId, { status: "parsing", progress: job.progress });
      mirrored = "parsing";

      const result = await runner.run(stored.path, {
        signal: job.abort.signal,
        onProgress: (p) => {
          const progress: ImportJobProgress = {
            totalRows: p.totalRows,
            processedRows: p.processedRows,
            skippedRows: p.skippedRows,
            failedRows: p.failedRows,
            currentBatch: p.currentBatch,
            totalBatches: p.totalBatches,
          };
          this.jobs.update(jobId, { status: p.phase, progress });
          if (p.phase !== mirrored) {
            this.persistence.mirrorStatus(jobId, { status: p.phase, progress });
            mirrored = p.phase;
          }
        },
      });

      // Durability gate: when a CRM database is configured, the records must
      // land in it BEFORE the job may claim success. Retried for transient
      // blips; aborts pass through to the cancellation path below.
      try {
        await withRetry(() => this.persistence.saveCompleted(jobId, result), {
          policy: this.options.persistRetry ?? DEFAULT_PERSIST_RETRY,
          isRetryable: (err) => !isAbortError(err),
          onRetry: (err, attempt, delayMs) => {
            this.logger.warn({ err, jobId, attempt, delayMs }, "Retrying CRM persistence");
          },
          signal: job.abort.signal,
        });
      } catch (err) {
        if (isAbortError(err)) throw err;
        const reason = err instanceof Error ? err.message : String(err);
        const message = `Import mapped ${result.stats.imported} records, but they could not be persisted to the CRM database: ${reason}`;
        this.jobs.update(jobId, { status: "failed", error: message });
        this.persistence.mirrorStatus(jobId, {
          status: "failed",
          progress: job.progress,
          error: message,
        });
        this.logger.error({ err, jobId }, "Import persistence failed after retries");
        return;
      }

      this.jobs.update(jobId, {
        status: "completed",
        result,
        progress: {
          totalRows: result.stats.totalRows,
          processedRows: result.stats.totalRows,
          skippedRows: result.stats.skipped,
          failedRows: result.stats.failed,
          currentBatch: result.stats.batches,
          totalBatches: result.stats.batches,
        },
      });
      // The upload is consumed; don't leave lead data on disk longer than needed.
      await this.files.remove(stored.id);
      this.logger.info({ jobId, stats: result.stats }, "Import job completed");
    } catch (err) {
      const message = isAbortError(err)
        ? "Import was cancelled"
        : err instanceof Error
          ? err.message
          : String(err);
      this.jobs.update(jobId, { status: "failed", error: message });
      this.persistence.mirrorStatus(jobId, {
        status: "failed",
        progress: job.progress,
        error: message,
      });
      this.logger.error({ err, jobId }, "Import job failed");
    }
  }
}
