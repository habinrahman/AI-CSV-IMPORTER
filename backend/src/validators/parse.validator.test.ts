import { describe, expect, it } from "vitest";
import { parseRequestSchema } from "./parse.validator";

describe("parseRequestSchema", () => {
  it("accepts a UUID fileId and defaults previewRows to 20", () => {
    const parsed = parseRequestSchema.parse({
      fileId: "22222222-2222-4222-8222-222222222222",
    });
    expect(parsed).toEqual({
      fileId: "22222222-2222-4222-8222-222222222222",
      previewRows: 20,
    });
  });

  it("rejects a non-UUID fileId and out-of-range previewRows", () => {
    expect(() => parseRequestSchema.parse({ fileId: "bad" })).toThrow();
    expect(() =>
      parseRequestSchema.parse({
        fileId: "22222222-2222-4222-8222-222222222222",
        previewRows: 0,
      }),
    ).toThrow();
    expect(() =>
      parseRequestSchema.parse({
        fileId: "22222222-2222-4222-8222-222222222222",
        previewRows: 101,
      }),
    ).toThrow();
  });
});
