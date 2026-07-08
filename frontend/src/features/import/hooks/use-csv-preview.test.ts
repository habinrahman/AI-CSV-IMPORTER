import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PREVIEW_ROW_LIMIT, useCsvPreview } from "./use-csv-preview";

// Real PapaParse runs against real File objects in jsdom — no parser mocks.
function csvFile(text: string, name = "leads.csv"): File {
  return new File([text], name, { type: "text/csv" });
}

async function parsePreview(text: string, maxRows?: number) {
  // The File must be a stable reference: it is an effect dependency, so a
  // fresh instance per render would re-trigger parsing forever.
  const file = csvFile(text);
  const { result } = renderHook(() => useCsvPreview(file, maxRows));
  await waitFor(() => {
    expect(result.current.status).not.toBe("parsing");
  });
  return result.current;
}

describe("useCsvPreview", () => {
  it("stays idle without a file", () => {
    const { result } = renderHook(() => useCsvPreview(null));
    expect(result.current.status).toBe("idle");
    expect(result.current.headers).toEqual([]);
    expect(result.current.rows).toEqual([]);
  });

  it("parses headers and rows from a CSV file", async () => {
    const preview = await parsePreview(
      "Name,Email\nAda Lovelace,ada@example.com\nAlan Turing,alan@example.com\n",
    );
    expect(preview.status).toBe("success");
    expect(preview.headers).toEqual(["Name", "Email"]);
    expect(preview.rows).toEqual([
      { Name: "Ada Lovelace", Email: "ada@example.com" },
      { Name: "Alan Turing", Email: "alan@example.com" },
    ]);
    expect(preview.truncated).toBe(false);
    expect(preview.problemRowCount).toBe(0);
    expect(preview.errorMessage).toBeNull();
  });

  it("dedupes duplicate headers with numeric suffixes — and never double-suffixes across Papa's multiple header passes (regression)", async () => {
    // Papa may run transformHeader more than once while auto-detecting the
    // delimiter. Without resetting the dedupe map per pass, the first column
    // came out as "Name (2)" (or worse). Assert the exact final array.
    const preview = await parsePreview("Name,Name,Email,Name\na,b,c,d\n");
    expect(preview.status).toBe("success");
    expect(preview.headers).toEqual(["Name", "Name (2)", "Email", "Name (3)"]);
    // Row values must land under the deduped keys, not silently collapse.
    expect(preview.rows[0]).toEqual({
      Name: "a",
      "Name (2)": "b",
      Email: "c",
      "Name (3)": "d",
    });
  });

  it("strips the BOM and names blank headers column_N", async () => {
    const preview = await parsePreview("\uFEFFName, ,Email\na,b,c\n");
    expect(preview.status).toBe("success");
    expect(preview.headers).toEqual(["Name", "column_2", "Email"]);
  });

  it("truncates past the row limit and sets the truncated flag", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => `p${i + 1},${i + 1}`).join("\n");
    const preview = await parsePreview(`Name,Rank\n${rows}\n`, 3);
    expect(preview.status).toBe("success");
    expect(preview.rows).toHaveLength(3);
    expect(preview.rows[2]).toEqual({ Name: "p3", Rank: "3" });
    expect(preview.truncated).toBe(true);
  });

  it("a file exactly at the limit is not flagged as truncated", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => `p${i + 1}`).join("\n");
    const preview = await parsePreview(`Name\n${rows}\n`, 3);
    expect(preview.rows).toHaveLength(3);
    expect(preview.truncated).toBe(false);
  });

  it("defaults the limit to PREVIEW_ROW_LIMIT", async () => {
    const rows = Array.from({ length: PREVIEW_ROW_LIMIT + 2 }, (_, i) => `p${i}`).join("\n");
    const preview = await parsePreview(`Name\n${rows}\n`);
    expect(preview.rows).toHaveLength(PREVIEW_ROW_LIMIT);
    expect(preview.truncated).toBe(true);
  });

  it("reports an empty file as an error", async () => {
    const preview = await parsePreview("");
    expect(preview.status).toBe("error");
    expect(preview.errorMessage).toBe("The file is empty or has no header row.");
    expect(preview.rows).toEqual([]);
  });

  it("counts structurally broken rows without failing the preview", async () => {
    const preview = await parsePreview("Name,Email\nada,ada@example.com,EXTRA\nalan\n");
    expect(preview.status).toBe("success");
    expect(preview.problemRowCount).toBeGreaterThan(0);
  });
});
