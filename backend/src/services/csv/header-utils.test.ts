import { describe, expect, it } from "vitest";
import { cleanHeader, dedupeHeaders } from "./header-utils";

// Built via fromCharCode so no invisible character hides in this source file.
const BOM = String.fromCharCode(0xfeff);

describe("cleanHeader", () => {
  it("trims surrounding whitespace", () => {
    expect(cleanHeader("  Full Name  ", 0)).toBe("Full Name");
  });

  it("strips a UTF-8 BOM from the first header", () => {
    expect(cleanHeader(`${BOM}Name`, 0)).toBe("Name");
  });

  it("strips BOM and trims together", () => {
    expect(cleanHeader(`${BOM}  Name `, 0)).toBe("Name");
  });

  it("names blank headers by 1-based position", () => {
    expect(cleanHeader("", 2)).toBe("column_3");
    expect(cleanHeader("   ", 0)).toBe("column_1");
  });

  it("leaves clean headers untouched", () => {
    expect(cleanHeader("E-mail Addr", 1)).toBe("E-mail Addr");
  });
});

describe("dedupeHeaders", () => {
  it("passes unique headers through unchanged", () => {
    expect(dedupeHeaders(["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("suffixes duplicates with their occurrence number", () => {
    expect(dedupeHeaders(["Email", "Name", "Email", "Email"])).toEqual([
      "Email",
      "Name",
      "Email (2)",
      "Email (3)",
    ]);
  });

  it("handles empty input", () => {
    expect(dedupeHeaders([])).toEqual([]);
  });
});
