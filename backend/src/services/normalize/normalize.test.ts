import { describe, expect, it } from "vitest";
import type { CrmLead } from "@groweasy/shared";
import { normalizeEmail } from "./email";
import { normalizeLead } from "./lead";
import { normalizeMobile, normalizeMobileParts } from "./phone";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Ravi.Kumar@Example.COM ")).toBe("ravi.kumar@example.com");
  });

  it("accepts plus-addressing and subdomains", () => {
    expect(normalizeEmail("a.b+leads@mail.co.in")).toBe("a.b+leads@mail.co.in");
  });

  it("rejects non-addresses without repairing them", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("x@y")).toBeNull(); // no TLD
    expect(normalizeEmail("ravi at example.com")).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("normalizeMobile (default region IN)", () => {
  it("formats a bare national number to E.164", () => {
    expect(normalizeMobile("98765 43210", "IN")).toBe("+919876543210");
  });

  it("drops the national trunk zero", () => {
    expect(normalizeMobile("098765 43210", "IN")).toBe("+919876543210");
  });

  it("keeps an existing +country code", () => {
    expect(normalizeMobile("+91 98765-43210", "IN")).toBe("+919876543210");
  });

  it("converts the 00 international prefix", () => {
    expect(normalizeMobile("0044 7911 123456", "IN")).toBe("+447911123456");
  });

  it("recognizes a bare country code without a plus", () => {
    expect(normalizeMobile("919876543210", "IN")).toBe("+919876543210");
  });

  it("strips separators and parentheses", () => {
    expect(normalizeMobile("(987) 65-43210", "IN")).toBe("+919876543210");
  });

  it("rejects implausible values", () => {
    expect(normalizeMobile("12345", "IN")).toBeNull();
    expect(normalizeMobile("2026-07-08", "IN")).toBeNull(); // date, not phone
    expect(normalizeMobile("no digits here", "IN")).toBeNull();
    expect(normalizeMobile("", "IN")).toBeNull();
  });

  it("honors a different default region", () => {
    expect(normalizeMobile("07911 123456", "GB")).toBe("+447911123456");
  });
});

describe("normalizeMobileParts", () => {
  it("splits into calling code + national number", () => {
    expect(normalizeMobileParts("98765 43210", "IN")).toEqual({
      country_code: "+91",
      mobile_without_country_code: "9876543210",
    });
    expect(normalizeMobileParts("0044 7911 123456", "IN")).toEqual({
      country_code: "+44",
      mobile_without_country_code: "7911123456",
    });
  });

  it("rejects what normalizeMobile rejects", () => {
    expect(normalizeMobileParts("12345", "IN")).toBeNull();
    expect(normalizeMobileParts("", "IN")).toBeNull();
  });
});

describe("normalizeLead", () => {
  const base: CrmLead = {
    created_at: "2026-05-13 14:20:48",
    name: "  ravi   KUMAR ",
    email: " Ravi@Example.COM ",
    country_code: "",
    mobile_without_country_code: "98765 43210",
    company: "  Acme   Realty ",
    city: "Pune",
    state: "",
    country: "",
    lead_owner: "",
    crm_status: null,
    crm_note: "  interested,   call back   Monday ",
    data_source: "",
    possession_time: "",
    description: "",
  };

  it("normalizes every field deterministically", () => {
    const { lead, warnings } = normalizeLead(base, "IN");

    expect(lead.name).toBe("ravi KUMAR"); // whitespace only — letters untouched
    expect(lead.email).toBe("ravi@example.com");
    expect(lead.country_code).toBe("+91");
    expect(lead.mobile_without_country_code).toBe("9876543210");
    expect(lead.company).toBe("Acme Realty");
    expect(lead.created_at).toBe("2026-05-13 14:20:48"); // new Date()-parseable → kept
    expect(lead.crm_note).toBe("interested, call back Monday");
    expect(warnings).toEqual([]);
  });

  it("re-splits a phone the model put entirely in the national field", () => {
    const { lead } = normalizeLead(
      { ...base, country_code: "", mobile_without_country_code: "+44 7911 123456" },
      "IN",
    );
    expect(lead.country_code).toBe("+44");
    expect(lead.mobile_without_country_code).toBe("7911123456");
  });

  it("discards an invalid email with a warning, never a silent fix", () => {
    const { lead, warnings } = normalizeLead({ ...base, email: "ravi@@broken" }, "IN");

    expect(lead.email).toBe("");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Discarded invalid email/);
  });

  it("discards an unparseable mobile with a warning", () => {
    const { lead, warnings } = normalizeLead(
      { ...base, mobile_without_country_code: "2026-07-08" },
      "IN",
    );

    expect(lead.country_code).toBe("");
    expect(lead.mobile_without_country_code).toBe("");
    expect(warnings[0]).toMatch(/Discarded unparseable mobile/);
  });

  it("discards a created_at that new Date() cannot parse", () => {
    const { lead, warnings } = normalizeLead({ ...base, created_at: "13-31-2026 oops" }, "IN");

    expect(lead.created_at).toBe("");
    expect(warnings[0]).toMatch(/Discarded unparseable created_at/);
  });

  it("empty inputs stay empty without warnings", () => {
    const { lead, warnings } = normalizeLead(
      { ...base, created_at: "", email: "", mobile_without_country_code: " " },
      "IN",
    );

    expect(lead.email).toBe("");
    expect(lead.mobile_without_country_code).toBe("");
    expect(warnings).toEqual([]);
  });
});
