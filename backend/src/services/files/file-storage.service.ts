import fs from "node:fs/promises";
import type { Logger } from "../../logger";
import type { RegisterFileInput, StoredFile } from "../../types/files";

/**
 * Registry of temporarily stored uploads. Interface-first so the disk-backed
 * implementation can be swapped (S3, GCS) or faked in tests without touching
 * any consumer.
 */
export interface FileStorage {
  register(input: RegisterFileInput): StoredFile;
  get(fileId: string): StoredFile | undefined;
  remove(fileId: string): Promise<void>;
  /** Stops the background sweeper (graceful shutdown). */
  dispose(): void;
}

const SWEEP_INTERVAL_MS = 60_000;

/**
 * Disk-backed store with TTL expiry. Uploads are working data for an import
 * run, not durable storage — a background sweeper deletes expired files so
 * abandoned uploads can never fill the disk.
 */
export class DiskFileStorage implements FileStorage {
  private readonly files = new Map<string, StoredFile>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(
    private readonly ttlMs: number,
    private readonly logger: Logger,
  ) {
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    // Never keep the process alive just to sweep temp files.
    this.sweeper.unref();
  }

  register(input: RegisterFileInput): StoredFile {
    const now = new Date();
    const stored: StoredFile = {
      ...input,
      uploadedAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };
    this.files.set(stored.id, stored);
    return stored;
  }

  get(fileId: string): StoredFile | undefined {
    const stored = this.files.get(fileId);
    if (!stored) return undefined;
    // Expired but not yet swept counts as gone — behavior must not depend on
    // sweeper timing.
    if (stored.expiresAt.getTime() <= Date.now()) {
      void this.remove(fileId);
      return undefined;
    }
    return stored;
  }

  async remove(fileId: string): Promise<void> {
    const stored = this.files.get(fileId);
    this.files.delete(fileId);
    if (!stored) return;
    try {
      await fs.unlink(stored.path);
    } catch (err) {
      // Already gone is fine; anything else is worth a log line, not a crash.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn({ err, fileId }, "Failed to delete expired upload");
      }
    }
  }

  dispose(): void {
    clearInterval(this.sweeper);
  }

  private async sweep(): Promise<void> {
    const now = Date.now();
    for (const [id, stored] of this.files) {
      if (stored.expiresAt.getTime() <= now) {
        await this.remove(id);
        this.logger.debug({ fileId: id }, "Swept expired upload");
      }
    }
  }
}
