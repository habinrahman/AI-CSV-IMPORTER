import type { ImportJobSnapshot, ImportResult } from "@groweasy/shared";
import type { createDb } from "../../db/client";
import type { Logger } from "../../logger";
import type { ImportPersistence, JobStatusMirror } from "./import-persistence";
import {
  DrizzleCrmRecordsRepository,
  DrizzleFailedRecordsRepository,
  DrizzleImportJobsRepository,
} from "./repositories";

/**
 * Supabase (Postgres) persistence gateway, composed from one repository per
 * table (import_jobs / crm_records / failed_records). See ImportPersistence
 * for the durability contract: status mirroring is best-effort; saveCompleted
 * runs the three repositories inside ONE transaction — the job row, its CRM
 * records, and its failed rows land together or not at all, and every
 * repository write is delete-then-insert keyed by jobId, so a retry after a
 * partial failure can never duplicate rows.
 */
export class DrizzleImportPersistence implements ImportPersistence {
  readonly enabled = true;

  /** Non-transactional reads/mirrors run on the root connection. */
  private readonly jobs: DrizzleImportJobsRepository;

  constructor(
    private readonly conn: ReturnType<typeof createDb>,
    private readonly logger: Logger,
  ) {
    this.jobs = new DrizzleImportJobsRepository(conn.db);
  }

  mirrorStatus(jobId: string, mirror: JobStatusMirror): void {
    void this.jobs.upsertStatus(jobId, mirror, new Date()).catch((err: unknown) => {
      this.logger.warn({ err, jobId }, "Failed to mirror job status to the database");
    });
  }

  async saveCompleted(jobId: string, result: ImportResult): Promise<void> {
    const now = new Date();
    await this.conn.db.transaction(async (tx) => {
      // Repositories scoped to this transaction: one atomic unit of work.
      await new DrizzleImportJobsRepository(tx).upsertCompleted(jobId, result, now);
      await new DrizzleCrmRecordsRepository(tx).replaceForJob(jobId, result.records);
      await new DrizzleFailedRecordsRepository(tx).replaceForJob(jobId, result.errors);
    });
    this.logger.info(
      { jobId, records: result.records.length, failed: result.errors.length },
      "Import persisted to the CRM database",
    );
  }

  loadSnapshot(jobId: string): Promise<ImportJobSnapshot | null> {
    return this.jobs.findSnapshot(jobId);
  }

  loadResult(jobId: string): Promise<ImportResult | null> {
    return this.jobs.findResult(jobId);
  }

  async dispose(): Promise<void> {
    await this.conn.close();
  }
}
