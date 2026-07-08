import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CsvStreamEvent, ParsedRow } from "../../types/csv";
import { CsvParseError } from "../../utils/errors";
import { StreamingCsvParser } from "./csv-parse.service";

const BOM = String.fromCharCode(0xfeff);

let dir: string;
const parser = new StreamingCsvParser();

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "groweasy-csv-test-"));
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

let fileCounter = 0;
function writeCsv(content: string): string {
  const filePath = path.join(dir, `fixture-${fileCounter++}.csv`);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

async function collect(filePath: string): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  let headers: string[] = [];
  const rows: ParsedRow[] = [];
  for await (const event of parser.stream(filePath)) {
    if (event.type === "headers") headers = event.headers;
    else rows.push(event.row);
  }
  return { headers, rows };
}

describe("StreamingCsvParser.stream", () => {
  it("converts rows into JSON records keyed by cleaned headers", async () => {
    const file = writeCsv(`${BOM} Name ,Email,,Email\nRavi,r@x.com,extra,dup@y.com\n`);
    const { headers, rows } = await collect(file);

    expect(headers).toEqual(["Name", "Email", "column_3", "Email (2)"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.record).toEqual({
      Name: "Ravi",
      Email: "r@x.com",
      column_3: "extra",
      "Email (2)": "dup@y.com",
    });
    expect(rows[0]?.issue).toBeUndefined();
  });

  it("handles quoted fields containing commas and newlines", async () => {
    const file = writeCsv('name,note\n"Kumar, Ravi","line one\nline two"\n');
    const { rows } = await collect(file);

    expect(rows[0]?.record).toEqual({ name: "Kumar, Ravi", note: "line one\nline two" });
  });

  it("handles CRLF line endings", async () => {
    const file = writeCsv("a,b\r\n1,2\r\n3,4\r\n");
    const { rows } = await collect(file);

    expect(rows.map((r) => r.record)).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("skips blank lines without consuming row indices", async () => {
    const file = writeCsv("a,b\n1,2\n\n   \n3,4\n");
    const { rows } = await collect(file);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.index)).toEqual([0, 1]);
  });

  it("flags rows with extra fields and preserves the extra values", async () => {
    const file = writeCsv("a,b\n1,2,SPILL,MORE\n3,4\n");
    const { rows } = await collect(file);

    expect(rows[0]?.issue?.kind).toBe("extra-fields");
    expect(rows[0]?.record).toEqual({ a: "1", b: "2", column_3: "SPILL", column_4: "MORE" });
    // The malformed row does not poison its neighbors.
    expect(rows[1]?.issue).toBeUndefined();
    expect(rows[1]?.record).toEqual({ a: "3", b: "4" });
  });

  it("flags rows with missing fields and pads them to empty strings", async () => {
    const file = writeCsv("a,b,c\n1,2\n");
    const { rows } = await collect(file);

    expect(rows[0]?.issue?.kind).toBe("missing-fields");
    expect(rows[0]?.record).toEqual({ a: "1", b: "2", c: "" });
  });

  it("throws CsvParseError for an empty file", async () => {
    const file = writeCsv("");
    await expect(collect(file)).rejects.toBeInstanceOf(CsvParseError);
  });

  it("treats a headers-only file as valid with zero rows", async () => {
    const file = writeCsv("a,b,c\n");
    const { headers, rows } = await collect(file);

    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows).toHaveLength(0);
  });

  it("throws CsvParseError when the file does not exist", async () => {
    await expect(collect(path.join(dir, "missing.csv"))).rejects.toBeInstanceOf(
      CsvParseError,
    );
  });

  it("supports early termination without hanging (backpressure release)", async () => {
    const big = "a,b\n" + Array.from({ length: 5000 }, (_, i) => `${i},x`).join("\n");
    const file = writeCsv(big);

    const seen: CsvStreamEvent[] = [];
    for await (const event of parser.stream(file)) {
      seen.push(event);
      if (seen.length >= 4) break; // headers + 3 rows, then bail out
    }
    expect(seen).toHaveLength(4);
  });

  it("streams tens of thousands of rows with correct count and order", async () => {
    const rowCount = 20_000;
    const big = "id,val\n" + Array.from({ length: rowCount }, (_, i) => `${i},v${i}`).join("\n");
    const file = writeCsv(big);

    let count = 0;
    let lastId = -1;
    for await (const event of parser.stream(file)) {
      if (event.type !== "row") continue;
      const id = Number(event.row.record["id"]);
      expect(id).toBe(lastId + 1);
      lastId = id;
      count += 1;
    }
    expect(count).toBe(rowCount);
  });
});

describe("StreamingCsvParser.preview", () => {
  it("caps returned rows but counts the whole file", async () => {
    const big = "a,b\n" + Array.from({ length: 50 }, (_, i) => `${i},x`).join("\n");
    const file = writeCsv(big);

    const preview = await parser.preview(file, 5);
    expect(preview.headers).toEqual(["a", "b"]);
    expect(preview.rows).toHaveLength(5);
    expect(preview.totalRows).toBe(50);
  });
});
