import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withRetry, type RetryPolicy } from "./retry";

const policy: RetryPolicy = { maxRetries: 3, baseDelayMs: 100, maxDelayMs: 10_000 };

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Full jitter = random(0, cap); pin random to 1 so delay === cap and the
    // exponential growth is assertable.
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns immediately on first success without sleeping", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, { policy, isRetryable: () => true })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backs off exponentially on retryable failures", async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("t1"))
      .mockRejectedValueOnce(new Error("t2"))
      .mockRejectedValueOnce(new Error("t3"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      policy,
      isRetryable: () => true,
      onRetry: (_err, _attempt, delayMs) => delays.push(delayMs),
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(4);
    expect(delays).toEqual([100, 200, 400]); // base·2⁰, base·2¹, base·2²
  });

  it("caps the backoff at maxDelayMs", async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("t"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      policy: { maxRetries: 1, baseDelayMs: 60_000, maxDelayMs: 5_000 },
      isRetryable: () => true,
      onRetry: (_e, _a, d) => delays.push(d),
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe("ok");
    expect(delays).toEqual([5_000]);
  });

  it("does not retry non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));
    await expect(withRetry(fn, { policy, isRetryable: () => false })).rejects.toThrow(
      "permanent",
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always"));
    const promise = withRetry(fn, { policy, isRetryable: () => true });
    promise.catch(() => {}); // observed below; avoid unhandled-rejection noise
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow("always");
    expect(fn).toHaveBeenCalledTimes(4); // 1 attempt + 3 retries
  });

  it("treats a server Retry-After as a floor on the delay", async () => {
    const delays: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, {
      policy,
      isRetryable: () => true,
      retryAfterMs: () => 5_000, // > jittered 100
      onRetry: (_e, _a, d) => delays.push(d),
    });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe("ok");
    expect(delays).toEqual([5_000]);
  });

  it("aborting during backoff rejects with AbortError", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new Error("transient"));

    const promise = withRetry(fn, {
      policy,
      isRetryable: () => true,
      signal: controller.signal,
    });
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(0); // first failure lands, sleep starts
    controller.abort();

    await expect(promise).rejects.toHaveProperty("name", "AbortError");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
