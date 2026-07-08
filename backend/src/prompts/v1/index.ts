import type { PromptModule } from "../types";
import { buildDeveloperPrompt } from "./developer";
import { buildSystemPrompt } from "./system";
import { buildUserPrompt } from "./user";

/**
 * v1 — initial prompt version. IMMUTABLE once shipped: material changes are a
 * new version directory, never edits here (see docs/PROMPTS.md).
 */
export const promptV1: PromptModule = {
  version: "v1",
  system: buildSystemPrompt,
  developer: buildDeveloperPrompt,
  user: buildUserPrompt,
};
