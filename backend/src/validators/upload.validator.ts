import path from "node:path";

/**
 * Browsers report wildly inconsistent MIME types for CSV files
 * (text/csv, text/plain, application/vnd.ms-excel, application/octet-stream…),
 * so MIME alone cannot be trusted. Policy: the extension must be .csv AND the
 * MIME must be on the allowlist. The authoritative check is content-level —
 * whether the file actually parses — which happens in /parse.
 */
const ALLOWED_MIME_TYPES = new Set([
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/octet-stream",
]);

export function isAcceptableCsvUpload(file: { originalname: string; mimetype: string }): boolean {
  const extension = path.extname(file.originalname).toLowerCase();
  return extension === ".csv" && ALLOWED_MIME_TYPES.has(file.mimetype);
}

export const UPLOAD_FIELD_NAME = "file";
