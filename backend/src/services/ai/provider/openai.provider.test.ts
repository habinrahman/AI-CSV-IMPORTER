import OpenAI from "openai";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { getPromptModule } from "../../../prompts";
import { AIProviderError } from "../../../utils/errors";
import { classifyOpenAIError, OpenAIProvider, parseBatchMapping } from "./openai.provider";

const logger = pino({ level: "silent" });

const VALID_CONTENT = JSON.stringify({
  rows: [
    {
      rowIndex: 0,
      lead: {
        created_at: "",
        name: "Ravi Kumar",
        email: "ravi@x.co",
        country_code: "+91",
        mobile_without_country_code: "9876543210",
        company: "",
        city: "",
        state: "",
        country: "",
        lead_owner: "",
        crm_status: null,
        crm_note: "",
        data_source: "",
        possession_time: "",
        description: "",
      },
      skipReason: null,
      confidence: 0.9,
    },
  ],
});

function makeProvider(createImpl: (...args: unknown[]) => unknown) {
  const create = vi.fn(createImpl);
  const client = { chat: { completions: { create } } } as unknown as OpenAI;
  const provider = new OpenAIProvider({
    apiKey: "test-key",
    model: "gpt-test",
    timeoutMs: 1000,
    promptModule: getPromptModule("v1"),
    promptConfig: { defaultPhoneRegion: "IN" },
    logger,
    client,
  });
  return { provider, create };
}

function completionWith(overrides: Record<string, unknown>) {
  return {
    choices: [
      {
        message: { content: VALID_CONTENT, refusal: null },
        finish_reason: "stop",
        ...overrides,
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
}

/** Instances for classification tests without invoking SDK constructors. */
function apiError(status: number, headers?: Record<string, string>): OpenAI.APIError {
  return Object.assign(Object.create(OpenAI.APIError.prototype), {
    status,
    headers,
    message: `HTTP ${status}`,
  });
}

const request = {
  headers: ["name", "email"],
  rows: [{ rowIndex: 0, cells: { name: "Ravi Kumar", email: "ravi@x.co" } }],
};

describe("OpenAIProvider.mapBatch", () => {
  it("sends system+developer+user roles with strict structured outputs", async () => {
    const { provider, create } = makeProvider(async () => completionWith({}));

    const result = await provider.mapBatch(request);

    expect(result.mapping.rows[0]?.lead?.email).toBe("ravi@x.co");
    const [body] = create.mock.calls[0] as [Record<string, unknown>];
    const messages = body["messages"] as Array<{ role: string }>;
    expect(messages.map((m) => m.role)).toEqual(["system", "system", "user"]);
    expect(body["temperature"]).toBe(0);
    const format = body["response_format"] as { type: string };
    expect(format.type).toBe("json_schema");
  });

  it("classifies a refusal as non-retryable (bisection's job)", async () => {
    const { provider } = makeProvider(async () =>
      completionWith({ message: { content: null, refusal: "I cannot help with that" } }),
    );

    await expect(provider.mapBatch(request)).rejects.toMatchObject({
      retryable: false,
      fatal: false,
    });
  });

  it("classifies token-limit truncation as non-retryable", async () => {
    const { provider } = makeProvider(async () => completionWith({ finish_reason: "length" }));

    await expect(provider.mapBatch(request)).rejects.toMatchObject({ retryable: false });
  });

  it("classifies an empty body as retryable", async () => {
    const { provider } = makeProvider(async () =>
      completionWith({ message: { content: null, refusal: null } }),
    );

    await expect(provider.mapBatch(request)).rejects.toMatchObject({ retryable: true });
  });

  it("classifies SDK throw via classifyOpenAIError", async () => {
    const { provider } = makeProvider(async () => {
      throw apiError(429, { "retry-after": "2" });
    });

    await expect(provider.mapBatch(request)).rejects.toMatchObject({
      retryable: true,
      retryAfterMs: 2000,
    });
  });

  it("appends a repair-hint message when the request carries one", async () => {
    const { provider, create } = makeProvider(async () => completionWith({}));

    await provider.mapBatch({ ...request, repairHint: "rows.0.confidence: too large" });

    const [body] = create.mock.calls[0] as [Record<string, unknown>];
    const messages = body["messages"] as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(4);
    expect(messages[3]?.role).toBe("user");
    expect(messages[3]?.content).toContain("rows.0.confidence: too large");
  });
});

describe("parseBatchMapping", () => {
  it("accepts a schema-valid body without repair", () => {
    const result = parseBatchMapping(VALID_CONTENT, "openai");
    expect(result.mapping.rows).toHaveLength(1);
    expect(result.repaired).toBe(false);
  });

  it("repairs markdown code fences", () => {
    const fenced = "```json\n" + VALID_CONTENT + "\n```";
    const result = parseBatchMapping(fenced, "openai");
    expect(result.mapping.rows).toHaveLength(1);
    expect(result.repaired).toBe(true);
  });

  it("repairs prose wrapped around the JSON body", () => {
    const chatty = `Here is the mapping you asked for:\n${VALID_CONTENT}\nLet me know if you need anything else!`;
    const result = parseBatchMapping(chatty, "openai");
    expect(result.mapping.rows).toHaveLength(1);
    expect(result.repaired).toBe(true);
  });

  it("repairs trailing commas", () => {
    const trailing = VALID_CONTENT.replace('"confidence":0.9}', '"confidence":0.9,}');
    const result = parseBatchMapping(trailing, "openai");
    expect(result.mapping.rows).toHaveLength(1);
    expect(result.repaired).toBe(true);
  });

  it("rejects unrepairable non-JSON as retryable + invalidResponse", () => {
    try {
      parseBatchMapping("no json here at all", "openai");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).retryable).toBe(true);
      expect((err as AIProviderError).invalidResponse).toBe(true);
    }
  });

  it("rejects schema violations — including the lead/skipReason exclusivity", () => {
    const bothNull = JSON.stringify({
      rows: [{ rowIndex: 0, lead: null, skipReason: null, confidence: 0.5 }],
    });
    try {
      parseBatchMapping(bothNull, "openai");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AIProviderError);
      expect((err as AIProviderError).message).toMatch(/Exactly one of lead or skipReason/);
    }
  });

  it("rejects out-of-range confidence (wire schema cannot express bounds)", () => {
    const tooConfident = VALID_CONTENT.replace('"confidence":0.9', '"confidence":1.5');
    expect(() => parseBatchMapping(tooConfident, "openai")).toThrowError(AIProviderError);
  });
});

describe("classifyOpenAIError", () => {
  it("429 → retryable with Retry-After floor", () => {
    const err = classifyOpenAIError(apiError(429, { "retry-after": "30" }), "openai");
    expect(err).toMatchObject({ retryable: true, retryAfterMs: 30_000 });
  });

  it("5xx → retryable", () => {
    expect(classifyOpenAIError(apiError(503), "openai")).toMatchObject({ retryable: true });
  });

  it("401 → fatal (abort the job, do not burn the retry budget)", () => {
    expect(classifyOpenAIError(apiError(401), "openai")).toMatchObject({
      retryable: false,
      fatal: true,
    });
  });

  it("400 → non-retryable but bisectable", () => {
    expect(classifyOpenAIError(apiError(400), "openai")).toMatchObject({
      retryable: false,
      fatal: false,
    });
  });

  it("user abort → surfaces as AbortError, never a provider failure", () => {
    const abort = Object.create(OpenAI.APIUserAbortError.prototype);
    const err = classifyOpenAIError(abort, "openai");
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
  });

  it("unknown errors default to retryable", () => {
    expect(classifyOpenAIError(new Error("socket hang up"), "openai")).toMatchObject({
      retryable: true,
    });
  });
});
