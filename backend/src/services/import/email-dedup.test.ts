import { describe, expect, it } from "vitest";
import {
  CROSS_IMPORT_DEDUP_REASON,
  WITHIN_IMPORT_DEDUP_REASON,
  decideEmailDedup,
  reasonForDedup,
} from "./email-dedup";

describe("decideEmailDedup", () => {
  it("keeps phone-only leads (empty email) without recording them as seen", () => {
    const seen = new Set<string>();
    expect(decideEmailDedup("", new Set(["a@x.com"]), seen)).toBe("keep");
    expect(seen.size).toBe(0);
  });

  it("skips when the email already exists in the CRM", () => {
    const seen = new Set<string>();
    expect(decideEmailDedup("a@x.com", new Set(["a@x.com"]), seen)).toBe("cross-import");
    expect(seen.size).toBe(0);
  });

  it("keeps the first occurrence within an import and skips later duplicates", () => {
    const seen = new Set<string>();
    expect(decideEmailDedup("a@x.com", new Set(), seen)).toBe("keep");
    expect(decideEmailDedup("a@x.com", new Set(), seen)).toBe("within-import");
    expect(seen).toEqual(new Set(["a@x.com"]));
  });

  it("does not treat a CRM miss as a within-import collision across different emails", () => {
    const seen = new Set<string>();
    expect(decideEmailDedup("a@x.com", new Set(["b@x.com"]), seen)).toBe("keep");
    expect(decideEmailDedup("b@x.com", new Set(["b@x.com"]), seen)).toBe("cross-import");
  });
});

describe("reasonForDedup", () => {
  it("returns the operator-facing skip reasons", () => {
    expect(reasonForDedup("cross-import")).toBe(CROSS_IMPORT_DEDUP_REASON);
    expect(reasonForDedup("within-import")).toBe(WITHIN_IMPORT_DEDUP_REASON);
  });
});
