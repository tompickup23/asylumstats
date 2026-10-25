import { defineConfig, devices } from "@playwright/test";

const previewPort = process.env.PLAYWRIGHT_PORT ?? "4322";
const previewUrl = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: "./tests",
  // Was /.*layout\.spec\.ts/, which silently excluded any spec not named for layout.
  // The homepage search spec is behaviour, not layout, and would never have run.
  testMatch: /.*\.spec\.ts/,
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        baseURL: previewUrl,
        headless: true,
        screenshot: "only-on-failure",
        trace: "retain-on-failure"
      }
    },
    {
      name: "desktop-chromium",
      use: {
        browserName: "chromium",
        baseURL: previewUrl,
        headless: true,
        viewport: {
          width: 1440,
          height: 1500
        },
        deviceScaleFactor: 1,
        screenshot: "only-on-failure",
        trace: "retain-on-failure"
      }
    }
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${previewPort}`,
    url: previewUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
