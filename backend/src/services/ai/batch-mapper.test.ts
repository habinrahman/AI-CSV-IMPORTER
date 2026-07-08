import { describe, expect, it } from "vitest";
import pino from "pino";
import { AIProviderError } from "../../utils/errors";
import { BatchMapper, type BatchProgress } from "./batch-mapper";
import type { BatchMapping } from "./mapping-schema";
import type { AIProvider, BatchRow, MapBatchRequest, MapBatchResult } from "./provider/ai-provider";

const logger = pino({ level: "silent" });

const fastRetry = { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 };

function makeRows(count: number): BatchRow[] {
  return Array.from({ length: count }, (_, i) => ({
    rowIndex: i,
    cells: { name: `Lead ${i}`, email: `lead${i}@x.co` },
  }));
}

function okMapping(request: MapBatchRequest): BatchMapping {
  return {
    rows: request.rows.map((row) => ({
      rowIndex: row.rowIndex,
      lead: {
        name: `Lead ${row.rowIndex}`,
        email: `lead${row.rowIndex}@x.co`,
        created_at: "",
        country_code: "",
        mobile_without_country_code: "",
        company: "",
        city: "",
        state: "",
        country: "",
        lead_owner: "",
        possession_time: "",
        description: "",
        crm_status: null,
        data_source: "",
        crm_note: "",
      },
      skipReason: null,
      confidence: 1,
    })),
  };
}

/** Scripted provider: behavior decides per call; records every request. */
class FakeProvider implements AIProvider {
  readonly name = "fake";
  calls = 0;
  requests: MapBatchRequest[] = [];

  constructor(
    private readonly behavior: (request: MapBatchRequest, call: number) => BatchMapping,
  ) {}

  async mapBatch(request: MapBatchRequest): Promise<MapBatchResult> {
    this.requests.push(request);
    return {
      mapping: this.behavior(request, this.calls++),
      usage: { prompt: 100, completion: 40 },
    };
  }
}

describe("BatchMapper", () => {
  it("maps all rows across correctly sized batches", async () => {
    const provider = new FakeProvider((req) => okMapping(req));
    const mapper = new BatchMapper(
      provider,
      { batchSize: 20, concurrency: 1, retryPolicy: fastRetry },
      logger,
    );

    const result = await mapper.mapRows({ headers: ["name", "email"], rows: makeRows(45) });

    expect(result.batches).toBe(3);
    expect(provider.requests.map((r) => r.rows.length)).toEqual([20, 20, 5]);
    expect(result.failures).toEqual([]);
    expect(result.rows.map((r) => r.rowIndex)).toEqual(Array.from({ length: 45 }, (_, i) => i));
    // Token accounting: the fake reports 100/40 per call — 3 calls total.
    expect(result.tokens).toEqual({ prompt: 300, completion: 120 });
  });

  it("reports monotonic progress per completed batch", async () => {
    const provider = new FakeProvider((req) => okMapping(req));
    const mapper = new BatchMapper(
      provider,
      { batchSize: 10, concurrency: 2, retryPolicy: fastRetry },
      logger,
    );

    const updates: BatchProgress[] = [];
    await mapper.mapRows({
      headers: ["name", "email"],
      rows: makeRows(30),
      onProgress: (p) => updates.push({ ...p }),
    });

    expect(updates).toHaveLength(3);
    expect(updates.map((u) => u.completedBatches)).toEqual([1, 2, 3]);
    expect(updates[2]).toEqual({
      totalBatches: 3,
      completedBatches: 3,
      mappedRows: 30,
      failedRows: 0,
    });
  });

  it("feeds the model's validation failure back as a repair hint on retry", async () => {
    const provider = new FakeProvider((req, call) => {
      if (call === 0) {
        throw new AIProviderError("Response violates the mapping schema (rows.0: bad)", "fake", {
          retryable: true,
          invalidResponse: true,
        });
      }
      return okMapping(req);
    });
    const mapper = new BatchMapper(
      provider,
      { batchSize: 10, concurrency: 1, retryPolicy: fastRetry },
      logger,
    );

    await mapper.mapRows({ headers: [], rows: makeRows(3) });

    expect(provider.requests[0]?.repairHint).toBeUndefined();
    expect(provider.requests[1]?.repairHint).toMatch(/violates the mapping schema/);
  });

  it("does NOT send a repair hint after transport failures (429 is not the model's fault)", async () => {
    const provider = new FakeProvider((req, call) => {
      if (call === 0) {
        throw new AIProviderError("Rate limited (429)", "fake", { retryable: true });
      }
      return okMapping(req);
    });
    const mapper = new BatchMapper(
      provider,
      { batchSize: 10, concurrency: 1, retryPolicy: fastRetry },
      logger,
    );

    await mapper.mapRows({ headers: [], rows: makeRows(3) });

    expect(provider.requests[1]?.repairHint).toBeUndefined();
  });

  it("recovers from transient failures via retry", async () => {
    const provider = new FakeProvider((req, call) => {
      if (call === 0) {
        throw new AIProviderError("Rate limited (429)", "fake", { retryable: true });
      }
      return okMapping(req);
    });
    const mapper = new BatchMapper(
      provider,
      { batchSize: 10, concurrency: 1, retryPolicy: fastRetry },
      logger,
    );

    const result = await mapper.mapRows({ headers: [], rows: makeRows(10) });

    expect(provider.calls).toBe(2); // failed once, retried once
    expect(result.rows).toHaveLength(10);
    expect(result.failures).toEqual([]);
  });

  it("bisects a poisoned batch until only the poison row fails", async () => {
    const provider = new FakeProvider((req) => {
      if (req.rows.some((row) => row.rowIndex === 7)) {
        throw new AIProviderError("Model refused the request", "fake", { retryable: false });
      }
      return okMapping(req);
    });
    const mapper = new BatchMapper(
      provider,
      { batchSize: 10, concurrency: 1, retryPolicy: fastRetry },
      logger,
    );

    const result = await mapper.mapRows({ headers: [], rows: makeRows(10) });

    expect(result.failures).toEqual([{ rowIndex: 7, message: "Model refused the request" }]);
    expect(result.rows.map((r) => r.rowIndex).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 8, 9,
    ]);
  });

  it("propagates fatal errors instead of degrading them to row failures", async () => {
    const provider = new FakeProvider(() => {
      throw new AIProviderError("Provider rejected configuration (HTTP 401)", "fake", {
        retryable: false,
        fatal: true,
      });
    });
    const mapper = new BatchMapper(
      provider,
      { batchSize: 5, concurrency: 1, retryPolicy: fastRetry },
      logger,
    );

    await expect(mapper.mapRows({ headers: [], rows: makeRows(10) })).rejects.toMatchObject({
      fatal: true,
    });
    // No bisection spiral on a config error.
    expect(provider.calls).toBe(1);
  });

  it("treats row-coverage violations as retryable, then isolates them", async () => {
    // Persistently answers about the wrong rows.
    const provider = new FakeProvider((req) => ({
      rows: okMapping(req).rows.map((row) => ({ ...row, rowIndex: row.rowIndex + 1000 })),
    }));
    const mapper = new BatchMapper(
      provider,
      { batchSize: 2, concurrency: 1, retryPolicy: { ...fastRetry, maxRetries: 1 } },
      logger,
    );

    const result = await mapper.mapRows({ headers: [], rows: makeRows(2) });

    expect(result.rows).toEqual([]);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]?.message).toMatch(/covered rows/);
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const provider = new FakeProvider((req) => okMapping(req));
    const mapper = new BatchMapper(
      provider,
      { batchSize: 5, concurrency: 1, retryPolicy: fastRetry },
      logger,
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      mapper.mapRows({ headers: [], rows: makeRows(5), signal: controller.signal }),
    ).rejects.toHaveProperty("name", "AbortError");
    expect(provider.calls).toBe(0);
  });

  it("never exceeds the configured concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const provider = new FakeProvider((req) => okMapping(req));
    provider.mapBatch = async (request) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight -= 1;
      return { mapping: okMapping(request) };
    };

    const mapper = new BatchMapper(
      provider,
      { batchSize: 5, concurrency: 2, retryPolicy: fastRetry },
      logger,
    );
    await mapper.mapRows({ headers: [], rows: makeRows(30) }); // 6 batches

    expect(peak).toBe(2);
  });
});
