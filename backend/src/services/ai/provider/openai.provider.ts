import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Logger } from "../../../logger";
import type { PromptConfig, PromptModule } from "../../../prompts";
import { AIProviderError } from "../../../utils/errors";
import { parseJsonLeniently } from "../json-repair";
import { BatchMappingSchema, BatchMappingWireSchema, type BatchMapping } from "../mapping-schema";
import type { AIProvider, MapBatchRequest, MapBatchResult } from "./ai-provider";

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  promptModule: PromptModule;
  promptConfig: PromptConfig;
  logger: Logger;
  /** Test seam: inject a stub client instead of a real one. */
  client?: OpenAI;
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";

  private readonly client: OpenAI;
  private readonly model: string;
  private readonly prompts: PromptModule;
  private readonly logger: Logger;
  /** The task spec is identical for every batch — render it once. */
  private readonly systemPrompt: string;
  private readonly developerPrompt: string;

  constructor(options: OpenAIProviderOptions) {
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        timeout: options.timeoutMs,
        // We own retries (services/ai/retry.ts). The SDK's built-in retries
        // would multiply with ours into an unpredictable retry storm.
        maxRetries: 0,
      });
    this.model = options.model;
    this.prompts = options.promptModule;
    this.logger = options.logger;
    this.systemPrompt = this.prompts.system();
    this.developerPrompt = this.prompts.developer(options.promptConfig);
  }

  async mapBatch(request: MapBatchRequest): Promise<MapBatchResult> {
    // The developer spec rides as a second system message: portable across
    // models whether or not they support a dedicated "developer" role.
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: this.systemPrompt },
      { role: "system", content: this.developerPrompt },
      {
        role: "user",
        content: this.prompts.user({ headers: request.headers, rows: request.rows }),
      },
    ];
    if (request.repairHint) {
      messages.push({
        role: "user",
        content: `Your previous response was rejected: ${request.repairHint}. Return corrected JSON for the same rows, fixing exactly these issues.`,
      });
    }

    let completion;
    try {
      completion = await this.client.chat.completions.create(
        {
          model: this.model,
          messages,
          // Deterministic extraction, not creative writing.
          temperature: 0,
          response_format: zodResponseFormat(BatchMappingWireSchema, "batch_mapping"),
        },
        { signal: request.signal },
      );
    } catch (error) {
      throw classifyOpenAIError(error, this.name);
    }

    if (completion.usage) {
      this.logger.debug(
        { model: this.model, rows: request.rows.length, usage: completion.usage },
        "OpenAI batch completed",
      );
    }

    const choice = completion.choices[0];
    if (choice?.message?.refusal) {
      // A refusal repeats on retry; let bisection isolate whatever triggered it.
      throw new AIProviderError(`Model refused the request: ${choice.message.refusal}`, this.name, {
        retryable: false,
      });
    }
    if (choice?.finish_reason === "length") {
      // Output truncated — retrying the same size cannot help, but halving
      // the batch (bisection) shrinks the required output.
      throw new AIProviderError("Response truncated by token limit", this.name, {
        retryable: false,
      });
    }
    const content = choice?.message?.content;
    if (!content) {
      throw new AIProviderError("Provider returned an empty response", this.name, {
        retryable: true,
      });
    }

    const parsed = parseBatchMapping(content, this.name);
    if (parsed.repaired) {
      this.logger.warn(
        { model: this.model, rows: request.rows.length },
        "Response JSON required mechanical repair (fences/prose/trailing commas)",
      );
    }
    return {
      mapping: parsed.mapping,
      ...(completion.usage
        ? {
            usage: {
              prompt: completion.usage.prompt_tokens,
              completion: completion.usage.completion_tokens,
            },
          }
        : {}),
    };
  }
}

/**
 * Structured outputs guarantee shape only when the request succeeds — a
 * malformed or schema-violating body is still a model error. Almost-JSON is
 * mechanically repaired first (fences, surrounding prose, trailing commas);
 * anything beyond that is a retryable error so the backoff path gets a
 * chance before bisection.
 */
export function parseBatchMapping(
  content: string,
  provider: string,
): { mapping: BatchMapping; repaired: boolean } {
  const lenient = parseJsonLeniently(content);
  if (lenient === null) {
    throw new AIProviderError("Response is not valid JSON (repair failed)", provider, {
      retryable: true,
      invalidResponse: true,
    });
  }

  const result = BatchMappingSchema.safeParse(lenient.value);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new AIProviderError(`Response violates the mapping schema (${summary})`, provider, {
      retryable: true,
      invalidResponse: true,
    });
  }
  return { mapping: result.data, repaired: lenient.repaired };
}

/** Map SDK errors onto the retryable / bisect / fatal tiers. */
export function classifyOpenAIError(error: unknown, provider: string): unknown {
  // Cancellation must surface as cancellation, never as a provider failure.
  if (error instanceof OpenAI.APIUserAbortError) {
    return new DOMException("Aborted", "AbortError");
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AIProviderError("Request timed out", provider, { retryable: true });
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status ?? 0;
    if (status === 429) {
      // OpenAI reports an EMPTY BALANCE as 429 too — but unlike a rate
      // limit, no amount of waiting fixes it. Abort the job with an
      // actionable message instead of burning the retry budget per batch.
      if (error.code === "insufficient_quota") {
        return new AIProviderError(
          "OpenAI quota exhausted — add credits to the account/project this API key belongs to",
          provider,
          { retryable: false, fatal: true },
        );
      }
      return new AIProviderError("Rate limited (429)", provider, {
        retryable: true,
        retryAfterMs: readRetryAfterMs(error.headers),
      });
    }
    if (status >= 500 || status === 408) {
      return new AIProviderError(`Provider error (HTTP ${status})`, provider, {
        retryable: true,
      });
    }
    if (status === 401 || status === 403 || status === 404) {
      // Wrong key or unknown model: every batch would fail identically —
      // abort the job instead of burning the retry budget N times.
      return new AIProviderError(`Provider rejected configuration (HTTP ${status})`, provider, {
        retryable: false,
        fatal: true,
      });
    }
    // 400s: deterministic for this payload (e.g. context overflow) —
    // retrying is futile but a smaller batch may fit, so let bisection try.
    return new AIProviderError(`Provider rejected request (HTTP ${status})`, provider, {
      retryable: false,
    });
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AIProviderError("Connection to provider failed", provider, { retryable: true });
  }
  return new AIProviderError(
    `Unexpected provider failure: ${error instanceof Error ? error.message : String(error)}`,
    provider,
    { retryable: true },
  );
}

function readRetryAfterMs(headers: unknown): number | undefined {
  let value: string | null | undefined;
  if (headers instanceof Headers) {
    value = headers.get("retry-after");
  } else if (headers && typeof headers === "object") {
    value = (headers as Record<string, string>)["retry-after"];
  }
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
