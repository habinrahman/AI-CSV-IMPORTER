import type { CrmLead } from "@groweasy/shared";
import { normalizeEmail } from "./email";
import { normalizeMobileParts } from "./phone";

export interface NormalizedLead {
  lead: CrmLead;
  /** Non-fatal notes: values that had to be discarded or cleaned up. */
  warnings: string[];
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * The deterministic authority over a model-mapped lead. The model's output
 * is best-effort; every rule here is enforced regardless of what it claimed:
 * emails lowercased or discarded, mobiles re-parsed into a canonical
 * country_code + national split or discarded, created_at guaranteed
 * `new Date()`-convertible or discarded, whitespace collapsed. Discards
 * produce warnings, never silent data changes — and never "corrections"
 * (repairing a value would be inventing data).
 * crm_status/data_source need no handling here: Zod already enum-validated.
 */
export function normalizeLead(lead: CrmLead, defaultRegion: string): NormalizedLead {
  const warnings: string[] = [];

  let email = "";
  if (lead.email.trim() !== "") {
    const normalized = normalizeEmail(lead.email);
    if (normalized) {
      email = normalized;
    } else {
      warnings.push(`Discarded invalid email "${lead.email}"`);
    }
  }

  // The model may split the phone or put everything in the national field —
  // re-parse the combination so the split is libphonenumber's, not the
  // model's. Either way the output is canonical or discarded.
  let country_code = "";
  let mobile_without_country_code = "";
  const rawPhone = [lead.country_code, lead.mobile_without_country_code]
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" ");
  if (rawPhone !== "") {
    const parts = normalizeMobileParts(rawPhone, defaultRegion);
    if (parts) {
      ({ country_code, mobile_without_country_code } = parts);
    } else {
      warnings.push(`Discarded unparseable mobile "${rawPhone}"`);
    }
  }

  // The spec's contract is `new Date(created_at)` must work — a date that
  // does not parse is discarded, never reinterpreted.
  let created_at = "";
  const rawDate = lead.created_at.trim();
  if (rawDate !== "") {
    if (Number.isFinite(new Date(rawDate).getTime())) {
      created_at = rawDate;
    } else {
      warnings.push(`Discarded unparseable created_at "${lead.created_at}"`);
    }
  }

  return {
    lead: {
      ...lead,
      created_at,
      name: collapseWhitespace(lead.name),
      email,
      country_code,
      mobile_without_country_code,
      company: collapseWhitespace(lead.company),
      city: collapseWhitespace(lead.city),
      state: collapseWhitespace(lead.state),
      country: collapseWhitespace(lead.country),
      lead_owner: collapseWhitespace(lead.lead_owner),
      crm_note: collapseWhitespace(lead.crm_note),
      possession_time: collapseWhitespace(lead.possession_time),
      description: collapseWhitespace(lead.description),
    },
    warnings,
  };
}
