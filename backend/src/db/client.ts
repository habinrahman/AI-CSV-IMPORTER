import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>["db"];

/**
 * Postgres connection + Drizzle instance for Supabase.
 *
 * - `prepare: false` is required by Supabase's transaction-mode pooler
 *   (port 6543), which cannot hold prepared statements across clients; it is
 *   harmless on a direct connection, so it is set unconditionally.
 * - `max: 5` — this API is a single long-lived process, not a lambda; a small
 *   pool is plenty and stays well inside Supabase's connection budget.
 * - The socket is opened lazily on first query, so constructing this at boot
 *   costs nothing when no import ever runs.
 */
export function createDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, { prepare: false, max: 5 });
  const db = drizzle(sql, { schema });
  return {
    db,
    /** Graceful shutdown: drain the pool instead of dropping connections. */
    close: () => sql.end({ timeout: 5 }),
  };
}
