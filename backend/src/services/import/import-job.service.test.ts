import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import type { ImportJobStatus, ImportResult } from "@groweasy/shared";
import type { StoredFile } from "../../types/files";
import { AppError, NotFoundError } from "../../utils/errors";
import type { FileStorage } from "../files/file-storage.service";
import { InMemoryJobStore } from "../jobs/job-store";
import {
  NoopImportPersistence,
  type ImportPersistence,
  type JobStatusMirror,
} from "../persistence/import-persistence";
import { ImportJobService, type ImportRunner } from "./import-job.service";

const logger = pino({ level: "silent" });

const OPTIONS = {
  maxConcurrentJobs: 4,
  persistRetry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 },
};

const NOOP = new NoopImportPersistence();

/** Records every persistence interaction; can fail saves N times. */
class FakePersistence implements ImportPersistence {
  readonly enabled = true;
  mirrors: Array<{ jobId: string } & JobStatusMirror> = [];
  saved: Array<{ jobId: string; result: ImportResult }> = [];
  failSaves = 0;
  onSave: (() => void) | undefined;

  mirrorStatus(jobId: string, mirror: JobStatusMirror): void {
    this.mirrors.push({ jobId, ...mirror });
  }

  async saveCompleted(jobId: string, result: ImportResult): Promise<void> {
    this.onSave?.();
    if (this.failSaves > 0) {
      this.failSaves -= 1;
      throw new Error("database unavailable");
    }
    this.saved.push({ jobId, result });
  }

  async loadSnapshot(): Promise<null> {
    return null;
  }

  async loadResult(): Promise<null> {
    return null;
  }

  async dispose(): Promise<void> {}
}

const RESULT: ImportResult = {
  records: [],
  skipped: [],
  errors: [],
  warnings: [],
  stats: {
    totalRows: 3,
    imported: 2,
    skipped: 1,
    failed: 0,
    warnings: 0,
    batches: 1,
    durationMs: 5,
  },
};

function fakeFiles(stored?: Partial<StoredFile>): FileStorage & { removed: string[] } {
  const file: StoredFile = {
    id: "f-1",
    path: "/tmp/f-1.csv",
    originalName: "leads.csv",
    sizeBytes: 10,
    uploadedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    ...stored,
  };
  const removed: string[] = [];
  return {
    removed,
    register: () => file,
    get: (id) => (id === file.id ? file : undefined),
    remove: async (id) => {
      removed.push(id);
    },
    dispose: () => {},
  };
}

/** Resolves when the job reaches a terminal status. */
function waitForTerminal(store: InMemoryJobStore, jobId: string): Promise<ImportJobStatus> {
  return new Promise((resolve) => {
    store.subscribe(jobId, (snap) => {
      if (snap.status === "completed" || snap.status === "failed") resolve(snap.status);
    });
  });
}

describe("ImportJobService", () => {
  it("rejects unknown file ids before creating a job", () => {
    const store = new InMemoryJobStore(60_000, logger);
    const service = new ImportJobService(
      fakeFiles(),
      store,
      () => ({ run: vi.fn() }),
      NOOP,
      OPTIONS,
      logger,
    );

    expect(() => service.start("00000000-0000-4000-8000-000000000000")).toThrow(NotFoundError);
    store.dispose();
  });

  it("surfaces a misconfigured provider as 503 at start time, not a failed job", () => {
    const store = new InMemoryJobStore(60_000, logger);
    const service = new ImportJobService(
      fakeFiles(),
      store,
      () => {
        throw new Error("OPENAI_API_KEY is required");
      },
      NOOP,
      OPTIONS,
      logger,
    );

    try {
      service.start("f-1");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(503);
      expect((err as AppError).message).toMatch(/OPENAI_API_KEY/);
    }
    store.dispose();
  });

  it("runs the pipeline in the background and completes the job", async () => {
    const store = new InMemoryJobStore(60_000, logger);
    const files = fakeFiles();
    const runner: ImportRunner = {
      run: async (_path, hooks) => {
        hooks?.onProgress?.({
          phase: "mapping",
          totalRows: 3,
          processedRows: 2,
          skippedRows: 1,
          failedRows: 0,
          currentBatch: 1,
          totalBatches: 1,
        });
        return RESULT;
      },
    };
    const service = new ImportJobService(files, store, () => runner, NOOP, OPTIONS, logger);

    const snapshot = service.start("f-1");
    expect(snapshot.status).toBe("queued"); // 202 semantics: accepted, not run

    await waitForTerminal(store, snapshot.jobId);
    const job = store.get(snapshot.jobId);
    expect(job?.status).toBe("completed");
    expect(job?.result?.stats.imported).toBe(2);
    expect(job?.progress.processedRows).toBe(3); // final progress = totals
    expect(files.removed).toEqual(["f-1"]); // upload consumed
    store.dispose();
  });

  it("marks the job failed when the pipeline throws — never crashes the process", async () => {
    const store = new InMemoryJobStore(60_000, logger);
    const service = new ImportJobService(
      fakeFiles(),
      store,
      () => ({
        run: async () => {
          throw new Error("provider exploded");
        },
      }),
      NOOP,
      OPTIONS,
      logger,
    );

    const snapshot = service.start("f-1");
    const status = await waitForTerminal(store, snapshot.jobId);

    expect(status).toBe("failed");
    expect(store.get(snapshot.jobId)?.error).toMatch(/provider exploded/);
    store.dispose();
  });

  it("memoizes the runner after the first successful creation", () => {
    const store = new InMemoryJobStore(60_000, logger);
    const factory = vi.fn((): ImportRunner => ({ run: async () => RESULT }));
    const service = new ImportJobService(fakeFiles(), store, factory, NOOP, OPTIONS, logger);

    service.start("f-1");
    service.start("f-1");

    expect(factory).toHaveBeenCalledTimes(1);
    store.dispose();
  });

  it("rejects starts beyond maxConcurrentJobs with 429", () => {
    const store = new InMemoryJobStore(60_000, logger);
    // A runner that never resolves keeps the first job active.
    const service = new ImportJobService(
      fakeFiles(),
      store,
      () => ({ run: () => new Promise<ImportResult>(() => {}) }),
      NOOP,
      { maxConcurrentJobs: 1 },
      logger,
    );

    service.start("f-1");
    try {
      service.start("f-1");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(429);
    }
    store.dispose();
  });

  it("cancel aborts the pipeline and emits exactly one terminal event", async () => {
    const store = new InMemoryJobStore(60_000, logger);
    let jobSignal: AbortSignal | undefined;
    const service = new ImportJobService(
      fakeFiles(),
      store,
      () => ({
        run: (_path, hooks) =>
          new Promise<ImportResult>((_resolve, reject) => {
            jobSignal = hooks?.signal;
            hooks?.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      }),
      NOOP,
      OPTIONS,
      logger,
    );

    const snapshot = service.start("f-1");
    const terminalEvents: string[] = [];
    store.subscribe(snapshot.jobId, (snap) => {
      if (snap.status === "failed" || snap.status === "completed") terminalEvents.push(snap.status);
    });

    const cancelled = service.cancel(snapshot.jobId);
    expect(cancelled.status).toBe("failed");
    expect(cancelled.error).toMatch(/cancelled/i);
    expect(jobSignal?.aborted).toBe(true);

    // Let the aborted pipeline's rejection flow through execute()'s catch —
    // the store's terminal guard must swallow that second patch.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(terminalEvents).toEqual(["failed"]);

    // Idempotent: cancelling again returns the same terminal snapshot.
    expect(service.cancel(snapshot.jobId).status).toBe("failed");
    store.dispose();
  });

  it("persists the finished import BEFORE the job may claim completed", async () => {
    const store = new InMemoryJobStore(60_000, logger);
    const persistence = new FakePersistence();
    const tick = {
      totalRows: 3,
      skippedRows: 1,
      failedRows: 0,
      totalBatches: 2,
    };
    const runner: ImportRunner = {
      run: async (_path, hooks) => {
        hooks?.onProgress?.({ phase: "mapping", processedRows: 1, currentBatch: 1, ...tick });
        hooks?.onProgress?.({ phase: "mapping", processedRows: 2, currentBatch: 2, ...tick });
        return RESULT;
      },
    };
    const service = new ImportJobService(
      fakeFiles(),
      store,
      () => runner,
      persistence,
      OPTIONS,
      logger,
    );

    const snapshot = service.start("f-1");
    let statusDuringSave: ImportJobStatus | undefined;
    persistence.onSave = () => {
      statusDuringSave = store.get(snapshot.jobId)?.status;
    };

    const status = await waitForTerminal(store, snapshot.jobId);
    expect(status).toBe("completed");
    expect(persistence.saved).toEqual([{ jobId: snapshot.jobId, result: RESULT }]);
    // The durability gate: not yet "completed" while the write runs.
    expect(statusDuringSave).not.toBe("completed");
    // Lifecycle TRANSITIONS were mirrored — two mapping ticks, one mirror.
    expect(persistence.mirrors.map((m) => m.status)).toEqual(["queued", "parsing", "mapping"]);
    store.dispose();
  });

  it("retries a transient persistence failure, then completes", async () => {
    const store = new InMemoryJobStore(60_000, logger);
    const persistence = new FakePersistence();
    persistence.failSaves = 1; // first write fails, retry succeeds
    const service = new ImportJobService(
      fakeFiles(),
      store,
      () => ({ run: async () => RESULT }),
      persistence,
      OPTIONS,
      logger,
    );

    const snapshot = service.start("f-1");
    const status = await waitForTerminal(store, snapshot.jobId);

    expect(status).toBe("completed");
    expect(persistence.saved).toHaveLength(1);
    store.dispose();
  });

  it("fails the job (with the upload retained) when persistence is down for good", async () => {
    const store = new InMemoryJobStore(60_000, logger);
    const files = fakeFiles();
    const persistence = new FakePersistence();
    persistence.failSaves = Number.POSITIVE_INFINITY;
    const service = new ImportJobService(
      files,
      store,
      () => ({ run: async () => RESULT }),
      persistence,
      OPTIONS,
      logger,
    );

    const snapshot = service.start("f-1");
    const status = await waitForTerminal(store, snapshot.jobId);

    expect(status).toBe("failed");
    expect(store.get(snapshot.jobId)?.error).toMatch(/could not be persisted/i);
    // "Completed" must mean durable — nothing was saved, nothing claims success.
    expect(persistence.saved).toHaveLength(0);
    // The consumed-upload cleanup must not run: the file is still importable.
    expect(files.removed).toEqual([]);
    expect(persistence.mirrors.at(-1)?.status).toBe("failed");
    store.dispose();
  });

  it("cancel of an unknown job throws NotFoundError", () => {
    const store = new InMemoryJobStore(60_000, logger);
    const service = new ImportJobService(
      fakeFiles(),
      store,
      () => ({ run: async () => RESULT }),
      NOOP,
      OPTIONS,
      logger,
    );
    expect(() => service.cancel("nope")).toThrow(NotFoundError);
    store.dispose();
  });
});
