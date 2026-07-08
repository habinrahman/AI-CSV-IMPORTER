import type { FailedRow, ImportResult, MappedLead, RowWarning, SkippedRow } from "@groweasy/shared";
import type { Logger } from "../../logger";
import type { ParsedRow } from "../../types/csv";
import type { BatchMapper } from "../ai/batch-mapper";
import type { CsvParser } from "../csv/csv-parse.service";
import { hasContactSignal } from "../csv/row-heuristics";
import { normalizeLead } from "../normalize/lead";

export interface ImportPipelineOptions {
  defaultPhoneRegion: string;
  /** Records mapped below this confidence get a review warning. */
  lowConfidenceThreshold: number;
}

export interface PipelineProgress {
  phase: "parsing" | "mapping";
  totalRows: number;
  processedRows: number;
  skippedRows: number;
  failedRows: number;
  currentBatch: number;
  totalBatches: number;
}

export interface PipelineHooks {
  signal?: AbortSignal;
  onProgress?: (progress: PipelineProgress) => void;
}

/**
 * The import run, end to end:
 *
 *   CSV stream → deterministic pre-filter (skip token-free rows for free)
 *   → BatchMapper (AI, retries, bisection) → per-row: model skip OR
 *   normalize → authoritative business-rule check → bucket.
 *
 * Every source row lands in exactly ONE of records/skipped/errors — the
 * audit invariant `totalRows === imported + skipped + failed` is checked
 * before returning. Warnings are an additional channel (shape issues,
 * discarded values, low confidence), never a bucket.
 */
export class ImportPipeline {
  constructor(
    private readonly csv: CsvParser,
    private readonly mapper: BatchMapper,
    private readonly options: ImportPipelineOptions,
    private readonly logger: Logger,
  ) {}

  async run(filePath: string, hooks: PipelineHooks = {}): Promise<ImportResult> {
    const startedAt = Date.now();
    const warnings: RowWarning[] = [];
    const skipped: SkippedRow[] = [];

    // 1. Parse. Rows are collected here because the upload size cap (5 MB)
    // bounds this at a few hundred thousand small records — the streaming
    // parser still keeps the *parsing* memory flat.
    let headers: string[] = [];
    const parsed: ParsedRow[] = [];
    for await (const event of this.csv.stream(filePath)) {
      hooks.signal?.throwIfAborted();
      if (event.type === "headers") headers = event.headers;
      else parsed.push(event.row);
    }
    const totalRows = parsed.length;

    for (const row of parsed) {
      if (row.issue) {
        warnings.push({ rowIndex: row.index, message: `Row shape: ${row.issue.message}` });
      }
    }

    hooks.onProgress?.({
      phase: "parsing",
      totalRows,
      processedRows: 0,
      skippedRows: 0,
      failedRows: 0,
      currentBatch: 0,
      totalBatches: 0,
    });

    // 2. Deterministic pre-filter: a row with no email-like and no
    // phone-like token anywhere can never pass the business rule — skip it
    // before it costs a single token.
    const candidates: ParsedRow[] = [];
    for (const row of parsed) {
      if (hasContactSignal(row.record)) {
        candidates.push(row);
      } else {
        skipped.push({
          rowIndex: row.index,
          reason: "No email-like or phone-like value found in the row",
          raw: row.record,
        });
      }
    }
    const preSkipped = skipped.length;

    // 3. AI mapping (batched, retried, bisected).
    const mapResult = await this.mapper.mapRows({
      headers,
      rows: candidates.map((row) => ({ rowIndex: row.index, cells: row.record })),
      signal: hooks.signal,
      onProgress: (p) =>
        hooks.onProgress?.({
          phase: "mapping",
          totalRows,
          processedRows: preSkipped + p.mappedRows + p.failedRows,
          skippedRows: preSkipped,
          failedRows: p.failedRows,
          currentBatch: p.completedBatches,
          totalBatches: p.totalBatches,
        }),
    });

    const rawByIndex = new Map(parsed.map((row) => [row.index, row.record]));
    const rawOf = (rowIndex: number): Record<string, string> => rawByIndex.get(rowIndex) ?? {};

    const errors: FailedRow[] = mapResult.failures.map((failure) => ({
      rowIndex: failure.rowIndex,
      message: failure.message,
      raw: rawOf(failure.rowIndex),
    }));

    // 4. Normalize + enforce the business rule on every mapped row.
    const records: MappedLead[] = [];
    for (const row of mapResult.rows) {
      if (row.lead === null) {
        skipped.push({
          rowIndex: row.rowIndex,
          reason: row.skipReason ?? "Skipped by the mapping model",
          raw: rawOf(row.rowIndex),
        });
        continue;
      }

      const normalized = normalizeLead(row.lead, this.options.defaultPhoneRegion);
      for (const message of normalized.warnings) {
        warnings.push({ rowIndex: row.rowIndex, message });
      }

      // Authoritative skip check: code overrules the model. A lead that
      // lost its last contact value during normalization cannot be imported.
      if (normalized.lead.email === "" && normalized.lead.mobile_without_country_code === "") {
        skipped.push({
          rowIndex: row.rowIndex,
          reason: "No valid email or mobile number after normalization",
          raw: rawOf(row.rowIndex),
        });
        continue;
      }

      if (row.confidence < this.options.lowConfidenceThreshold) {
        warnings.push({
          rowIndex: row.rowIndex,
          message: `Low mapping confidence (${row.confidence.toFixed(2)}) — review before trusting`,
        });
      }

      records.push({ ...normalized.lead, rowIndex: row.rowIndex, confidence: row.confidence });
    }

    // Stable, source-order output regardless of batch completion order.
    records.sort((a, b) => a.rowIndex - b.rowIndex);
    skipped.sort((a, b) => a.rowIndex - b.rowIndex);
    errors.sort((a, b) => a.rowIndex - b.rowIndex);
    warnings.sort((a, b) => a.rowIndex - b.rowIndex);

    const spentTokens = mapResult.tokens.prompt + mapResult.tokens.completion > 0;
    const stats = {
      totalRows,
      imported: records.length,
      skipped: skipped.length,
      failed: errors.length,
      warnings: warnings.length,
      batches: mapResult.batches,
      durationMs: Date.now() - startedAt,
      // Cost observability: what this import cost in tokens (all attempts).
      ...(spentTokens ? { tokens: mapResult.tokens } : {}),
    };

    // The audit invariant. A violation is a pipeline bug — loud in logs,
    // and the numbers still go out so the operator can see the discrepancy.
    if (stats.totalRows !== stats.imported + stats.skipped + stats.failed) {
      this.logger.error({ stats }, "AUDIT INVARIANT VIOLATED: rows unaccounted for");
    }

    return { records, skipped, errors, warnings, stats };
  }
}
