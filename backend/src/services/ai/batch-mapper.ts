import type { Logger } from "../../logger";
import { AIProviderError } from "../../utils/errors";
import type { BatchMapping, MappedRow } from "./mapping-schema";
import type { AIProvider, BatchRow, TokenUsage } from "./provider/ai-provider";
import { isAbortError, withRetry, type RetryPolicy } from "./retry";

export interface RowFailure {
  rowIndex: number;
  message: string;
}

export interface BatchProgress {
  totalBatches: number;
  completedBatches: number;
  mappedRows: number;
  failedRows: number;
}

export interface MapRowsInput {
  headers: string[];
  rows: BatchRow[];
  signal?: AbortSignal;
  onProgress?: (progress: BatchProgress) => void;
}

export interface MapRowsResult {
  rows: MappedRow[];
  failures: RowFailure[];
  batches: number;
  /** Total tokens the run consumed — includes retried and bisected calls. */
  tokens: TokenUsage;
}

export interface BatchMapperOptions {
  batchSize: number;
  concurrency: number;
  retryPolicy: RetryPolicy;
}

/**
 * Drives an AIProvider over an arbitrary number of rows:
 *
 *   chunk(BATCH_SIZE) → bounded workers (AI_CONCURRENCY) → per batch:
 *   retry w/ backoff → row-coverage check → on exhaustion, BISECT the batch
 *   until the poison row is isolated as a per-row failure.
 *
 * The contract that makes the pipeline "never crash": mapRows only ever
 * throws for fatal configuration errors (wrong API key — every batch would
 * fail identically) or a user abort. Everything else degrades to entries in
 * `failures`, and every input row ends up in exactly one of rows/failures.
 */
export class BatchMapper {
  constructor(
    private readonly provider: AIProvider,
    private readonly options: BatchMapperOptions,
    private readonly logger: Logger,
  ) {}

  async mapRows(input: MapRowsInput): Promise<MapRowsResult> {
    const chunks = chunk(input.rows, this.options.batchSize);
    // Accumulated at the provider-call site: tokens spent on attempts that
    // later fail validation are still spent — cost tracking must see them.
    const tokens: TokenUsage = { prompt: 0, completion: 0 };
    const results: Array<{ mapped: MappedRow[]; failures: RowFailure[] }> = new Array(
      chunks.length,
    );

    let nextChunk = 0;
    let completedBatches = 0;
    let mappedRows = 0;
    let failedRows = 0;
    let stopped = false;

    const worker = async (): Promise<void> => {
      while (!stopped) {
        const index = nextChunk++;
        const batch = chunks[index];
        if (batch === undefined) return;
        input.signal?.throwIfAborted();

        try {
          const result = await this.processBatch(batch, input, tokens);
          results[index] = result;
          completedBatches += 1;
          mappedRows += result.mapped.length;
          failedRows += result.failures.length;
          input.onProgress?.({
            totalBatches: chunks.length,
            completedBatches,
            mappedRows,
            failedRows,
          });
        } catch (error) {
          // Fatal or abort: stop the other workers from burning tokens.
          stopped = true;
          throw error;
        }
      }
    };

    const workerCount = Math.min(this.options.concurrency, Math.max(chunks.length, 1));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const flat = results.filter(Boolean);
    return {
      rows: flat.flatMap((r) => r.mapped),
      failures: flat.flatMap((r) => r.failures),
      batches: chunks.length,
      tokens,
    };
  }

  /** Retry, verify, and — when a batch is beyond saving — bisect it. */
  private async processBatch(
    rows: BatchRow[],
    ctx: MapRowsInput,
    tokens: TokenUsage,
  ): Promise<{ mapped: MappedRow[]; failures: RowFailure[] }> {
    // Filled after a validation-type failure so the NEXT attempt tells the
    // model what to fix instead of re-asking blind (self-repair).
    let repairHint: string | undefined;
    try {
      const mapping = await withRetry(
        async () => {
          try {
            const result = await this.provider.mapBatch({
              headers: ctx.headers,
              rows,
              signal: ctx.signal,
              ...(repairHint ? { repairHint } : {}),
            });
            if (result.usage) {
              tokens.prompt += result.usage.prompt;
              tokens.completion += result.usage.completion;
            }
            assertRowCoverage(rows, result.mapping, this.provider.name);
            return result.mapping;
          } catch (error) {
            if (error instanceof AIProviderError && error.invalidResponse) {
              repairHint = error.message;
            }
            throw error;
          }
        },
        {
          policy: this.options.retryPolicy,
          isRetryable: (err) => err instanceof AIProviderError && err.retryable,
          retryAfterMs: (err) => (err instanceof AIProviderError ? err.retryAfterMs : undefined),
          onRetry: (err, attempt, delayMs) => {
            this.logger.warn(
              { attempt, delayMs: Math.round(delayMs), rows: rows.length, err },
              "Retrying AI batch",
            );
          },
          signal: ctx.signal,
        },
      );
      return { mapped: mapping.rows, failures: [] };
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (error instanceof AIProviderError && error.fatal) throw error;

      if (rows.length === 1) {
        const rowIndex = rows[0]?.rowIndex ?? -1;
        this.logger.warn({ rowIndex, err: error }, "Row failed after retries and bisection");
        return {
          mapped: [],
          failures: [{ rowIndex, message: error instanceof Error ? error.message : String(error) }],
        };
      }

      // One poison row must cost itself, not its whole batch.
      this.logger.info({ rows: rows.length, err: error }, "Batch failed after retries — bisecting");
      const mid = Math.ceil(rows.length / 2);
      const left = await this.processBatch(rows.slice(0, mid), ctx, tokens);
      const right = await this.processBatch(rows.slice(mid), ctx, tokens);
      return {
        mapped: [...left.mapped, ...right.mapped],
        failures: [...left.failures, ...right.failures],
      };
    }
  }
}

/**
 * Schema-valid is not the same as correct: the model must return exactly the
 * rows it was asked about. Violations are retryable model errors.
 */
function assertRowCoverage(requested: BatchRow[], mapping: BatchMapping, provider: string): void {
  const expected = new Set(requested.map((row) => row.rowIndex));
  const returned = mapping.rows.map((row) => row.rowIndex);

  if (returned.length !== expected.size || !returned.every((index) => expected.has(index))) {
    throw new AIProviderError(
      `Response covered rows [${returned.join(",")}] but [${[...expected].join(",")}] were requested`,
      provider,
      { retryable: true, invalidResponse: true },
    );
  }
  if (new Set(returned).size !== returned.length) {
    throw new AIProviderError("Response contains duplicate row indices", provider, {
      retryable: true,
      invalidResponse: true,
    });
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
