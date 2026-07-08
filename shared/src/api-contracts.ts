import { z } from "zod";

/**
 * HTTP contracts shared by frontend and backend.
 * The backend implements these; the frontend consumes them — neither side may drift.
 */

/** Standard error envelope returned by every non-2xx response. */
export interface ApiErrorResponse {
  error: {
    message: string;
    /** Correlation id — matches the X-Request-Id header and server logs. */
    requestId?: string;
    details?: unknown;
  };
}

/** GET /api/health */
export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  timestamp: string;
}

/**
 * POST /api/upload — 201.
 * Zod schema so browsers can validate the wire shape before trusting it
 * (a 2xx body that violates the contract must fail loudly, not corrupt UI).
 */
export const UploadResponseSchema = z.object({
  fileId: z.string(),
  filename: z.string(),
  sizeBytes: z.number(),
  uploadedAt: z.string(),
  /** Uploads are temporary; the file is deleted after this instant. */
  expiresAt: z.string(),
});

export type UploadResponse = z.infer<typeof UploadResponseSchema>;

/** POST /api/parse — request body */
export interface ParseRequestBody {
  fileId: string;
  /** Rows to include in the preview (default 20, max 100). */
  previewRows?: number;
}

/** POST /api/parse — 200 */
export interface ParseResponse {
  fileId: string;
  filename: string;
  headers: string[];
  /** First N data rows, keyed by header. */
  rows: Record<string, string>[];
  /** Total data rows in the file (excludes the header row). */
  totalRows: number;
}

// ─── Import jobs ─────────────────────────────────────────────

import { ImportStatsSchema, type ImportResult } from "./crm";

export const ImportJobStatusSchema = z.enum([
  "queued",
  "parsing",
  "mapping",
  "completed",
  "failed",
]);
export type ImportJobStatus = z.infer<typeof ImportJobStatusSchema>;

export const ImportJobProgressSchema = z.object({
  totalRows: z.number(),
  processedRows: z.number(),
  skippedRows: z.number(),
  failedRows: z.number(),
  currentBatch: z.number(),
  totalBatches: z.number(),
});
export type ImportJobProgress = z.infer<typeof ImportJobProgressSchema>;

/**
 * The self-contained state of a job. Sent whole on every SSE event and by
 * the snapshot endpoint — receivers never need to merge deltas. Clients
 * validate against this schema at the transport boundary.
 */
export const ImportJobSnapshotSchema = z.object({
  jobId: z.string(),
  status: ImportJobStatusSchema,
  progress: ImportJobProgressSchema,
  /** Present when status is "failed". */
  error: z.string().optional(),
  /** Present when status is "completed". */
  stats: ImportStatsSchema.optional(),
});
export type ImportJobSnapshot = z.infer<typeof ImportJobSnapshotSchema>;

/** POST /api/imports — request body */
export interface StartImportRequestBody {
  fileId: string;
}

/** POST /api/imports — 202 (the job was accepted, not finished) */
export const StartImportResponseSchema = z.object({ jobId: z.string() });
export type StartImportResponse = z.infer<typeof StartImportResponseSchema>;

/**
 * GET /api/imports/:id/events — SSE stream.
 * Event names: "progress" (running), "done" (completed), "failed".
 * "failed" is deliberately NOT named "error": EventSource fires a
 * transport-level "error" event on disconnects, and the two must never be
 * confusable. Every event's data is a full ImportJobSnapshot.
 */
export const IMPORT_SSE_EVENTS = ["progress", "done", "failed"] as const;
export type ImportSseEvent = (typeof IMPORT_SSE_EVENTS)[number];

/** GET /api/imports/:id/result — 200 (only when status = completed) */
export interface ImportResultResponse extends ImportResult {
  jobId: string;
}
