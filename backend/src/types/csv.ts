/** Result of streaming a CSV for headers, a bounded preview, and a full row count. */
export interface CsvPreview {
  headers: string[];
  /** First N data rows, keyed by (cleaned) header. */
  rows: Record<string, string>[];
  /** Total data rows in the file — counted by the same stream, not estimated. */
  totalRows: number;
}

export type RowIssueKind = "extra-fields" | "missing-fields";

/** A recoverable, row-level structural problem. The row still flows onward. */
export interface RowIssue {
  kind: RowIssueKind;
  message: string;
}

/** One data row converted to a JSON record. */
export interface ParsedRow {
  /** 0-based index among data rows (header row excluded). */
  index: number;
  /** Cells keyed by cleaned header; extra cells appear as column_N. */
  record: Record<string, string>;
  /** Present when the row's shape did not match the header row. */
  issue?: RowIssue;
}

/** Events emitted by the streaming parser, in order: one headers, then rows. */
export type CsvStreamEvent =
  { type: "headers"; headers: string[] } | { type: "row"; row: ParsedRow };
