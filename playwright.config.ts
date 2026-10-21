import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  timeout: 90_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { browserName: "chromium", deviceScaleFactor: 2 },
});
