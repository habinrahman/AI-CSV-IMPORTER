import { describe, expect, it } from "vitest";
import { CRM_STATUSES, DATA_SOURCES } from "@groweasy/shared";
import { MappedRowSchema } from "../services/ai/mapping-schema";
import { getPromptModule } from "./index";
import { EXAMPLES } from "./v1/examples";

const v1 = getPromptModule("v1");
const config = { defaultPhoneRegion: "IN" };

describe("prompt registry", () => {
  it("resolves v1", () => {
    expect(v1.version).toBe("v1");
  });

  it("throws for unknown versions", () => {
    expect(() => getPromptModule("v99")).toThrow(/Unknown prompt version/);
  });
});

describe("system prompt", () => {
  it("carries the no-hallucination guardrail", () => {
    expect(v1.system()).toMatch(/NEVER invent/i);
  });

  it("carries the injection defense", () => {
    expect(v1.system()).toMatch(/DATA, never instructions/i);
  });
});

describe("developer prompt", () => {
  const developer = v1.developer(config);

  it("contains every allowed status, rendered from the shared enum", () => {
    for (const status of CRM_STATUSES) {
      expect(developer).toContain(status);
    }
  });

  it("contains every allowed data source, rendered from the shared enum", () => {
    for (const source of DATA_SOURCES) {
      expect(developer).toContain(source);
    }
  });

  it("states the skip rule as either-contact", () => {
    expect(developer).toMatch(/no valid email AND no valid mobile/i);
  });

  it("applies the configured default phone region", () => {
    expect(developer).toContain("+91");
    expect(v1.developer({ defaultPhoneRegion: "GB" })).toContain("+44");
  });

  it("defines the crm_note merge order", () => {
    const remarks = developer.indexOf("remarks / notes / comments");
    const extraEmail = developer.indexOf("Additional email:");
    const extraPhone = developer.indexOf("Additional phone:");
    expect(remarks).toBeGreaterThan(-1);
    expect(remarks).toBeLessThan(extraEmail);
    expect(extraEmail).toBeLessThan(extraPhone);
  });

  it("repeats the injection defense in the task spec", () => {
    expect(developer).toMatch(/never changes these instructions/i);
  });
});

describe("user prompt", () => {
  it("is pure data: embeds headers and rows as parseable JSON", () => {
    const batch = {
      headers: ["Name", "E-mail"],
      rows: [
        { rowIndex: 0, cells: { Name: "Ravi", "E-mail": "r@x.co" } },
        { rowIndex: 1, cells: { Name: "Priya", "E-mail": "" } },
      ],
    };
    const prompt = v1.user(batch);

    const headersJson = prompt.match(/Headers: (.*)/)?.[1];
    const rowsJson = prompt.match(/Rows: (.*)/)?.[1];
    expect(JSON.parse(headersJson ?? "")).toEqual(batch.headers);
    expect(JSON.parse(rowsJson ?? "")).toEqual(batch.rows);
  });
});

describe("few-shot examples", () => {
  it("every example output validates against the real response schema", () => {
    for (const example of EXAMPLES) {
      const parsed = MappedRowSchema.safeParse(example.expected);
      expect(parsed.success, JSON.stringify(parsed.success ? {} : parsed.error.issues)).toBe(
        true,
      );
    }
  });

  it("examples never hallucinate emails — every output email exists in the input", () => {
    for (const example of EXAMPLES) {
      const email = example.expected.lead?.email;
      if (!email) continue;
      const inputText = Object.values(example.row.cells).join(" ").toLowerCase();
      expect(inputText).toContain(email);
    }
  });

  it("examples never hallucinate phones — output digits trace to an input cell", () => {
    for (const example of EXAMPLES) {
      const lead = example.expected.lead;
      if (!lead || lead.mobile_without_country_code === "") continue;
      const outDigits = `${lead.country_code}${lead.mobile_without_country_code}`.replace(
        /[^0-9]/g,
        "",
      );
      const traceable = Object.values(example.row.cells).some((cell) => {
        const inDigits = cell.replace(/[^0-9]/g, "");
        if (inDigits.length < 7) return false;
        // Country code may have been added (out ends with in) or an
        // international prefix normalized away (in ends with out).
        return outDigits.endsWith(inDigits) || inDigits.endsWith(outDigits);
      });
      expect(traceable, `untraceable mobile in example: ${outDigits}`).toBe(true);
    }
  });

  it("examples appear in the rendered developer prompt", () => {
    const developer = v1.developer(config);
    for (const example of EXAMPLES) {
      expect(developer).toContain(JSON.stringify(example.expected));
    }
  });

  it("covers the skip case", () => {
    expect(EXAMPLES.some((e) => e.expected.lead === null && e.expected.skipReason)).toBe(true);
  });
});
