import rateLimit from "express-rate-limit";
import type { RequestHandler } from "express";
import { env } from "../config/env";

/**
 * Basic per-IP rate limiting. Correct client IPs require `trust proxy` to be
 * configured (done in app.ts) — otherwise every request appears to come from
 * the platform proxy and one user could exhaust the global budget.
 *
 * The health endpoint is mounted before this limiter on purpose: platform
 * health checks must never be throttled.
 */
export function createRateLimiter(): RequestHandler {
  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      error: { message: "Too many requests — please try again shortly." },
    },
  });
}
