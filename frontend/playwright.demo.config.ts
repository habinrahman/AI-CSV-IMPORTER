import base from "./playwright.config";

const demoConfig = {
  ...base,
  testDir: "./e2e",
  testMatch: "demo-recording.spec.ts",
  timeout: 120_000,
  use: {
    ...base.use,
    video: "on" as const,
    launchOptions: { slowMo: 350 },
  },
};

export default demoConfig;
