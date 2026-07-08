import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { env } from "../config/env";
import { logger } from "../logger";
import { BatchMapper } from "../services/ai/batch-mapper";
import { createAIProvider } from "../services/ai/provider/factory";
import { StreamingCsvParser } from "../services/csv/csv-parse.service";
import { ImportPipeline } from "../services/import/import-pipeline";
import { GOLDEN_HEADERS, GOLDEN_ROWS, toCsv } from "./golden-set";

/**
 * Golden-set evaluation against the REAL model (needs OPENAI_API_KEY).
 *
 *   npm run eval --workspace backend
 *   PROMPT_VERSION=v1 npm run eval --workspace backend   # A/B a version
 *
 * Reports skip precision/recall, per-field accuracy (email/mobile/status/
 * data_source), hallucination traceability, and token spend; writes
 * backend/eval-results.json for diffing across prompt versions/models.
 * Every metric is judged against docs/PROMPTS.md semantics: when the spec
 * says "unsure → null/empty", the golden expectation is null/empty.
 */

interface Mismatch {
  rowIndex: number;
  lesson: string;
  field: string;
  expected: string;
  actual: string;
}

async function main(): Promise<void> {
  if (!env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required to run the eval (set it in backend/.env).");
    process.exit(1);
  }

  const fixture = path.join(os.tmpdir(), `groweasy-eval-${Date.now()}.csv`);
  fs.writeFileSync(fixture, toCsv(GOLDEN_HEADERS, GOLDEN_ROWS), "utf8");

  const pipeline = new ImportPipeline(
    new StreamingCsvParser(),
    new BatchMapper(
      createAIProvider(logger),
      {
        batchSize: env.BATCH_SIZE,
        concurrency: env.AI_CONCURRENCY,
        retryPolicy: { maxRetries: env.MAX_RETRIES, baseDelayMs: 500, maxDelayMs: 30_000 },
      },
      logger,
    ),
    // Region is pinned so golden E.164 expectations are stable everywhere.
    { defaultPhoneRegion: "IN", lowConfidenceThreshold: 0.6 },
    logger,
  );

  console.log(
    `Evaluating ${GOLDEN_ROWS.length} golden rows · model=${env.OPENAI_MODEL} · prompt=${env.PROMPT_VERSION}`,
  );
  const result = await pipeline.run(fixture);
  fs.unlinkSync(fixture);

  // ─── Score ─────────────────────────────────────────────────
  const byIndex = new Map(result.records.map((r) => [r.rowIndex, r]));
  const skippedSet = new Set(result.skipped.map((r) => r.rowIndex));
  const failedSet = new Set(result.errors.map((r) => r.rowIndex));

  const mismatches: Mismatch[] = [];
  let skipTruePositive = 0;
  let skipFalsePositive = 0; // skipped but expected imported (lost data — worst)
  let skipFalseNegative = 0; // imported but expected skipped
  const fields = {
    email: 0,
    country_code: 0,
    mobile_without_country_code: 0,
    crm_status: 0,
    data_source: 0,
  };
  let scoredRows = 0;
  let traceabilityViolations = 0;

  GOLDEN_ROWS.forEach((golden, rowIndex) => {
    if (failedSet.has(rowIndex)) {
      mismatches.push({
        rowIndex,
        lesson: golden.lesson,
        field: "row",
        expected: "mapped",
        actual: "FAILED",
      });
      return;
    }
    const actualSkipped = skippedSet.has(rowIndex);
    if (golden.expected.skip) {
      if (actualSkipped) skipTruePositive += 1;
      else {
        skipFalseNegative += 1;
        mismatches.push({
          rowIndex,
          lesson: golden.lesson,
          field: "skip",
          expected: "skipped",
          actual: "imported",
        });
      }
      return;
    }
    if (actualSkipped) {
      skipFalsePositive += 1;
      mismatches.push({
        rowIndex,
        lesson: golden.lesson,
        field: "skip",
        expected: "imported",
        actual: "skipped",
      });
      return;
    }

    const record = byIndex.get(rowIndex);
    if (!record) return;
    scoredRows += 1;

    for (const field of [
      "email",
      "country_code",
      "mobile_without_country_code",
      "crm_status",
      "data_source",
    ] as const) {
      const expected = String(golden.expected[field] ?? "null");
      const actual = String(record[field] ?? "null");
      if (expected === actual) fields[field] += 1;
      else mismatches.push({ rowIndex, lesson: golden.lesson, field, expected, actual });
    }

    // Hallucination detector: output contacts must trace to input cells.
    const joined = golden.cells.join(" ").toLowerCase();
    if (record.email && !joined.includes(record.email)) traceabilityViolations += 1;
    if (record.mobile_without_country_code) {
      const outDigits = `${record.country_code}${record.mobile_without_country_code}`.replace(
        /[^0-9]/g,
        "",
      );
      const inDigits = golden.cells.map((c) => c.replace(/[^0-9]/g, ""));
      if (
        !inDigits.some((d) => d.length >= 7 && (outDigits.endsWith(d) || d.endsWith(outDigits)))
      ) {
        traceabilityViolations += 1;
      }
    }
  });

  const pct = (n: number, d: number): string =>
    d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%`;

  const report = {
    model: env.OPENAI_MODEL,
    promptVersion: env.PROMPT_VERSION,
    rows: GOLDEN_ROWS.length,
    metrics: {
      skipPrecision: pct(skipTruePositive, skipTruePositive + skipFalsePositive),
      skipRecall: pct(skipTruePositive, skipTruePositive + skipFalseNegative),
      emailAccuracy: pct(fields.email, scoredRows),
      countryCodeAccuracy: pct(fields.country_code, scoredRows),
      mobileAccuracy: pct(fields.mobile_without_country_code, scoredRows),
      statusAccuracy: pct(fields.crm_status, scoredRows),
      dataSourceAccuracy: pct(fields.data_source, scoredRows),
      traceabilityViolations,
      failedRows: failedSet.size,
    },
    tokens: result.stats.tokens ?? null,
    durationMs: result.stats.durationMs,
    mismatches,
  };

  console.log("\n══ Golden-set results ══");
  console.table(report.metrics);
  if (mismatches.length > 0) {
    console.log("Mismatches:");
    console.table(mismatches);
  }
  const outFile = path.join(__dirname, "..", "..", "eval-results.json");
  fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`\nFull report → ${outFile}`);

  // CI-friendly: non-zero exit when hard guarantees are broken.
  if (traceabilityViolations > 0 || skipFalsePositive > 0) {
    console.error("HARD FAILURE: hallucination or lost-lead (false skip) detected.");
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
