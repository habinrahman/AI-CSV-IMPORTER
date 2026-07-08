import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ImportResult } from "@groweasy/shared";
import { AIProviderError } from "../../utils/errors";
import { BatchMapper } from "../ai/batch-mapper";
import type { BatchMapping } from "../ai/mapping-schema";
import type { AIProvider, MapBatchRequest, MapBatchResult } from "../ai/provider/ai-provider";
import { StreamingCsvParser } from "../csv/csv-parse.service";
import { ImportPipeline, type PipelineProgress } from "./import-pipeline";

const logger = pino({ level: "silent" });

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "groweasy-pipeline-test-"));
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

let fileCounter = 0;
function writeCsv(content: string): string {
  const filePath = path.join(dir, `fixture-${fileCounter++}.csv`);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

/**
 * Deterministic stand-in for the model: echoes known cells into lead fields
 * exactly as a faithful mapper would, so pipeline behavior — not model
 * behavior — is what the assertions exercise.
 */
class EchoProvider implements AIProvider {
  readonly name = "echo";
  requests: MapBatchRequest[] = [];

  async mapBatch(request: MapBatchRequest): Promise<MapBatchResult> {
    this.requests.push(request);
    if (request.rows.some((row) => row.cells["name"] === "POISON")) {
      throw new AIProviderError("Model refused the request", this.name, { retryable: false });
    }
    const mapping: BatchMapping = {
      rows: request.rows.map((row) => {
        const email = row.cells["email"] ?? "";
        const phone = row.cells["phone"] ?? "";
        if (email.trim() === "" && phone.trim() === "") {
          return {
            rowIndex: row.rowIndex,
            lead: null,
            skipReason: "Row contains neither an email address nor a phone number",
            confidence: 0.97,
          };
        }
        return {
          rowIndex: row.rowIndex,
          lead: {
            created_at: "",
            name: row.cells["name"] ?? "",
            email,
            // Faithful mapper: hands the raw phone over unsplit — the
            // pipeline's normalizer owns the canonical split.
            country_code: "",
            mobile_without_country_code: phone,
            company: "",
            city: "",
            state: "",
            country: "",
            lead_owner: "",
            crm_status: null,
            crm_note: row.cells["remark"] ?? "",
            data_source: "",
            possession_time: "",
            description: "",
          },
          skipReason: null,
          confidence: row.cells["name"] === "LowConf" ? 0.4 : 0.95,
        };
      }),
    };
    return { mapping, usage: { prompt: 50, completion: 20 } };
  }
}

function makePipeline(provider: AIProvider) {
  const mapper = new BatchMapper(
    provider,
    { batchSize: 2, concurrency: 1, retryPolicy: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 2 } },
    logger,
  );
  return new ImportPipeline(
    new StreamingCsvParser(),
    mapper,
    { defaultPhoneRegion: "IN", lowConfidenceThreshold: 0.6 },
    logger,
  );
}

function expectAuditInvariant(result: ImportResult): void {
  expect(result.stats.imported + result.stats.skipped + result.stats.failed).toBe(
    result.stats.totalRows,
  );
}

describe("ImportPipeline", () => {
  it("imports, normalizes, and summarizes a mixed file — the full story", async () => {
    const file = writeCsv(
      [
        "name,email,phone,remark",
        "Ravi Kumar, RAVI@X.COM ,98765 43210,interested", // imported (normalized)
        "Priya S,,919812345678,call back", // imported (bare 91 fixed)
        "Walk In,,,visited stall", // pre-filter skip (0 tokens)
        "Date Only,,2026-07-08,site visit planned", // authoritative skip
        "LowConf,low@x.co,,thinking", // imported + warning
      ].join("\n"),
    );

    const provider = new EchoProvider();
    const result = await makePipeline(provider).run(file);

    // Buckets.
    expect(result.stats).toMatchObject({
      totalRows: 5,
      imported: 3,
      skipped: 2,
      failed: 0,
    });
    expectAuditInvariant(result);

    // Normalization on imported records — the pipeline owns the split.
    const ravi = result.records.find((r) => r.rowIndex === 0);
    expect(ravi?.email).toBe("ravi@x.com");
    expect(ravi?.country_code).toBe("+91");
    expect(ravi?.mobile_without_country_code).toBe("9876543210");
    const priya = result.records.find((r) => r.rowIndex === 1);
    expect(priya?.country_code).toBe("+91");
    expect(priya?.mobile_without_country_code).toBe("9812345678");

    // Skip reasons are auditable and carry the raw row.
    const preSkip = result.skipped.find((s) => s.rowIndex === 2);
    expect(preSkip?.reason).toMatch(/No email-like or phone-like/);
    expect(preSkip?.raw["name"]).toBe("Walk In");
    const authSkip = result.skipped.find((s) => s.rowIndex === 3);
    expect(authSkip?.reason).toMatch(/after normalization/);

    // Warnings: discarded date-phone + low confidence.
    expect(result.warnings.some((w) => /Discarded unparseable mobile/.test(w.message))).toBe(true);
    expect(
      result.warnings.some((w) => w.rowIndex === 4 && /Low mapping confidence/.test(w.message)),
    ).toBe(true);
    expect(result.stats.warnings).toBe(result.warnings.length);

    // The pre-filtered row never reached the provider.
    const sentIndices = provider.requests.flatMap((r) => r.rows.map((row) => row.rowIndex));
    expect(sentIndices).not.toContain(2);

    expect(result.stats.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.batches).toBeGreaterThan(0);
  });

  it("records model-side skips with the model's reason", async () => {
    // Passes the pre-filter (email-like token in remark) but the model finds
    // no contact fields — the model-skip path.
    const file = writeCsv(
      ["name,email,phone,remark", "Chatty,,,mentioned friend at ravi@x.co"].join("\n"),
    );

    const result = await makePipeline(new EchoProvider()).run(file);

    expect(result.stats).toMatchObject({ totalRows: 1, imported: 0, skipped: 1, failed: 0 });
    expect(result.skipped[0]?.reason).toMatch(/neither an email address nor a phone/);
    expectAuditInvariant(result);
  });

  it("isolates poison rows as errors with their raw data", async () => {
    const file = writeCsv(
      [
        "name,email,phone,remark",
        "Good One,a@x.co,,fine",
        "POISON,b@x.co,,radioactive",
        "Good Two,c@x.co,,fine",
      ].join("\n"),
    );

    const result = await makePipeline(new EchoProvider()).run(file);

    expect(result.stats).toMatchObject({ totalRows: 3, imported: 2, failed: 1, skipped: 0 });
    expect(result.errors[0]?.rowIndex).toBe(1);
    expect(result.errors[0]?.raw["name"]).toBe("POISON");
    expectAuditInvariant(result);
  });

  it("flags malformed CSV rows as warnings while still processing them", async () => {
    const file = writeCsv(["name,email,phone,remark", "Spilly,a@x.co,,note,EXTRA-CELL"].join("\n"));

    const result = await makePipeline(new EchoProvider()).run(file);

    expect(result.stats.imported).toBe(1); // still imported
    expect(result.warnings.some((w) => /Row shape/.test(w.message))).toBe(true);
    expectAuditInvariant(result);
  });

  it("emits parsing then mapping progress with correct totals", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => `Lead ${i},lead${i}@x.co,,note ${i}`);
    const file = writeCsv(["name,email,phone,remark", ...rows].join("\n"));

    const updates: PipelineProgress[] = [];
    await makePipeline(new EchoProvider()).run(file, {
      onProgress: (p) => updates.push({ ...p }),
    });

    expect(updates[0]?.phase).toBe("parsing");
    const mapping = updates.filter((u) => u.phase === "mapping");
    expect(mapping.length).toBe(3); // 5 rows / batchSize 2
    const last = mapping[mapping.length - 1];
    expect(last).toMatchObject({ totalRows: 5, processedRows: 5, totalBatches: 3 });
  });

  it("returns results in source-row order regardless of batching", async () => {
    const rows = Array.from({ length: 9 }, (_, i) => `L${i},l${i}@x.co,,n`);
    const file = writeCsv(["name,email,phone,remark", ...rows].join("\n"));

    const result = await makePipeline(new EchoProvider()).run(file);

    expect(result.records.map((r) => r.rowIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("propagates an abort instead of returning partial results", async () => {
    const file = writeCsv(["name,email,phone,remark", "Ravi,a@x.co,,n"].join("\n"));
    const controller = new AbortController();
    controller.abort();

    await expect(
      makePipeline(new EchoProvider()).run(file, { signal: controller.signal }),
    ).rejects.toHaveProperty("name", "AbortError");
  });
});
