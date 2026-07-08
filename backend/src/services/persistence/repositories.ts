import { eq } from "drizzle-orm";
import type {
  FailedRow,
  ImportJobSnapshot,
  ImportResult,
  MappedLead,
} from "@groweasy/shared";
import type { Db } from "../../db/client";
import {
  crmRecords,
  failedRecords,
  importJobs,
  type CrmRecordInsert,
  type FailedRecordInsert,
} from "../../db/schema";
import type { JobStatusMirror } from "./import-persistence";

/**
 * Repositories: one per table, speaking only domain types — no Drizzle in
 * any signature, so callers (and their tests) stay database-agnostic.
 *
 * The Drizzle implementations are scoped to an EXECUTOR at construction:
 * either the root connection or a live transaction handle. That is what lets
 * the persistence gateway compose several repositories inside one atomic
 * transaction without transaction-plumbing leaking into the interfaces.
 */

/** The root Drizzle db or a transaction handle — both run the same queries. */
export type DbExecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Rows per INSERT — well inside Postgres's 65k bind-parameter ceiling. */
const INSERT_CHUNK = 1_000;

// ─── import_jobs ─────────────────────────────────────────────

export interface ImportJobsRepository {
  /** Upsert a lifecycle transition (queued/parsing/mapping/failed). */
  upsertStatus(jobId: string, mirror: JobStatusMirror, at: Date): Promise<void>;
  /** Upsert the terminal success state with the full result document. */
  upsertCompleted(jobId: string, result: ImportResult, at: Date): Promise<void>;
  findSnapshot(jobId: string): Promise<ImportJobSnapshot | null>;
  findResult(jobId: string): Promise<ImportResult | null>;
}

export class DrizzleImportJobsRepository implements ImportJobsRepository {
  constructor(private readonly db: DbExecutor) {}

  async upsertStatus(jobId: string, mirror: JobStatusMirror, at: Date): Promise<void> {
    const row = {
      status: mirror.status,
      progress: mirror.progress,
      error: mirror.error ?? null,
      updatedAt: at,
    };
    await this.db
      .insert(importJobs)
      .values({ id: jobId, ...row })
      .onConflictDoUpdate({ target: importJobs.id, set: row });
  }

  async upsertCompleted(jobId: string, result: ImportResult, at: Date): Promise<void> {
    const row = {
      status: "completed" as const,
      progress: finalProgress(result),
      error: null,
      result,
      updatedAt: at,
      completedAt: at,
    };
    await this.db
      .insert(importJobs)
      .values({ id: jobId, ...row })
      .onConflictDoUpdate({ target: importJobs.id, set: row });
  }

  async findSnapshot(jobId: string): Promise<ImportJobSnapshot | null> {
    const row = (
      await this.db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1)
    )[0];
    if (!row) return null;
    return {
      jobId: row.id,
      status: row.status,
      progress: row.progress,
      ...(row.error !== null ? { error: row.error } : {}),
      ...(row.result ? { stats: row.result.stats } : {}),
    };
  }

  async findResult(jobId: string): Promise<ImportResult | null> {
    const row = (
      await this.db.select().from(importJobs).where(eq(importJobs.id, jobId)).limit(1)
    )[0];
    return row?.status === "completed" && row.result ? row.result : null;
  }
}

// ─── crm_records ─────────────────────────────────────────────

export interface CrmRecordsRepository {
  /** Idempotent: replaces the job's records — a retry can never duplicate. */
  replaceForJob(jobId: string, records: MappedLead[]): Promise<void>;
}

export class DrizzleCrmRecordsRepository implements CrmRecordsRepository {
  constructor(private readonly db: DbExecutor) {}

  async replaceForJob(jobId: string, records: MappedLead[]): Promise<void> {
    await this.db.delete(crmRecords).where(eq(crmRecords.jobId, jobId));
    for (const chunk of chunked(records.map(toRecordInsert(jobId)))) {
      await this.db.insert(crmRecords).values(chunk);
    }
  }
}

// ─── failed_records ──────────────────────────────────────────

export interface FailedRecordsRepository {
  /** Idempotent: replaces the job's failures — a retry can never duplicate. */
  replaceForJob(jobId: string, failures: FailedRow[]): Promise<void>;
}

export class DrizzleFailedRecordsRepository implements FailedRecordsRepository {
  constructor(private readonly db: DbExecutor) {}

  async replaceForJob(jobId: string, failures: FailedRow[]): Promise<void> {
    await this.db.delete(failedRecords).where(eq(failedRecords.jobId, jobId));
    for (const chunk of chunked(failures.map(toFailedInsert(jobId)))) {
      await this.db.insert(failedRecords).values(chunk);
    }
  }
}

// ─── row mappers (exported for tests) ────────────────────────

export function toRecordInsert(jobId: string): (lead: MappedLead) => CrmRecordInsert {
  return (lead) => ({
    jobId,
    rowIndex: lead.rowIndex,
    leadCreatedAt: lead.created_at,
    name: lead.name,
    email: lead.email,
    countryCode: lead.country_code,
    mobileWithoutCountryCode: lead.mobile_without_country_code,
    company: lead.company,
    city: lead.city,
    state: lead.state,
    country: lead.country,
    leadOwner: lead.lead_owner,
    crmStatus: lead.crm_status,
    crmNote: lead.crm_note,
    dataSource: lead.data_source,
    possessionTime: lead.possession_time,
    description: lead.description,
    confidence: lead.confidence,
  });
}

export function toFailedInsert(jobId: string): (row: FailedRow) => FailedRecordInsert {
  return (row) => ({
    jobId,
    rowIndex: row.rowIndex,
    message: row.message,
    raw: row.raw,
  });
}

export function finalProgress(result: ImportResult) {
  return {
    totalRows: result.stats.totalRows,
    processedRows: result.stats.totalRows,
    skippedRows: result.stats.skipped,
    failedRows: result.stats.failed,
    currentBatch: result.stats.batches,
    totalBatches: result.stats.batches,
  };
}

export function* chunked<T>(items: T[], size: number = INSERT_CHUNK): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) {
    yield items.slice(i, i + size);
  }
}
