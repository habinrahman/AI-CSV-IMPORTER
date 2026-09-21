/**
 * Email-based lead deduplication for CRM imports.
 *
 * - Cross-import: skip when the normalized email already exists in crm_records
 *   (uses the email index the schema was built for).
 * - Within-import: first row with a given email wins; later duplicates skip.
 * - Phone-only leads (empty email) are never deduped by this rule.
 *
 * Emails are assumed already canonicalized by normalizeEmail (lowercase).
 */

export const CROSS_IMPORT_DEDUP_REASON =
  "Email already exists in CRM from a previous import";

export const WITHIN_IMPORT_DEDUP_REASON =
  "Duplicate email within this import (earlier row kept)";

export type EmailDedupDecision = "keep" | "cross-import" | "within-import";

/**
 * Decide whether a lead with this email should be imported.
 * Mutates `seenInImport` when the decision is to keep a non-empty email.
 */
export function decideEmailDedup(
  email: string,
  existingInCrm: ReadonlySet<string>,
  seenInImport: Set<string>,
): EmailDedupDecision {
  if (email === "") return "keep";
  if (existingInCrm.has(email)) return "cross-import";
  if (seenInImport.has(email)) return "within-import";
  seenInImport.add(email);
  return "keep";
}

export function reasonForDedup(decision: Exclude<EmailDedupDecision, "keep">): string {
  return decision === "cross-import" ? CROSS_IMPORT_DEDUP_REASON : WITHIN_IMPORT_DEDUP_REASON;
}
