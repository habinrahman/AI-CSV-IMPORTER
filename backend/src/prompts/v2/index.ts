import type { PromptModule } from "../types";
import { buildUserPrompt } from "../v1/user";
import { buildDeveloperPrompt } from "./developer";
import { buildSystemPrompt } from "./system";

/**
 * v2 — semantic-mapping upgrade: explicit mapping procedure, header-synonym
 * bank (60+ spellings), values-win-over-headers law, conflict resolution,
 * 7 row-level examples. IMMUTABLE once shipped, like every version.
 *
 * The user-prompt builder is shared with v1 (pure data payload — nothing to
 * version); importing from an immutable version is a stable dependency.
 */
export const promptV2: PromptModule = {
  version: "v2",
  system: buildSystemPrompt,
  developer: buildDeveloperPrompt,
  user: buildUserPrompt,
};
