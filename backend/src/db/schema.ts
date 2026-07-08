import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { ImportJobProgress, ImportResult } from "@groweasy/shared";

/**
 * Drizzle schema for the Supabase (Postgres) persistence layer.
 *
 * Three tables, three jobs:
 *  - import_jobs    — the durable record of every import run (status, progress,
 *    the full result document). Lets results outlive restarts and TTL sweeps.
 *  - crm_records    — the imported records in queryable, normalized columns:
 *    this is the CRM destination, not an audit log.
 *  - failed_records — per-row failures with their original data, queryable
 *    without unpacking the result document (triage/re-import workflows).
 *
 * Enum values mirror @groweasy/shared. Postgres enums give DB-level integrity;
 * the Zod layer remains the authority at the application boundary.
 */

export const importJobStatus = pgEnum("import_job_status", [
  "queued",
  "parsing",
  "mapping",
  "completed",
  "failed",
]);

export const crmLeadStatus = pgEnum("crm_lead_status", [
  "GOOD_LEAD_FOLLOW_UP",
  "DID_NOT_CONNECT",
  "BAD_LEAD",
  "SALE_DONE",
]);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey(),
    status: importJobStatus("status").notNull(),
    progress: jsonb("progress").$type<ImportJobProgress>().notNull(),
    error: text("error"),
    /**
     * The complete ImportResult (records + skipped + errors + warnings + stats)
     * as one document — bounded by the 5 MB upload cap, and exactly what the
     * result endpoint needs to serve a finished job after a restart.
     */
    result: jsonb("result").$type<ImportResult>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    // "Recent imports" listings and retention jobs scan newest-first.
    // Deliberately NO index on status: five enum values over a small table —
    // the planner would ignore it; add a partial index if a hot status query
    // ever ships.
    index("import_jobs_created_at_idx").on(table.createdAt.desc()),
  ],
);

export const crmRecords = pgTable(
  "crm_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    /** The LEAD's creation date (spec field) — this row's own insert time is created_at. */
    leadCreatedAt: text("lead_created_at").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    countryCode: text("country_code").notNull(),
    mobileWithoutCountryCode: text("mobile_without_country_code").notNull(),
    company: text("company").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    country: text("country").notNull(),
    leadOwner: text("lead_owner").notNull(),
    crmStatus: crmLeadStatus("crm_status"),
    crmNote: text("crm_note").notNull(),
    /** Enum value or "" (unconfident) — text because "" is not an enum label. */
    dataSource: text("data_source").notNull(),
    possessionTime: text("possession_time").notNull(),
    description: text("description").notNull(),
    confidence: real("confidence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Records are read (and idempotently replaced) by job — and Postgres
    // does not index FK columns automatically.
    index("crm_records_job_id_idx").on(table.jobId),
    // "Does this lead already exist?" is the CRM's canonical lookup — the
    // natural next feature (cross-import dedup) needs it on day one.
    // No status index on purpose: 4-value enum, planner would seq-scan anyway.
    index("crm_records_email_idx").on(table.email),
  ],
);

export const failedRecords = pgTable(
  "failed_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    /** Why the row failed (retries + bisection exhausted). */
    message: text("message").notNull(),
    /** The original CSV cells, so a failed row is re-importable as-is. */
    raw: jsonb("raw").$type<Record<string, string>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("failed_records_job_id_idx").on(table.jobId)],
);

export type ImportJobRow = typeof importJobs.$inferSelect;
export type CrmRecordInsert = typeof crmRecords.$inferInsert;
export type FailedRecordInsert = typeof failedRecords.$inferInsert;
