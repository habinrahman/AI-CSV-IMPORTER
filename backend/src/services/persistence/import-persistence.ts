import type { ImportJobProgress, ImportJobSnapshot, ImportResult } from "@groweasy/shared";

/** A lifecycle transition worth mirroring to durable storage. */
export interface JobStatusMirror {
  status: "queued" | "parsing" | "mapping" | "failed";
  progress: ImportJobProgress;
  error?: string;
}

/**
 * Durable storage seam for import jobs and CRM records (Supabase/Drizzle in
 * production, no-op when no DATABASE_URL is configured).
 *
 * Two deliberately different durability tiers:
 *
 *  - `mirrorStatus` is FIRE-AND-FORGET: live progress must never stall or
 *    fail because the database hiccuped. Implementations swallow + log.
 *  - `saveCompleted` THROWS on failure and is awaited BEFORE the job is
 *    reported complete: if a CRM database is configured, "completed" must
 *    mean the records actually landed in it — anything else is a lie the
 *    user discovers weeks later.
 */
export interface ImportPersistence {
  /** True when a real database is behind this (drives log/docs behavior). */
  readonly enabled: boolean;
  /** Mirror a lifecycle transition. Never throws; never awaited. */
  mirrorStatus(jobId: string, mirror: JobStatusMirror): void;
  /**
   * Durably persist the finished import: the job row (with the full result
   * document) and every mapped lead as a queryable CRM record. Idempotent —
   * safe to retry after a partial failure.
   */
  saveCompleted(jobId: string, result: ImportResult): Promise<void>;
  /** Restart/TTL fallback for GET /api/imports/:id. */
  loadSnapshot(jobId: string): Promise<ImportJobSnapshot | null>;
  /** Restart/TTL fallback for GET /api/imports/:id/result. */
  loadResult(jobId: string): Promise<ImportResult | null>;
  /** Graceful shutdown (drain connection pools). */
  dispose(): Promise<void>;
}

/** In-memory mode: the documented single-instance default. */
export class NoopImportPersistence implements ImportPersistence {
  readonly enabled = false;

  mirrorStatus(): void {}

  async saveCompleted(): Promise<void> {}

  async loadSnapshot(): Promise<ImportJobSnapshot | null> {
    return null;
  }

  async loadResult(): Promise<ImportResult | null> {
    return null;
  }

  async dispose(): Promise<void> {}
}
