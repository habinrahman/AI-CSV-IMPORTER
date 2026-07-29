import base from "./playwright.config";

export default {
  ...base,
  testDir: "./e2e",
  testMatch: "demo-recording.spec.ts",
  timeout: 120_000,
  use: {
    ...base.use,
    video: "on",
    launchOptions: { slowMo: 350 },
  },
};
