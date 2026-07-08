"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";

export const PREVIEW_ROW_LIMIT = 100;

export interface CsvPreviewResult {
  status: "idle" | "parsing" | "success" | "error";
  headers: string[];
  rows: Record<string, string>[];
  /** True when the file has more rows than the preview limit. */
  truncated: boolean;
  /** Data rows that had structural issues (extra/missing fields). */
  problemRowCount: number;
  errorMessage: string | null;
}

const IDLE: CsvPreviewResult = {
  status: "idle",
  headers: [],
  rows: [],
  truncated: false,
  problemRowCount: 0,
  errorMessage: null,
};

/**
 * Client-side CSV preview via PapaParse. `preview: N` makes Papa read only the
 * head of the file, so this is instant even at the size limit — and the
 * backend is never called. Header cleaning mirrors the server parser (BOM
 * strip, trim, blank → column_N) so the preview shows what the import will
 * see; duplicate headers additionally get a numeric suffix, because duplicate
 * object keys would silently swallow columns.
 */
export function useCsvPreview(file: File | null, maxRows = PREVIEW_ROW_LIMIT): CsvPreviewResult {
  const [result, setResult] = useState<CsvPreviewResult>(IDLE);

  useEffect(() => {
    if (!file) {
      setResult(IDLE);
      return;
    }

    let cancelled = false;
    setResult({ ...IDLE, status: "parsing" });

    const seen = new Map<string, number>();
    const cleanHeader = (header: string, index: number): string => {
      // Papa may run several header passes (delimiter auto-detection), so the
      // dedupe map must reset whenever a pass restarts at the first column.
      if (index === 0) seen.clear();
      const stripped =
        header.charCodeAt(0) === 0xfeff ? header.slice(1).trim() : header.trim();
      const base = stripped.length > 0 ? stripped : `column_${index + 1}`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base} (${count + 1})`;
    };

    Papa.parse<Record<string, string>>(file, {
      header: true,
      // Papa reads maxRows + 1 so we can tell "exactly at the limit" apart
      // from "there is more"; the extra row is dropped below.
      preview: maxRows + 1,
      skipEmptyLines: "greedy",
      transformHeader: cleanHeader,
      complete: (parsed) => {
        if (cancelled) return;
        const headers = parsed.meta.fields ?? [];
        if (headers.length === 0) {
          setResult({
            ...IDLE,
            status: "error",
            errorMessage: "The file is empty or has no header row.",
          });
          return;
        }
        const truncated = parsed.data.length > maxRows;
        setResult({
          status: "success",
          headers,
          rows: truncated ? parsed.data.slice(0, maxRows) : parsed.data,
          truncated,
          problemRowCount: parsed.errors.length,
          errorMessage: null,
        });
      },
      error: (error) => {
        if (cancelled) return;
        setResult({ ...IDLE, status: "error", errorMessage: error.message });
      },
    });

    return () => {
      cancelled = true;
    };
  }, [file, maxRows]);

  return result;
}
