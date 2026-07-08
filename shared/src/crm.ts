import { z } from "zod";

/**
 * GrowEasy CRM schema — the frozen business contract (docs/ARCHITECTURE.md §2).
 * Both the AI prompt and the post-hoc validation are generated from these
 * definitions; nothing else in the system may restate them.
 */

export const CRM_STATUSES = [
  "GOOD_LEAD_FOLLOW_UP",
  "DID_NOT_CONNECT",
  "BAD_LEAD",
  "SALE_DONE",
] as const;

export const CrmStatusSchema = z.enum(CRM_STATUSES);
export type CrmStatus = z.infer<typeof CrmStatusSchema>;

export const DATA_SOURCES = [
  "leads_on_demand",
  "meridian_tower",
  "eden_park",
  "varah_swamy",
  "sarjapur_plots",
] as const;

export const DataSourceSchema = z.enum(DATA_SOURCES);
export type DataSource = z.infer<typeof DataSourceSchema>;

/**
 * The full GrowEasy CRM record (assignment spec). Only email/mobile decide
 * the skip rule — every other field is best-effort: extracted when the row
 * carries it, "" (or null status) when it doesn't.
 */
export const CrmLeadSchema = z.object({
  /** Lead creation date — must be convertible with `new Date(created_at)`. */
  created_at: z.string(),
  /** Full name, whitespace-normalized. */
  name: z.string(),
  /** Primary email, lowercased + trimmed; additional emails live in crm_note. */
  email: z.string(),
  /** Calling code of the primary mobile, "+91" form; "" when no mobile. */
  country_code: z.string(),
  /** Primary mobile's national number (digits only); extras live in crm_note. */
  mobile_without_country_code: z.string(),
  /** Company / organization / employer. */
  company: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  /** Owner / assigned agent — any identifier the source uses (name, email). */
  lead_owner: z.string(),
  /** Inferred only from row evidence; null when the row carries no signal. */
  crm_status: CrmStatusSchema.nullable(),
  /** Merged remarks, extra emails/phones, and unmapped-but-useful context. */
  crm_note: z.string(),
  /** Set only when confidently inferred; empty string otherwise. */
  data_source: DataSourceSchema.or(z.literal("")),
  /** Property possession time (real-estate sources). */
  possession_time: z.string(),
  /** Longer free-form description distinct from call remarks. */
  description: z.string(),
});

export type CrmLead = z.infer<typeof CrmLeadSchema>;

/** A successfully mapped record as returned by the import result endpoint. */
export type MappedLead = CrmLead & {
  /** 0-based index of the source row in the uploaded CSV. */
  rowIndex: number;
  /** Model confidence in the mapping, 0–1. */
  confidence: number;
};

/** A row excluded by the business skip rule — correct behavior, not an error. */
export interface SkippedRow {
  rowIndex: number;
  reason: string;
  raw: Record<string, string>;
}

/** A row that failed mapping/validation after the retry budget was exhausted. */
export interface FailedRow {
  rowIndex: number;
  message: string;
  raw: Record<string, string>;
}

/**
 * A non-fatal flag on an imported row (shape issue, discarded invalid value,
 * low confidence). Warnings ride alongside the audit invariant — the row
 * still counts as imported.
 */
export interface RowWarning {
  rowIndex: number;
  message: string;
}

/**
 * Aggregate statistics for a completed import job. A Zod schema (not just an
 * interface) so clients can runtime-validate what they receive over the wire.
 */
export const ImportStatsSchema = z.object({
  totalRows: z.number(),
  imported: z.number(),
  skipped: z.number(),
  failed: z.number(),
  warnings: z.number(),
  batches: z.number(),
  durationMs: z.number(),
  /** Total AI tokens the run consumed (absent when the vendor reports none). */
  tokens: z.object({ prompt: z.number(), completion: z.number() }).optional(),
});

export type ImportStats = z.infer<typeof ImportStatsSchema>;

/**
 * The complete outcome of an import run. Audit invariant:
 * totalRows === imported + skipped + failed — every source row is accounted
 * for in exactly one bucket; warnings are an additional channel, not a bucket.
 */
export interface ImportResult {
  records: MappedLead[];
  skipped: SkippedRow[];
  errors: FailedRow[];
  warnings: RowWarning[];
  stats: ImportStats;
}
