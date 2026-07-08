/**
 * Header cleaning shared by every CSV consumer on the backend. The frontend
 * preview applies the same semantics, so what the user previews is what the
 * import processes.
 */

/** Strip UTF-8 BOM, trim whitespace, name blank headers column_N. */
export function cleanHeader(header: string, index: number): string {
  const stripped = header.charCodeAt(0) === 0xfeff ? header.slice(1).trim() : header.trim();
  return stripped.length > 0 ? stripped : `column_${index + 1}`;
}

/**
 * Suffix duplicate header names ("Email", "Email (2)", …). Duplicates would
 * otherwise collide as JSON record keys and silently swallow columns.
 */
export function dedupeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header) => {
    const count = seen.get(header) ?? 0;
    seen.set(header, count + 1);
    return count === 0 ? header : `${header} (${count + 1})`;
  });
}
