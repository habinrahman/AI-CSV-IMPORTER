import type { Request, Response } from "express";
import type {
  ImportJobSnapshot,
  ImportResultResponse,
  ImportSseEvent,
  StartImportResponse,
} from "@groweasy/shared";
import type { ImportJobService } from "../services/import/import-job.service";
import type { ImportJobRecord, JobStore } from "../services/jobs/job-store";
import { toSnapshot } from "../services/jobs/job-store";
import { asyncHandler } from "../utils/async-handler";
import { AppError, NotFoundError } from "../utils/errors";
import type { StartImportRequest } from "../validators/imports.validator";

const SSE_HEARTBEAT_MS = 15_000;

function eventNameFor(snapshot: ImportJobSnapshot): ImportSseEvent {
  if (snapshot.status === "completed") return "done";
  if (snapshot.status === "failed") return "failed";
  return "progress";
}

function isTerminal(snapshot: ImportJobSnapshot): boolean {
  return snapshot.status === "completed" || snapshot.status === "failed";
}

export class ImportsController {
  constructor(
    private readonly service: ImportJobService,
    private readonly jobs: JobStore,
  ) {}

  /** POST /api/imports — 202: the job was accepted, not finished. */
  start = (req: Request, res: Response): void => {
    const { fileId } = req.body as StartImportRequest;
    const snapshot = this.service.start(fileId);
    const body: StartImportResponse = { jobId: snapshot.jobId };
    res.status(202).json(body);
  };

  /**
   * GET /api/imports/:id — polling fallback for clients without SSE.
   * A job missing from memory (restart, TTL sweep) falls back to the
   * database when persistence is configured.
   */
  snapshot = asyncHandler(async (req, res) => {
    const jobId = req.params["id"] ?? "";
    const job = this.jobs.get(jobId);
    if (job) {
      res.json(toSnapshot(job));
      return;
    }
    const persisted = await this.service.loadPersistedSnapshot(jobId);
    if (!persisted) {
      throw new NotFoundError(`No import job found for id "${jobId}"`);
    }
    res.json(persisted);
  });

  /** DELETE /api/imports/:id — cancel a running import (idempotent). */
  cancel = (req: Request, res: Response): void => {
    res.json(this.service.cancel(req.params["id"] ?? ""));
  };

  /**
   * GET /api/imports/:id/result — the full outcome, once completed.
   * Served from memory while the job lives; from the database afterwards
   * (persisted imports outlive restarts and the TTL sweep).
   */
  result = asyncHandler(async (req, res) => {
    const jobId = req.params["id"] ?? "";
    const job = this.jobs.get(jobId);
    if (!job) {
      const persisted = await this.service.loadPersistedResult(jobId);
      if (!persisted) {
        throw new NotFoundError(`No import job found for id "${jobId}"`);
      }
      const body: ImportResultResponse = { jobId, ...persisted };
      res.json(body);
      return;
    }
    if (job.status === "failed") {
      throw new AppError(409, `Import failed: ${job.error ?? "unknown error"}`);
    }
    if (job.status !== "completed" || !job.result) {
      throw new AppError(409, "Import is still running — wait for the done event");
    }
    const body: ImportResultResponse = { jobId: job.id, ...job.result };
    res.json(body);
  });

  /**
   * GET /api/imports/:id/events — SSE. Emits the current snapshot
   * immediately (late subscribers still get state), then every update.
   * The stream ends after a terminal event; heartbeats keep proxies from
   * killing the connection in between.
   */
  events = (req: Request, res: Response): void => {
    const job = this.requireJob(req);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tells nginx-style proxies not to buffer the stream.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const send = (snapshot: ImportJobSnapshot): void => {
      res.write(`event: ${eventNameFor(snapshot)}\ndata: ${JSON.stringify(snapshot)}\n\n`);
      if (isTerminal(snapshot)) {
        cleanup();
        res.end();
      }
    };

    const heartbeat = setInterval(() => res.write(":hb\n\n"), SSE_HEARTBEAT_MS);
    const unsubscribe = this.jobs.subscribe(job.id, send);
    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on("close", cleanup);
    send(toSnapshot(job));
  };

  private requireJob(req: Request): ImportJobRecord {
    const jobId = req.params["id"] ?? "";
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new NotFoundError(`No import job found for id "${jobId}"`);
    }
    return job;
  }
}
