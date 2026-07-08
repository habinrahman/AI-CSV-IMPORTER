import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit config — migration generation and push.
 *
 *   npm run db:generate   # emit SQL migrations from src/db/schema.ts (offline)
 *   npm run db:push       # apply the schema to $DATABASE_URL (Supabase)
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Only needed by db:push / db:migrate — generation works offline.
    url: process.env["DATABASE_URL"] ?? "",
  },
});
