import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RequestHandler } from "express";
import { env } from "./config/env";
import type { Logger } from "./logger";
import { HealthController } from "./controllers/health.controller";
import { ImportsController } from "./controllers/imports.controller";
import { ParseController } from "./controllers/parse.controller";
import { UploadController } from "./controllers/upload.controller";
import { createCsvUploadMiddleware } from "./middleware/upload";
import { createRateLimiter } from "./middleware/rate-limit";
import { BatchMapper } from "./services/ai/batch-mapper";
import { createAIProvider } from "./services/ai/provider/factory";
import { createDb } from "./db/client";
import { StreamingCsvParser } from "./services/csv/csv-parse.service";
import { DiskFileStorage, type FileStorage } from "./services/files/file-storage.service";
import { ImportJobService } from "./services/import/import-job.service";
import { ImportPipeline } from "./services/import/import-pipeline";
import { InMemoryJobStore, type JobStore } from "./services/jobs/job-store";
import { DrizzleImportPersistence } from "./services/persistence/drizzle-persistence";
import {
  NoopImportPersistence,
  type ImportPersistence,
} from "./services/persistence/import-persistence";

/**
 * Composition root — the only place in the application where concrete
 * implementations are constructed and wired together. Everything downstream
 * receives its dependencies through constructors, which is exactly what makes
 * each piece testable in isolation (hand it a fake, not the real thing).
 *
 * Deliberately a plain function, not a DI framework: for a graph of this
 * size, explicit wiring is more readable than decorators and reflection,
 * and the compiler verifies the whole graph.
 */
export interface Container {
  fileStorage: FileStorage;
  jobStore: JobStore;
  healthController: HealthController;
  uploadController: UploadController;
  parseController: ParseController;
  importsController: ImportsController;
  csvUpload: RequestHandler;
  rateLimiter: RequestHandler;
  dispose(): Promise<void>;
}

export function createContainer(logger: Logger): Container {
  const uploadDir = env.UPLOAD_DIR ?? path.join(os.tmpdir(), "groweasy-uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  const fileStorage = new DiskFileStorage(env.UPLOAD_TTL_MINUTES * 60_000, logger);
  const jobStore = new InMemoryJobStore(env.JOB_TTL_MINUTES * 60_000, logger);
  const csvParser = new StreamingCsvParser();

  // Durable storage is opt-in configuration, like the AI key: without a
  // DATABASE_URL the server runs fully in-memory (jobs live until their TTL);
  // with one, jobs and imported CRM records survive restarts.
  const persistence: ImportPersistence = env.DATABASE_URL
    ? new DrizzleImportPersistence(createDb(env.DATABASE_URL), logger)
    : new NoopImportPersistence();
  logger.info(
    persistence.enabled
      ? "Persistence: Supabase via Drizzle (jobs + CRM records are durable)"
      : "Persistence: in-memory (set DATABASE_URL to persist jobs and CRM records)",
  );

  // Lazy on purpose: the server must boot (upload/preview work) without an
  // AI key; the first import attempt surfaces a clear 503 if unconfigured.
  // ImportJobService memoizes the result after the first success.
  const pipelineFactory = (): ImportPipeline => {
    const provider = createAIProvider(logger);
    const mapper = new BatchMapper(
      provider,
      {
        batchSize: env.BATCH_SIZE,
        concurrency: env.AI_CONCURRENCY,
        retryPolicy: { maxRetries: env.MAX_RETRIES, baseDelayMs: 500, maxDelayMs: 30_000 },
      },
      logger,
    );
    return new ImportPipeline(
      csvParser,
      mapper,
      { defaultPhoneRegion: env.DEFAULT_PHONE_REGION, lowConfidenceThreshold: 0.6 },
      logger,
    );
  };

  const importJobService = new ImportJobService(
    fileStorage,
    jobStore,
    pipelineFactory,
    persistence,
    { maxConcurrentJobs: env.MAX_CONCURRENT_JOBS },
    logger,
  );

  return {
    fileStorage,
    jobStore,
    healthController: new HealthController(),
    uploadController: new UploadController(fileStorage),
    parseController: new ParseController(fileStorage, csvParser),
    importsController: new ImportsController(importJobService, jobStore),
    csvUpload: createCsvUploadMiddleware(uploadDir),
    rateLimiter: createRateLimiter(),
    dispose: async () => {
      jobStore.dispose(); // aborts in-flight pipelines
      fileStorage.dispose();
      await persistence.dispose(); // drains the Postgres pool
    },
  };
}
