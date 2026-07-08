import type { PromptModule } from "./types";
import { promptV1 } from "./v1";
import { promptV2 } from "./v2";

export type { BatchInput, PromptConfig, PromptModule } from "./types";

const REGISTRY: Record<string, PromptModule> = {
  [promptV1.version]: promptV1,
  [promptV2.version]: promptV2,
};

/**
 * Resolve the active prompt module. The env schema already restricts
 * PROMPT_VERSION to known versions, so this throw is a second line of
 * defense (e.g. a version removed while still configured somewhere).
 */
export function getPromptModule(version: string): PromptModule {
  const module = REGISTRY[version];
  if (!module) {
    const known = Object.keys(REGISTRY).join(", ");
    throw new Error(`Unknown prompt version "${version}" (known: ${known})`);
  }
  return module;
}
