import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/eval/run-eval.ts",
        "src/db/client.ts",
        "src/prompts/v1/**",
        "src/prompts/v2/examples.ts",
        "src/prompts/v2/header-bank.ts",
      ],
    },
  },
});
