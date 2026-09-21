import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiskFileStorage } from "./file-storage.service";

const logger = pino({ level: "silent" });

describe("DiskFileStorage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a registered file until it expires", () => {
    vi.useFakeTimers();
    const store = new DiskFileStorage(1_000, logger);
    const stored = store.register({
      id: "file-1",
      path: "/tmp/file-1.csv",
      originalName: "leads.csv",
      sizeBytes: 12,
    });

    expect(stored.id).toBe("file-1");
    expect(store.get("file-1")).toMatchObject({
      id: "file-1",
      originalName: "leads.csv",
      sizeBytes: 12,
    });

    store.dispose();
  });

  it("treats an expired file as missing even before the sweeper runs", () => {
    vi.useFakeTimers();
    const now = new Date("2026-09-21T04:00:00.000Z");
    vi.setSystemTime(now);
    const store = new DiskFileStorage(1_000, logger);
    store.register({
      id: "file-exp",
      path: "/tmp/file-exp.csv",
      originalName: "leads.csv",
      sizeBytes: 1,
    });

    vi.setSystemTime(new Date(now.getTime() + 1_001));

    expect(store.get("file-exp")).toBeUndefined();
    store.dispose();
  });

  it("deletes the backing file on remove and ignores a second remove", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "groweasy-upload-"));
    const filePath = path.join(dir, "upload.csv");
    await fs.writeFile(filePath, "name,email\n");

    const store = new DiskFileStorage(60_000, logger);
    store.register({
      id: "file-rm",
      path: filePath,
      originalName: "upload.csv",
      sizeBytes: 12,
    });

    await store.remove("file-rm");
    await expect(fs.access(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(store.get("file-rm")).toBeUndefined();

    await expect(store.remove("file-rm")).resolves.toBeUndefined();
    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("sweeps expired files off disk after the interval", async () => {
    vi.useFakeTimers();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "groweasy-sweep-"));
    const filePath = path.join(dir, "stale.csv");
    await fs.writeFile(filePath, "x");

    const now = new Date("2026-09-21T04:00:00.000Z");
    vi.setSystemTime(now);
    const store = new DiskFileStorage(500, logger);
    store.register({
      id: "file-sweep",
      path: filePath,
      originalName: "stale.csv",
      sizeBytes: 1,
    });

    vi.setSystemTime(new Date(now.getTime() + 60_000));
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(fs.access(filePath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(store.get("file-sweep")).toBeUndefined();

    store.dispose();
    await fs.rm(dir, { recursive: true, force: true });
  });
});
