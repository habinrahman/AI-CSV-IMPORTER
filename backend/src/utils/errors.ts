/**
 * Typed, operational errors. Throwing one of these anywhere in the stack is a
 * deliberate statement: "this failure is expected, here is its HTTP meaning."
 * Anything else that reaches the error handler is a bug and becomes a
 * sanitized 500.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400 — the request itself is malformed (body, params, missing file). */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, message, details);
  }
}

/** 404 — the referenced resource does not exist (or has expired). */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message);
  }
}

/** 413 — upload exceeds the configured size limit. */
export class PayloadTooLargeError extends AppError {
  constructor(message: string) {
    super(413, message);
  }
}

/** 422 — the file was received but cannot be understood as CSV. */
export class CsvParseError extends AppError {
  constructor(message: string) {
    super(422, message);
  }
}

/**
 * 502 — an AI provider call failed. The flags drive the pipeline's decisions:
 *  - retryable: transient (429/5xx/timeout/malformed output) → backoff+retry
 *  - fatal: configuration-level (auth, unknown model) → abort the whole job
 *  - neither: deterministic for this input → bisect the batch to isolate it
 */
export class AIProviderError extends AppError {
  public readonly provider: string;
  public readonly retryable: boolean;
  public readonly fatal: boolean;
  /**
   * True when the model's response CONTENT was invalid (malformed JSON,
   * schema violation, wrong row coverage) — the class of failure where a
   * retry should carry a repair hint. Transport failures (429/5xx) are not
   * the model's fault and must not produce one.
   */
  public readonly invalidResponse: boolean;
  /** Server-instructed wait (Retry-After), when the provider sent one. */
  public readonly retryAfterMs?: number;

  constructor(
    message: string,
    provider: string,
    options: {
      retryable: boolean;
      fatal?: boolean;
      invalidResponse?: boolean;
      retryAfterMs?: number;
    },
  ) {
    super(502, message);
    this.provider = provider;
    this.retryable = options.retryable;
    this.fatal = options.fatal ?? false;
    this.invalidResponse = options.invalidResponse ?? false;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}
