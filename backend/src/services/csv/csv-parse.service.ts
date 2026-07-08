import fs from "node:fs";
import csvParser from "csv-parser";
import type { CsvPreview, CsvStreamEvent, ParsedRow, RowIssue } from "../../types/csv";
import { CsvParseError } from "../../utils/errors";
import { cleanHeader, dedupeHeaders } from "./header-utils";

/**
 * CSV parsing seam. Interface-first so the AI pipeline and tests depend on
 * the contract, not on the csv-parser library.
 */
export interface CsvParser {
  /**
   * Stream the file as events: exactly one `headers`, then one `row` per data
   * row. Backed by node streams end to end — memory stays constant no matter
   * the file size, and backpressure flows to the file read automatically via
   * the async-iterator protocol. Malformed rows are flagged, never dropped;
   * only file-level unreadability throws (CsvParseError).
   */
  stream(filePath: string): AsyncGenerator<CsvStreamEvent, void, void>;

  /** One pass: headers + first `maxRows` records + exact total row count. */
  preview(filePath: string, maxRows: number): Promise<CsvPreview>;
}

export class StreamingCsvParser implements CsvParser {
  async *stream(filePath: string): AsyncGenerator<CsvStreamEvent, void, void> {
    const readStream = fs.createReadStream(filePath);
    // csv-parser with headers:false hands us raw cells ({"0":"a","1":"b"}),
    // so header mapping, shape detection, and recovery are fully ours; the
    // library does what it is genuinely good at — CSV tokenization (quotes,
    // embedded newlines, CRLF).
    const parser = readStream.pipe(csvParser({ headers: false }));
    // Read errors do not propagate through pipe(); forward them so the
    // for-await below rejects instead of hanging.
    readStream.on("error", (err) => {
      parser.destroy(new CsvParseError(`Unable to read uploaded file: ${err.message}`));
    });

    let headers: string[] | null = null;
    let index = 0;

    try {
      for await (const raw of parser as AsyncIterable<Record<string, string>>) {
        const cells: string[] = Object.values(raw);
        if (isBlankRow(cells)) continue;

        if (headers === null) {
          headers = dedupeHeaders(cells.map(cleanHeader));
          yield { type: "headers", headers };
          continue;
        }
        yield { type: "row", row: buildRow(headers, cells, index++) };
      }
    } catch (err) {
      if (err instanceof CsvParseError) throw err;
      throw new CsvParseError(`Unable to parse CSV: ${(err as Error).message}`);
    } finally {
      // Consumers may stop early (previews, aborted jobs) — release the file
      // handle either way.
      parser.destroy();
      readStream.destroy();
    }

    if (headers === null) {
      throw new CsvParseError("The file is empty or has no header row");
    }
  }

  async preview(filePath: string, maxRows: number): Promise<CsvPreview> {
    let headers: string[] = [];
    const rows: Record<string, string>[] = [];
    let totalRows = 0;

    for await (const event of this.stream(filePath)) {
      if (event.type === "headers") {
        headers = event.headers;
      } else {
        totalRows += 1;
        if (rows.length < maxRows) rows.push(event.row.record);
      }
    }
    return { headers, rows, totalRows };
  }
}

/** A line with no cells, or only empty ones, is not data. */
function isBlankRow(cells: string[]): boolean {
  return cells.length === 0 || cells.every((cell) => cell.trim() === "");
}

/**
 * Convert raw cells to a record keyed by header. Shape mismatches are
 * recoverable: missing cells pad to "", extra cells are preserved under
 * column_N keys (they may carry CRM-relevant data), and the row is flagged.
 */
function buildRow(headers: string[], cells: string[], index: number): ParsedRow {
  const record: Record<string, string> = {};
  headers.forEach((header, i) => {
    record[header] = cells[i] ?? "";
  });

  let issue: RowIssue | undefined;
  if (cells.length > headers.length) {
    for (let i = headers.length; i < cells.length; i++) {
      record[`column_${i + 1}`] = cells[i] ?? "";
    }
    issue = {
      kind: "extra-fields",
      message: `Expected ${headers.length} fields, got ${cells.length}`,
    };
  } else if (cells.length < headers.length) {
    issue = {
      kind: "missing-fields",
      message: `Expected ${headers.length} fields, got ${cells.length}`,
    };
  }

  return issue ? { index, record, issue } : { index, record };
}
