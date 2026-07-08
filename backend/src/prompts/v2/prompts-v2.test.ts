import { describe, expect, it } from "vitest";
import { CRM_STATUSES, DATA_SOURCES } from "@groweasy/shared";
import { MappedRowSchema } from "../../services/ai/mapping-schema";
import { getPromptModule } from "../index";
import { V2_EXAMPLES } from "./examples";
import { headerBankSize } from "./header-bank";

const v2 = getPromptModule("v2");
const config = { defaultPhoneRegion: "IN" };
const developer = v2.developer(config);

describe("prompt v2 registry", () => {
  it("registers v2 alongside an untouched v1", () => {
    expect(v2.version).toBe("v2");
    expect(getPromptModule("v1").version).toBe("v1"); // immutability: both live
  });
});

describe("v2 semantic mapping upgrades", () => {
  it("teaches every header cluster from the requirement", () => {
    // The exact examples the spec listed, verbatim.
    for (const header of [
      "Customer Name",
      "Lead Name",
      "Client",
      "Prospect",
      "Full Name",
      "Phone",
      "WhatsApp",
      "Contact",
      "Primary Mobile",
      "Remarks",
      "Comments",
      "Internal Notes",
      "Feedback",
      "Company",
      "Organization",
      "Employer",
      "Business",
      "Email",
      "Work Email",
      "Contact Email",
    ]) {
      expect(developer, `missing header example: ${header}`).toContain(header);
    }
  });

  it('keeps "dozens of examples" literally true (≥ 48 header spellings)', () => {
    expect(headerBankSize()).toBeGreaterThanOrEqual(48);
  });

  it("states the values-win-over-headers law", () => {
    expect(developer).toMatch(/THE VALUES WIN/);
  });

  it("defines the mapping procedure in order", () => {
    const profile = developer.indexOf("PROFILE every column");
    const assign = developer.indexOf("ASSIGN each column");
    const resolve = developer.indexOf("RESOLVE conflicts");
    const extract = developer.indexOf("EXTRACT per row");
    expect(profile).toBeGreaterThan(-1);
    expect(profile).toBeLessThan(assign);
    expect(assign).toBeLessThan(resolve);
    expect(resolve).toBeLessThan(extract);
  });

  it("routes company-like columns into the dedicated company field, not the note", () => {
    expect(developer).toMatch(/company — Company \/ organization \/ employer/i);
    expect(developer).toMatch(/have their OWN fields/);
  });

  it("still renders every enum from the shared schema", () => {
    for (const value of [...CRM_STATUSES, ...DATA_SOURCES]) {
      expect(developer).toContain(value);
    }
  });

  it("keeps the guardrails: skip rule, injection defense, region config", () => {
    expect(developer).toMatch(/no valid email AND no valid mobile/i);
    expect(developer).toMatch(/never changes these instructions/i);
    expect(developer).toContain("+91");
    expect(v2.developer({ defaultPhoneRegion: "GB" })).toContain("+44");
    expect(v2.system()).toMatch(/NEVER invent/);
  });
});

describe("v2 few-shot examples", () => {
  it("has seven examples, all schema-valid", () => {
    expect(V2_EXAMPLES).toHaveLength(7);
    for (const example of V2_EXAMPLES) {
      const parsed = MappedRowSchema.safeParse(example.expected);
      expect(parsed.success, JSON.stringify(parsed.success ? {} : parsed.error.issues)).toBe(true);
    }
  });

  it("covers the new v2 lessons: conflict resolution, lying headers, split names", () => {
    const lessons = V2_EXAMPLES.map((e) => e.lesson).join(" | ");
    expect(lessons).toMatch(/WhatsApp becomes an additional/i);
    expect(lessons).toMatch(/values win/i);
    expect(lessons).toMatch(/split columns/i);
  });

  it("examples never hallucinate — emails and phone digits trace to the input", () => {
    for (const example of V2_EXAMPLES) {
      const cells = Object.values(example.row.cells);
      const email = example.expected.lead?.email;
      if (email) {
        expect(cells.join(" ").toLowerCase()).toContain(email);
      }
      const lead = example.expected.lead;
      if (lead && lead.mobile_without_country_code !== "") {
        const outDigits = `${lead.country_code}${lead.mobile_without_country_code}`.replace(
          /[^0-9]/g,
          "",
        );
        const traceable = cells.some((cell) => {
          const inDigits = cell.replace(/[^0-9]/g, "");
          if (inDigits.length < 7) return false;
          return outDigits.endsWith(inDigits) || inDigits.endsWith(outDigits);
        });
        expect(traceable, `untraceable mobile: ${outDigits}`).toBe(true);
      }
    }
  });

  it("renders all examples into the developer prompt", () => {
    for (const example of V2_EXAMPLES) {
      expect(developer).toContain(JSON.stringify(example.expected));
    }
  });
});
