import pino from "pino";
import { env } from "../config/env";

/**
 * pino-pretty is a devDependency, deliberately absent from the pruned
 * production image. Guarding with require.resolve means a stray
 * NODE_ENV=development in a production environment degrades to JSON logs
 * instead of crashing the process at boot (which kills every healthcheck).
 */
function prettyTransportAvailable(): boolean {
  if (env.NODE_ENV !== "development") return false;
  try {
    require.resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
}

/**
 * Application logger. Pretty-printed in development (when pino-pretty is
 * installed), structured JSON everywhere else so log aggregators (Railway,
 * etc.) can parse it.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(prettyTransportAvailable()
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }
    : {}),
});

export type Logger = typeof logger;
