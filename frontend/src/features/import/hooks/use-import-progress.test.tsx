import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportJobSnapshot } from "@groweasy/shared";
import { fetchImportSnapshot } from "@/lib/api/client";
import { useImportJobProgress } from "./use-import-progress";

// Keep parseImportSnapshot (and the rest of the client) real — the hook's
// frame validation is part of what we are testing. Only the network call
// used by the polling fallback is mocked.
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, fetchImportSnapshot: vi.fn() };
});

const fetchImportSnapshotMock = vi.mocked(fetchImportSnapshot);

/**
 * Controllable EventSource double. Tests drive it by emitting the named
 * server events ("progress" / "done" / "failed") or a transport error.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;
  onerror: ((event: Event) => void) | null = null;
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  close(): void {
    this.closed = true;
  }

  /** Dispatch a named SSE event whose data is already-serialized JSON. */
  emitRaw(type: string, data: string): void {
    const event = new MessageEvent(type, { data });
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  emit(type: string, data: unknown): void {
    this.emitRaw(type, JSON.stringify(data));
  }

  emitTransportError(): void {
    this.onerror?.(new Event("error"));
  }
}

function makeSnapshot(overrides: Partial<ImportJobSnapshot> = {}): ImportJobSnapshot {
  return {
    jobId: "job-1",
    status: "mapping",
    progress: {
      totalRows: 100,
      processedRows: 20,
      skippedRows: 1,
      failedRows: 0,
      currentBatch: 1,
      totalBatches: 5,
    },
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function lastSource(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error("No EventSource was created");
  return source;
}

describe("useImportJobProgress", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    FakeEventSource.instances = [];
    fetchImportSnapshotMock.mockReset();
  });

  it("does not open a stream without a jobId", () => {
    const { result } = renderHook(() => useImportJobProgress(null), {
      wrapper: createWrapper(),
    });
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(result.current).toEqual({ snapshot: null, polling: false });
  });

  it("applies SSE progress frames to the returned snapshot", () => {
    const { result } = renderHook(() => useImportJobProgress("job-1"), {
      wrapper: createWrapper(),
    });
    const source = lastSource();
    expect(source.url).toContain("/api/imports/job-1/events");
    expect(result.current.snapshot).toBeNull();

    act(() => source.emit("progress", makeSnapshot()));
    expect(result.current.snapshot?.progress.processedRows).toBe(20);
    expect(result.current.polling).toBe(false);

    const later = makeSnapshot();
    later.progress.processedRows = 60;
    act(() => source.emit("progress", later));
    expect(result.current.snapshot?.progress.processedRows).toBe(60);
  });

  it("closes the stream on a 'done' event and yields the terminal snapshot", () => {
    const { result } = renderHook(() => useImportJobProgress("job-1"), {
      wrapper: createWrapper(),
    });
    const source = lastSource();

    const done = makeSnapshot({
      status: "completed",
      stats: {
        totalRows: 100,
        imported: 95,
        skipped: 4,
        failed: 1,
        warnings: 2,
        batches: 5,
        durationMs: 4200,
      },
    });
    act(() => source.emit("done", done));

    expect(result.current.snapshot?.status).toBe("completed");
    expect(result.current.snapshot?.stats?.imported).toBe(95);
    expect(result.current.polling).toBe(false);
    expect(source.closed).toBe(true);
    expect(fetchImportSnapshotMock).not.toHaveBeenCalled();
  });

  it("closes the stream on a 'failed' event and exposes the error snapshot", () => {
    const { result } = renderHook(() => useImportJobProgress("job-1"), {
      wrapper: createWrapper(),
    });
    const source = lastSource();

    act(() => source.emit("failed", makeSnapshot({ status: "failed", error: "boom" })));

    expect(result.current.snapshot?.status).toBe("failed");
    expect(result.current.snapshot?.error).toBe("boom");
    expect(source.closed).toBe(true);
    expect(result.current.polling).toBe(false);
  });

  it("ignores frames that are malformed JSON or violate the snapshot schema", () => {
    const { result } = renderHook(() => useImportJobProgress("job-1"), {
      wrapper: createWrapper(),
    });
    const source = lastSource();

    act(() => source.emit("progress", makeSnapshot()));
    const before = result.current.snapshot;
    expect(before).not.toBeNull();

    // Broken JSON must not clear or corrupt the last good snapshot.
    act(() => source.emitRaw("progress", "{ not json"));
    expect(result.current.snapshot).toBe(before);

    // Valid JSON missing the required `progress` object fails schema
    // validation (parseImportSnapshot) and is likewise ignored.
    act(() => source.emit("progress", { jobId: "job-1", status: "mapping" }));
    expect(result.current.snapshot).toBe(before);
  });

  it("falls back to polling when the SSE transport errors", async () => {
    const polled = makeSnapshot();
    polled.progress.processedRows = 42;
    fetchImportSnapshotMock.mockResolvedValue(polled);

    const { result } = renderHook(() => useImportJobProgress("job-1"), {
      wrapper: createWrapper(),
    });
    const source = lastSource();

    act(() => source.emit("progress", makeSnapshot()));
    act(() => source.emitTransportError());

    expect(source.closed).toBe(true);
    expect(result.current.polling).toBe(true);

    await waitFor(() => {
      expect(result.current.snapshot?.progress.processedRows).toBe(42);
    });
    expect(fetchImportSnapshotMock).toHaveBeenCalledWith("job-1");
    expect(result.current.polling).toBe(true);
  });

  it("self-terminates when polling returns a terminal snapshot (regression)", async () => {
    // Real bug: after an SSE drop the hook kept polling forever because the
    // terminal check ran against the frozen SSE snapshot, never the polled
    // one. It must surface the polled terminal snapshot AND stop polling.
    const terminal = makeSnapshot({
      status: "completed",
      stats: {
        totalRows: 100,
        imported: 100,
        skipped: 0,
        failed: 0,
        warnings: 0,
        batches: 5,
        durationMs: 3100,
      },
    });
    terminal.progress.processedRows = 100;
    fetchImportSnapshotMock.mockResolvedValue(terminal);

    const { result } = renderHook(() => useImportJobProgress("job-1"), {
      wrapper: createWrapper(),
    });
    const source = lastSource();

    // Last frame before the drop is non-terminal.
    act(() => source.emit("progress", makeSnapshot()));
    act(() => source.emitTransportError());
    expect(result.current.polling).toBe(true);

    await waitFor(() => {
      expect(result.current.snapshot?.status).toBe("completed");
    });
    expect(result.current.polling).toBe(false);
    expect(fetchImportSnapshotMock).toHaveBeenCalledTimes(1);
  });
});
