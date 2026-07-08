import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { StreamingCsvParser } from "../services/csv/csv-parse.service";
import { normalizeEmail } from "../services/normalize/email";
import { normalizeMobileParts } from "../services/normalize/phone";
import { GOLDEN_HEADERS, GOLDEN_ROWS, toCsv } from "./golden-set";

/**
 * The golden set is only useful if it cannot rot: expectations must stay
 * consistent with the deterministic normalizers, and the generated CSV must
 * survive our own parser. These run in CI (no network); the model-facing
 * scoring runs via `npm run eval` with a real key.
 */

const fixture = path.join(os.tmpdir(), `golden-set-test-${Date.now()}.csv`);
afterAll(() => {
  fs.rmSync(fixture, { force: true });
});

describe("golden set integrity", () => {
  it("round-trips through the real CSV parser (quoting, commas, row count)", async () => {
    fs.writeFileSync(fixture, toCsv(GOLDEN_HEADERS, GOLDEN_ROWS), "utf8");
    const parser = new StreamingCsvParser();
    let headers: string[] = [];
    let rows = 0;
    for await (const event of parser.stream(fixture)) {
      if (event.type === "headers") headers = event.headers;
      else rows += 1;
    }
    expect(headers).toEqual([...GOLDEN_HEADERS]);
    expect(rows).toBe(GOLDEN_ROWS.length);
  });

  it("expected emails are already in canonical form and traceable to a cell", () => {
    for (const row of GOLDEN_ROWS) {
      if (row.expected.skip || row.expected.email === "") continue;
      expect(normalizeEmail(row.expected.email)).toBe(row.expected.email);
      expect(row.cells.join(" ").toLowerCase()).toContain(row.expected.email);
    }
  });

  it("expected mobile splits are exactly what the normalizer produces", () => {
    for (const row of GOLDEN_ROWS) {
      if (row.expected.skip || row.expected.mobile_without_country_code === "") continue;
      // Idempotence: re-normalizing the expectation must reproduce it.
      const joined = `${row.expected.country_code}${row.expected.mobile_without_country_code}`;
      expect(normalizeMobileParts(joined, "IN")).toEqual({
        country_code: row.expected.country_code,
        mobile_without_country_code: row.expected.mobile_without_country_code,
      });
      // Traceability: the digits must come from the input row. Split cells
      // on the spec's multi-value separators first ("98… / 98…"), then strip
      // formatting within each candidate ("98765 43210" is ONE number).
      const expectedDigits = joined.replace(/[^0-9]/g, "");
      const traceable = row.cells
        .flatMap((cell) => cell.split(/[;,/|\n]/))
        .map((segment) => segment.replace(/[^0-9]/g, ""))
        .some((digits) => digits.length >= 7 && expectedDigits.endsWith(digits.slice(-7)));
      expect(traceable, `untraceable expectation: ${joined}`).toBe(true);
    }
  });

  it("covers every status, every data source, skips, and an injection row", () => {
    const expectations = GOLDEN_ROWS.filter(
      (r): r is Extract<(typeof GOLDEN_ROWS)[number], { expected: { skip: false } }> =>
        !r.expected.skip,
    ).map((r) => r.expected);
    const statuses = new Set(expectations.map((e) => e.crm_status).filter(Boolean));
    const sources = new Set(expectations.map((e) => e.data_source).filter((s) => s !== ""));

    expect(statuses.size).toBe(4);
    expect(sources.size).toBe(5);
    expect(GOLDEN_ROWS.some((r) => r.expected.skip)).toBe(true);
    expect(GOLDEN_ROWS.some((r) => /ignore previous instructions/i.test(r.cells.join(" ")))).toBe(
      true,
    );
  });
});
