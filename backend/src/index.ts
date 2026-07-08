import { createApp } from "./app";
import { env } from "./config/env";
import { createContainer } from "./container";
import { logger } from "./logger";

const container = createContainer(logger);
const app = createApp(container);

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 GrowEasy backend listening on http://localhost:${env.PORT}`);
});

// Behind a load balancer (Railway), the proxy's idle timeout is typically
// 60s. Node's default keepAliveTimeout (5s) makes the server hang up first,
// which surfaces as sporadic 502s under load. Outlive the proxy instead.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

function shutdown(signal: string): void {
  logger.info(`${signal} received, shutting down gracefully...`);
  // Dispose FIRST: aborting in-flight jobs emits their terminal SSE events
  // and ends those streams. Disposing inside the close() callback would
  // deadlock — close() waits for the SSE connections that only end after
  // the abort, forcing every deploy through the timeout path.
  void container.dispose();
  server.close(() => {
    logger.info("Shutdown complete");
    process.exit(0);
  });
  // Keep-alive sockets idling between requests still count as open to
  // close(); drop them so drain time is bounded by in-flight work only.
  server.closeIdleConnections();
  // If connections refuse to drain, exit anyway rather than hang the deploy.
  setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// A bug that escapes all handlers leaves the process in an unknown state:
// log loudly and let the platform restart a clean instance.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled promise rejection");
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception");
  process.exit(1);
});
