import type { PromptExample } from "../v1/examples";
import { BLANK_LEAD_FIELDS, EXAMPLES as V1_EXAMPLES } from "../v1/examples";

/**
 * v2 row-level examples = the four v1 hard cases (shared, so both versions
 * teach the same schema) plus three new ones exercising the v2 procedure:
 * conflict resolution with dedicated context fields, values-over-headers,
 * and name assembly. All validated against MappedRowSchema by tests.
 */
export const V2_EXAMPLES: PromptExample[] = [
  ...V1_EXAMPLES,
  {
    lesson:
      "Two phone columns: the header signaling primary wins; WhatsApp becomes an additional phone in the note. Company and city land in their OWN fields, not the note",
    headers: ["Prospect", "Primary Mobile", "WhatsApp", "Company", "City", "Comments"],
    row: {
      rowIndex: 4,
      cells: {
        Prospect: "Meera Nair",
        "Primary Mobile": "98450 12345",
        WhatsApp: "97400 55555",
        Company: "Acme Realty",
        City: "Kochi",
        Comments: "prefers WhatsApp after 7pm",
      },
    },
    expected: {
      rowIndex: 4,
      lead: {
        ...BLANK_LEAD_FIELDS,
        name: "Meera Nair",
        email: "",
        country_code: "+91",
        mobile_without_country_code: "9845012345",
        company: "Acme Realty",
        city: "Kochi",
        crm_status: null,
        data_source: "",
        crm_note: "prefers WhatsApp after 7pm. Additional phone: 97400 55555",
      },
      skipReason: null,
      confidence: 0.92,
    },
  },
  {
    lesson:
      "Headers lie — values win: the column NAMED Email holds phone numbers and the column named Contact holds the email address",
    headers: ["Client", "Email", "Contact"],
    row: {
      rowIndex: 5,
      cells: {
        Client: "Arjun Rao",
        Email: "99887 76655",
        Contact: "arjun.rao@mail.in",
      },
    },
    expected: {
      rowIndex: 5,
      lead: {
        ...BLANK_LEAD_FIELDS,
        name: "Arjun Rao",
        email: "arjun.rao@mail.in",
        country_code: "+91",
        mobile_without_country_code: "9988776655",
        crm_status: null,
        data_source: "",
        crm_note: "",
      },
      skipReason: null,
      confidence: 0.85,
    },
  },
  {
    lesson:
      "Name assembled from split columns in column order; crm_status evidence from a Disposition column; source column mapped to the enum; owner and possession fill their own fields",
    headers: [
      "first_name",
      "last_name",
      "Work Email",
      "Assigned To",
      "Possession",
      "Disposition",
      "Campaign",
    ],
    row: {
      rowIndex: 6,
      cells: {
        first_name: "sunita",
        last_name: "IYER",
        "Work Email": "S.Iyer@corp.example.com",
        "Assigned To": "priya@groweasy.ai",
        Possession: "Dec 2026",
        Disposition: "not interested, budget too low",
        Campaign: "Leads on Demand - June",
      },
    },
    expected: {
      rowIndex: 6,
      lead: {
        ...BLANK_LEAD_FIELDS,
        name: "Sunita Iyer",
        email: "s.iyer@corp.example.com",
        country_code: "",
        mobile_without_country_code: "",
        lead_owner: "priya@groweasy.ai",
        possession_time: "Dec 2026",
        crm_status: "BAD_LEAD",
        data_source: "leads_on_demand",
        crm_note: "not interested, budget too low",
      },
      skipReason: null,
      confidence: 0.93,
    },
  },
];
