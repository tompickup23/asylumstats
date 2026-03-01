import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /mobile-layout\.spec\.ts/,
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        baseURL: "http://127.0.0.1:4322",
        headless: true,
        screenshot: "only-on-failure",
        trace: "retain-on-failure"
      }
    }
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4322",
    url: "http://127.0.0.1:4322",
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
