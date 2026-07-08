import type { BatchInput } from "../../../prompts";
import type { BatchMapping } from "../mapping-schema";

/** One row addressed by its source index — the unit the AI maps. */
export type BatchRow = BatchInput["rows"][number];

export interface MapBatchRequest extends BatchInput {
  /** Cancels the underlying HTTP call (job aborted, shutdown). */
  signal?: AbortSignal;
  /**
   * Self-repair feedback: on a retry after a validation failure, tells the
   * model exactly what was wrong with its previous answer instead of asking
   * the same question blind.
   */
  repairHint?: string;
}

/** Tokens consumed by one successful provider call. */
export interface TokenUsage {
  prompt: number;
  completion: number;
}

export interface MapBatchResult {
  mapping: BatchMapping;
  /** Absent when the vendor does not report usage. */
  usage?: TokenUsage;
}

/**
 * The seam between the import pipeline and any LLM vendor. Nothing outside
 * services/ai/provider/ may import an AI SDK — switching vendors is a
 * configuration change (AI_PROVIDER), never a refactor.
 *
 * Contract for implementations:
 *  - resolve with a schema-valid BatchMapping (validate before returning)
 *  - report token usage when the vendor provides it (cost observability)
 *  - throw AIProviderError with retryable/fatal classified for every failure
 *  - rethrow abort errors untouched so cancellation is never misclassified
 */
export interface AIProvider {
  readonly name: string;
  mapBatch(request: MapBatchRequest): Promise<MapBatchResult>;
}
