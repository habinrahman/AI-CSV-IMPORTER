import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportJobSnapshot } from "@groweasy/shared";
import { InMemoryJobStore, toSnapshot } from "./job-store";

const logger = pino({ level: "silent" });

function makeStore() {
  return new InMemoryJobStore(60_000, logger);
}

describe("InMemoryJobStore", () => {
  it("creates jobs queued with empty progress", () => {
    const store = makeStore();
    const job = store.create();

    expect(job.status).toBe("queued");
    expect(job.progress.totalRows).toBe(0);
    expect(store.get(job.id)).toBe(job);
    store.dispose();
  });

  it("notifies subscribers with a full snapshot on every update", () => {
    const store = makeStore();
    const job = store.create();
    const seen: ImportJobSnapshot[] = [];
    store.subscribe(job.id, (snap) => seen.push(snap));

    store.update(job.id, { status: "parsing" });
    store.update(job.id, {
      status: "mapping",
      progress: { ...job.progress, totalRows: 10, processedRows: 4 },
    });

    expect(seen).toHaveLength(2);
    expect(seen[0]?.status).toBe("parsing");
    expect(seen[1]).toMatchObject({
      jobId: job.id,
      status: "mapping",
      progress: { totalRows: 10, processedRows: 4 },
    });
    store.dispose();
  });

  it("stops notifying after unsubscribe", () => {
    const store = makeStore();
    const job = store.create();
    const seen: ImportJobSnapshot[] = [];
    const unsubscribe = store.subscribe(job.id, (snap) => seen.push(snap));

    store.update(job.id, { status: "parsing" });
    unsubscribe();
    store.update(job.id, { status: "mapping" });

    expect(seen).toHaveLength(1);
    store.dispose();
  });

  it("a throwing listener does not block other listeners", () => {
    const store = makeStore();
    const job = store.create();
    const seen: ImportJobSnapshot[] = [];
    store.subscribe(job.id, () => {
      throw new Error("broken socket");
    });
    store.subscribe(job.id, (snap) => seen.push(snap));

    store.update(job.id, { status: "parsing" });

    expect(seen).toHaveLength(1);
    store.dispose();
  });

  it("dispose aborts jobs that are still running", () => {
    const store = makeStore();
    const running = store.create();
    const done = store.create();
    store.update(done.id, { status: "completed" });

    store.dispose();

    expect(running.abort.signal.aborted).toBe(true);
    expect(done.abort.signal.aborted).toBe(false);
  });

  it("ignores updates to terminal jobs — exactly one terminal event", () => {
    const store = makeStore();
    const job = store.create();
    const seen: ImportJobSnapshot[] = [];
    store.subscribe(job.id, (snap) => seen.push(snap));

    store.update(job.id, { status: "failed", error: "Import was cancelled" });
    // The aborted pipeline's own failure patch arrives later and must lose.
    store.update(job.id, { status: "failed", error: "AbortError" });

    expect(seen).toHaveLength(1);
    expect(store.get(job.id)?.error).toBe("Import was cancelled");
    store.dispose();
  });

  it("countActive counts only non-terminal jobs", () => {
    const store = makeStore();
    store.create();
    const done = store.create();
    const failed = store.create();
    store.update(done.id, { status: "completed" });
    store.update(failed.id, { status: "failed", error: "boom" });

    expect(store.countActive()).toBe(1);
    store.dispose();
  });

  it("toSnapshot exposes error and stats only when present", () => {
    const store = makeStore();
    const job = store.create();
    expect(toSnapshot(job)).not.toHaveProperty("error");
    expect(toSnapshot(job)).not.toHaveProperty("stats");

    store.update(job.id, { status: "failed", error: "boom" });
    expect(toSnapshot(job)).toMatchObject({ status: "failed", error: "boom" });
    store.dispose();
  });
});

describe("InMemoryJobStore sweep", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes expired terminal jobs, but fails (not deletes) expired running jobs", () => {
    vi.useFakeTimers();
    const store = makeStore(); // ttl 60s, sweep every 60s
    const running = store.create();
    const done = store.create();
    store.update(done.id, { status: "completed" });
    const seen: ImportJobSnapshot[] = [];
    store.subscribe(running.id, (snap) => seen.push(snap));

    vi.advanceTimersByTime(61_000);

    // Terminal + expired → gone. Running + expired → aborted, failed, kept —
    // subscribers must get a terminal event instead of silence.
    expect(store.get(done.id)).toBeUndefined();
    const survivor = store.get(running.id);
    expect(survivor?.status).toBe("failed");
    expect(survivor?.error).toMatch(/time limit/i);
    expect(survivor?.abort.signal.aborted).toBe(true);
    expect(seen.at(-1)?.status).toBe("failed");

    // Next sweep: now terminal and still past the cutoff → deleted.
    vi.advanceTimersByTime(60_000);
    expect(store.get(running.id)).toBeUndefined();
    store.dispose();
  });
});
