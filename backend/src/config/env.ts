import "dotenv/config";
import { z } from "zod";

/**
 * Environment schema. Validated once at boot so a misconfiguration
 * fails fast with a readable message instead of surfacing deep in a request.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // Rate limiting.
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // Persistence (Supabase Postgres via Drizzle). Optional: without it the
  // server runs in in-memory mode — jobs and results live until their TTL.
  // With it, jobs and imported CRM records are durable across restarts.
  // Use Supabase's transaction-pooler URL (port 6543) for serverless-style
  // connection counts; the client is configured for it (prepare: false).
  DATABASE_URL: z.string().url().optional(),

  // Uploads. Files are temporary working data, not durable storage:
  // they expire and are deleted after UPLOAD_TTL_MINUTES.
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(5),
  UPLOAD_DIR: z.string().min(1).optional(),
  UPLOAD_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  // Finished import jobs (and their results) are held this long for the
  // client to fetch, then swept.
  JOB_TTL_MINUTES: z.coerce.number().int().positive().default(60),

  // AI pipeline. The provider factory enforces that the key matching
  // AI_PROVIDER is present when a provider is actually constructed — the
  // server itself can boot without one (upload/preview need no AI).
  AI_PROVIDER: z.enum(["openai"]).default("openai"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  AI_CONCURRENCY: z.coerce.number().int().positive().default(2),
  BATCH_SIZE: z.coerce.number().int().positive().default(20),
  // Simultaneous import jobs; excess starts get 429. Each job costs memory
  // for its rows/result plus AI_CONCURRENCY in-flight provider calls.
  MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(4),
  MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  // Enum, not free string: an unknown prompt version must fail at boot,
  // not at the first import job.
  PROMPT_VERSION: z.enum(["v1", "v2"]).default("v2"),
  // ISO 3166-1 alpha-2 region assumed for phone numbers with no country code.
  DEFAULT_PHONE_REGION: z.string().length(2).toUpperCase().default("IN"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
