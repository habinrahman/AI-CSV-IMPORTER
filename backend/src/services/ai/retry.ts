/**
 * Generic retry with full-jitter exponential backoff.
 *
 * Full jitter (delay = random(0, min(base·2ⁿ, cap))) over equal or partial
 * jitter because retry storms are the failure mode that matters with LLM
 * APIs: after a 429, uniformly spreading clients over the window empties the
 * queue fastest (AWS Architecture Blog's classic result).
 */

export interface RetryPolicy {
  /** Retries after the first attempt (3 ⇒ up to 4 attempts total). */
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface RetryOptions {
  policy: RetryPolicy;
  isRetryable: (error: unknown) => boolean;
  /** Server-instructed minimum wait (e.g. Retry-After), if the error has one. */
  retryAfterMs?: (error: unknown) => number | undefined;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  signal?: AbortSignal;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { policy, isRetryable, retryAfterMs, onRetry, signal } = options;

  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await fn(attempt);
    } catch (error) {
      if (!isRetryable(error) || attempt >= policy.maxRetries) throw error;

      const cap = Math.min(policy.baseDelayMs * 2 ** attempt, policy.maxDelayMs);
      const jittered = Math.random() * cap;
      // A server-instructed wait is a floor, never shortened by jitter.
      const delayMs = Math.max(retryAfterMs?.(error) ?? 0, jittered);

      onRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs, signal);
    }
  }
}

/** Abortable sleep — a cancelled job must not sit out a 30s backoff. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
