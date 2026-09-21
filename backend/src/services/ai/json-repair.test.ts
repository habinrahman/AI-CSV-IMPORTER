import { describe, expect, it } from "vitest";
import { parseJsonLeniently, repairJsonText } from "./json-repair";

describe("repairJsonText", () => {
  it("strips a markdown json fence and returns the object body", () => {
    const raw = '```json\n{"ok": true}\n```';
    expect(repairJsonText(raw)).toBe('{"ok": true}');
  });

  it("strips an unlabelled fence", () => {
    const raw = '```\n{"ok": true}\n```';
    expect(repairJsonText(raw)).toBe('{"ok": true}');
  });

  it("extracts the outermost object when the model wraps it in prose", () => {
    const raw = 'Sure, here you go:\n{"a": 1}\nHope that helps!';
    expect(repairJsonText(raw)).toBe('{"a": 1}');
  });

  it("removes trailing commas before closing braces and brackets", () => {
    const raw = '{"rows": [1, 2,], "ok": true,}';
    expect(repairJsonText(raw)).toBe('{"rows": [1, 2], "ok": true}');
  });

  it("returns null when there is no JSON object to recover", () => {
    expect(repairJsonText("not json at all")).toBeNull();
    expect(repairJsonText("}{")).toBeNull();
    expect(repairJsonText("")).toBeNull();
  });

  it("does not invent tokens for truncated output", () => {
    expect(repairJsonText('{"name": "Ada"')).toBeNull();
  });
});

describe("parseJsonLeniently", () => {
  it("parses strict JSON without marking it repaired", () => {
    expect(parseJsonLeniently('{"n": 1}')).toEqual({ value: { n: 1 }, repaired: false });
  });

  it("parses fenced JSON and reports that it was repaired", () => {
    expect(parseJsonLeniently('```json\n{"n": 1}\n```')).toEqual({
      value: { n: 1 },
      repaired: true,
    });
  });

  it("parses trailing-comma JSON after repair", () => {
    expect(parseJsonLeniently('{"n": 1,}')).toEqual({ value: { n: 1 }, repaired: true });
  });

  it("returns null when even the repaired candidate is not JSON", () => {
    expect(parseJsonLeniently("```\n{not json}\n```")).toBeNull();
    expect(parseJsonLeniently("nope")).toBeNull();
  });
});
