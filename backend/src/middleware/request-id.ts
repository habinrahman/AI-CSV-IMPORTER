import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * Callers may supply their own X-Request-Id (useful when a gateway already
 * assigned one), but only if it is shaped like an id — arbitrary header
 * content must never flow into logs.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Assigns a correlation id to every request. The id is:
 *   - attached to req.id (picked up by pino-http, so every log line carries it)
 *   - echoed as the X-Request-Id response header
 *   - included in error response bodies
 * One id ties together the user's screenshot, the response, and the logs.
 */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header("x-request-id");
    const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
    req.id = id;
    res.setHeader("X-Request-Id", id);
    next();
  };
}
