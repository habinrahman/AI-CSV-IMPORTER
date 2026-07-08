import compression from "compression";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env";
import type { Container } from "./container";
import { logger } from "./logger";
import { errorHandler } from "./middleware/error-handler";
import { notFoundHandler } from "./middleware/not-found";
import { requestId } from "./middleware/request-id";
import { createApiRouter } from "./routes";

/**
 * Builds the Express application. Kept separate from the server bootstrap so
 * tests can construct an app around a container full of fakes.
 *
 * Middleware order matters and is deliberate:
 *   request-id → logging → security → parsing → routes → 404 → errors
 */
export function createApp(container: Container): Express {
  const app = express();

  app.disable("x-powered-by");
  // Railway terminates TLS at a proxy; without this, req.ip is the proxy for
  // every request and per-IP rate limiting is meaningless.
  app.set("trust proxy", 1);

  // Correlation id first so every subsequent log line carries it.
  app.use(requestId());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      // Health checks fire every few seconds in production — logging them
      // would drown out real traffic.
      autoLogging: { ignore: (req) => req.url === "/api/health" },
    }),
  );

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  // Result payloads (thousands of mapped rows) compress extremely well.
  // SSE must be exempt: compression buffers the stream and events would
  // arrive only when the job ends.
  app.use(
    compression({
      filter: (req, res) =>
        req.path.endsWith("/events") ? false : compression.filter(req, res),
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", createApiRouter(container));

  // 404 + centralized error handling (must be last).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
