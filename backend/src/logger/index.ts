import pino from "pino";
import { env } from "../config/env";

const isDevelopment = env.NODE_ENV === "development";

/**
 * Application logger. Pretty-printed in development, structured JSON in
 * production so log aggregators (Railway, etc.) can parse it.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss" },
        },
      }
    : {}),
});

export type Logger = typeof logger;
