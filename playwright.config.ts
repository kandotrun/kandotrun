import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  timeout: 90_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { deviceScaleFactor: 2 },
  // WebKit is Safari and every iOS browser; it lays out floats differently from Chromium.
  // Firefox does not start on every macOS release, so it runs only in CI (Linux).
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
    ...(process.env.CI ? [{ name: "firefox", use: { browserName: "firefox" as const } }] : []),
  ],
});
