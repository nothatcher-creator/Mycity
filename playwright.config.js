import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.DISTRICT_TEST_URL || "http://localhost:5188/Mycity/",
    viewport: { width: 1100, height: 760 },
    reducedMotion: "reduce",
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      args: ["--enable-unsafe-swiftshader", "--disable-dev-shm-usage"],
    },
    screenshot: "only-on-failure",
  },
  webServer: process.env.DISTRICT_TEST_URL
    ? undefined
    : {
        command: "npm run preview -- --port 5188 --strictPort",
        url: "http://localhost:5188/Mycity/",
        reuseExistingServer: !process.env.CI,
      },
});
