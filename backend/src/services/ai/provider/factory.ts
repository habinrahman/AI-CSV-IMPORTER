import { env } from "../../../config/env";
import type { Logger } from "../../../logger";
import { getPromptModule } from "../../../prompts";
import type { AIProvider } from "./ai-provider";
import { OpenAIProvider } from "./openai.provider";

/**
 * The only place the application decides which vendor to talk to.
 * Switching providers is exactly one env change (AI_PROVIDER); adding one is
 * a new adapter class plus a case here — no call site changes.
 */
export function createAIProvider(logger: Logger): AIProvider {
  switch (env.AI_PROVIDER) {
    case "openai": {
      if (!env.OPENAI_API_KEY) {
        throw new Error(
          "OPENAI_API_KEY is required when AI_PROVIDER=openai — set it in backend/.env",
        );
      }
      return new OpenAIProvider({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        timeoutMs: env.AI_TIMEOUT_MS,
        promptModule: getPromptModule(env.PROMPT_VERSION),
        promptConfig: { defaultPhoneRegion: env.DEFAULT_PHONE_REGION },
        logger,
      });
    }
  }
}
