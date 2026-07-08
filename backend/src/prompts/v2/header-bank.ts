/**
 * The header-synonym bank: dozens of real-world header spellings per mapping
 * target, rendered into the developer prompt as compact lines. Stored as
 * data so tests can assert coverage (and count that "dozens" stays true).
 *
 * Deliberately non-exhaustive — the prompt says so. The bank teaches the
 * *clusters*; semantics generalize beyond the listed spellings.
 */
export interface HeaderCluster {
  /** Where these columns map. */
  target: string;
  headers: string[];
}

export const HEADER_BANK: HeaderCluster[] = [
  {
    target: "name",
    headers: [
      "Name",
      "Full Name",
      "Customer Name",
      "Lead Name",
      "Client",
      "Prospect",
      "Contact Person",
      "Person",
      "Buyer",
      "Applicant",
      "Attendee",
      "POC",
      "first_name + last_name (combine, in column order)",
      "fname / lname",
      "Nome",
      "Naam",
    ],
  },
  {
    target: "created_at",
    headers: [
      "Created",
      "Created At",
      "Date",
      "Lead Date",
      "Enquiry Date",
      "Timestamp",
      "Added On",
      "created_time",
    ],
  },
  {
    target: "mobile (split into country_code + mobile_without_country_code)",
    headers: [
      "Phone",
      "Mobile",
      "Mobile No.",
      "Primary Mobile",
      "WhatsApp",
      "WhatsApp Number",
      "Contact",
      "Contact No",
      "Cell",
      "Ph#",
      "Mob",
      "Tel",
      "Telephone",
      "Telefono",
      "phone_number",
      "contact_no",
      "Reachable At",
      "Alternate Phone (additional → crm_note)",
      "Phone 2 (additional → crm_note)",
    ],
  },
  {
    target: "email",
    headers: [
      "Email",
      "E-mail",
      "Email ID",
      "Work Email",
      "Contact Email",
      "Official Email",
      "Personal Email",
      "Mail",
      "Mail ID",
      "Correo",
      "Courriel",
      "email_address",
      "lead_email",
      "Secondary Email (additional → crm_note)",
    ],
  },
  {
    target: "crm_note (verbatim remarks)",
    headers: [
      "Remarks",
      "Comments",
      "Notes",
      "Internal Notes",
      "Feedback",
      "Follow-up",
      "Follow Up Notes",
      "Call Notes",
      "Agent Comments",
      "Disposition Notes",
      "Observations",
      "Next Action",
    ],
  },
  {
    target: "status evidence (map to the status enum, never verbatim)",
    headers: [
      "Status",
      "Call Status",
      "Lead Status",
      "Disposition",
      "Outcome",
      "Call Result",
      "Stage",
      "Result",
    ],
  },
  {
    target: "data_source evidence (map to the source enum only when confident)",
    headers: [
      "Source",
      "Lead Source",
      "Campaign",
      "Project",
      "Property",
      "Site",
      "Channel",
    ],
  },
  {
    target: "company",
    headers: ["Company", "Organization", "Employer", "Business", "Firm", "Company Name"],
  },
  {
    target: "city / state / country (location fields; a combined cell may fill several)",
    headers: ["City", "Location", "Area", "State", "Region", "Country"],
  },
  {
    target: "lead_owner",
    headers: ["Lead Owner", "Owner", "Assigned To", "Agent", "Executive", "RM"],
  },
  {
    target: "possession_time",
    headers: ["Possession", "Possession Time", "Handover", "Ready By"],
  },
  {
    target: "description (longer requirement text — call remarks stay in crm_note)",
    headers: ["Description", "Details", "Requirement", "Interested In"],
  },
  {
    target: 'crm_note as "<Header>: <value>" (lead context with NO dedicated field)',
    headers: ["Budget", "Designation", "Job Title", "Industry", "Preferred Time"],
  },
  {
    target: "ignore (row bookkeeping carries no lead information)",
    headers: ["S.No", "Sr. No", "Serial", "Row ID", "Record ID", "Index", "#"],
  },
];

export function renderHeaderBank(): string {
  return HEADER_BANK.map(
    (cluster) => `- → ${cluster.target}:\n  ${cluster.headers.join(" | ")}`,
  ).join("\n");
}

/** Total example count — tests keep "dozens" honest. */
export function headerBankSize(): number {
  return HEADER_BANK.reduce((sum, cluster) => sum + cluster.headers.length, 0);
}
