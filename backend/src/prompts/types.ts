/**
 * Prompts are code: versioned, typed, reviewed, and tested. A PromptModule is
 * immutable once shipped — material changes become a new version directory,
 * selected via the PROMPT_VERSION env (see docs/PROMPTS.md).
 */

export interface PromptConfig {
  /** ISO 3166-1 alpha-2 region assumed when a phone has no country code. */
  defaultPhoneRegion: string;
}

/** One batch of parsed CSV rows, addressed by their source row indices. */
export interface BatchInput {
  headers: string[];
  rows: Array<{ rowIndex: number; cells: Record<string, string> }>;
}

export interface PromptModule {
  readonly version: string;
  /** Identity + inviolable guardrails. Stable across spec changes. */
  system(): string;
  /** The task specification: field rules, evidence tables, examples. */
  developer(config: PromptConfig): string;
  /** Pure data payload for one batch. Never contains instructions. */
  user(batch: BatchInput): string;
}
