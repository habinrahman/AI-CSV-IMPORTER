import type { MappedRow } from "../../services/ai/mapping-schema";

/**
 * Few-shot examples: stored as data so unit tests can validate every output
 * against the real BatchMappingSchema — a schema-invalid example would teach
 * the model the wrong format, so tests make that impossible.
 *
 * Each example was chosen to demonstrate a distinct hard case, not a happy
 * path the model already handles.
 */
export interface PromptExample {
  /** What this example teaches — rendered as a comment line in the prompt. */
  lesson: string;
  headers: string[];
  row: { rowIndex: number; cells: Record<string, string> };
  expected: MappedRow;
}

/** Best-effort fields default to absent — examples override what the row has. */
export const BLANK_LEAD_FIELDS = {
  created_at: "",
  company: "",
  city: "",
  state: "",
  country: "",
  lead_owner: "",
  possession_time: "",
  description: "",
} as const;

export const EXAMPLES: PromptExample[] = [
  {
    lesson:
      "Synonym headers, multiple emails in one cell, split phone output, status inferred from feedback text",
    headers: ["Client", "Correo", "Mob No.", "Feedback"],
    row: {
      rowIndex: 0,
      cells: {
        Client: "  anita  DSOUZA ",
        Correo: "Anita.D@example.com; anita.backup@mail.com",
        "Mob No.": "98123 45678",
        Feedback: "very interested, wants site visit Saturday",
      },
    },
    expected: {
      rowIndex: 0,
      lead: {
        ...BLANK_LEAD_FIELDS,
        name: "Anita Dsouza",
        email: "anita.d@example.com",
        country_code: "+91",
        mobile_without_country_code: "9812345678",
        crm_status: "GOOD_LEAD_FOLLOW_UP",
        data_source: "",
        crm_note:
          "very interested, wants site visit Saturday. Additional email: anita.backup@mail.com",
      },
      skipReason: null,
      confidence: 0.93,
    },
  },
  {
    lesson: "Junk placeholders are empty values — this row has no contact, so it is skipped",
    headers: ["Name", "Email", "Phone", "City", "Notes"],
    row: {
      rowIndex: 1,
      cells: {
        Name: "Walk-in guest",
        Email: "N/A",
        Phone: "-",
        City: "Chennai",
        Notes: "visited stall, no details left",
      },
    },
    expected: {
      rowIndex: 1,
      lead: null,
      skipReason: "Row contains neither an email address nor a phone number",
      confidence: 0.98,
    },
  },
  {
    lesson:
      "Email found in an unnamed spill column by its value; existing country code (0044) is kept in the split, not replaced; project text sets data_source AND stays in the note",
    headers: ["Full Name", "Contact", "column_5", "Status", "Project"],
    row: {
      rowIndex: 2,
      cells: {
        "Full Name": "J. Mathew",
        Contact: "0044 7911 123456",
        column_5: "j.mathew@test.org",
        Status: "switched off, try later",
        Project: "Meridian Tower Ph-2",
      },
    },
    expected: {
      rowIndex: 2,
      lead: {
        ...BLANK_LEAD_FIELDS,
        name: "J. Mathew",
        email: "j.mathew@test.org",
        country_code: "+44",
        mobile_without_country_code: "7911123456",
        crm_status: "DID_NOT_CONNECT",
        data_source: "meridian_tower",
        crm_note: "switched off, try later. Project: Meridian Tower Ph-2",
      },
      skipReason: null,
      confidence: 0.9,
    },
  },
  {
    lesson:
      "Bare 91 country prefix recognized without a plus and split correctly; created_at kept in a new Date()-parseable form; sale evidence maps crm_status to SALE_DONE; no data_source evidence means empty string, never a guess",
    headers: ["name", "ph", "created", "remark"],
    row: {
      rowIndex: 3,
      cells: {
        name: "Ravi Kumar",
        ph: "919876543210",
        created: "2026-05-13 14:20:48",
        remark: "Booking amount received, sale closed",
      },
    },
    expected: {
      rowIndex: 3,
      lead: {
        ...BLANK_LEAD_FIELDS,
        created_at: "2026-05-13 14:20:48",
        name: "Ravi Kumar",
        email: "",
        country_code: "+91",
        mobile_without_country_code: "9876543210",
        crm_status: "SALE_DONE",
        data_source: "",
        crm_note: "Booking amount received, sale closed",
      },
      skipReason: null,
      confidence: 0.95,
    },
  },
];
