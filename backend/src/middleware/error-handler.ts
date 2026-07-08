import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { ApiErrorResponse } from "@groweasy/shared";
import { env } from "../config/env";
import { logger } from "../logger";
import { AppError } from "../utils/errors";

/**
 * The single place where errors become HTTP responses.
 *
 * - AppError subclasses are operational: their status/message are intentional
 *   and safe to expose.
 * - Multer errors are translated to friendly messages (LIMIT_FILE_SIZE → 413).
 * - Anything else is a bug: fully logged, but the client sees a sanitized 500
 *   — internals never leak through an error body.
 *
 * Must keep all four parameters for Express to register it as an error handler.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = typeof req.id === "string" ? req.id : undefined;

  let statusCode = 500;
  let message = "Internal Server Error";
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      statusCode = 413;
      message = `File exceeds the ${env.MAX_FILE_SIZE_MB} MB upload limit`;
    } else {
      statusCode = 400;
      message = `Upload rejected: ${err.message}`;
    }
  }

  // req.log is the pino-http child logger and already carries the request id.
  const log = req.log ?? logger;
  log.error({ err, statusCode }, "Request failed");

  const body: ApiErrorResponse = {
    error: {
      message,
      ...(requestId ? { requestId } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };
  res.status(statusCode).json(body);
}
