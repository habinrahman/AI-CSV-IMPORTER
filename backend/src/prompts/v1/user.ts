import type { BatchInput } from "../types";

/**
 * User prompt: pure data, zero instructions. Keeping instructions out of the
 * data role is both a clarity and a prompt-injection measure — nothing a CSV
 * cell contains ever shares a role with our rules.
 */
export function buildUserPrompt(batch: BatchInput): string {
  return [
    `Map these ${batch.rows.length} CSV rows to CRM lead records.`,
    `Headers: ${JSON.stringify(batch.headers)}`,
    `Rows: ${JSON.stringify(batch.rows)}`,
  ].join("\n");
}
