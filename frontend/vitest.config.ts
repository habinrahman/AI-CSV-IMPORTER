import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    // Matches the backend suites' style: explicit imports from "vitest",
    // no injected globals.
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/components/ui/**",
        "src/app/**/layout.tsx",
        "src/app/**/page.tsx",
        "src/app/global-error.tsx",
        "src/app/error.tsx",
        "src/app/not-found.tsx",
        "src/app/providers.tsx",
      ],
    },
  },
});
