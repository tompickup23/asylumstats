import { expect, test } from "@playwright/test";
import { disableMotion, limitToTopOfPage, stabilizePage, waitForFonts } from "./layout-helpers";

const desktopPages = [
  { name: "home", path: "/" },
  { name: "hotels", path: "/hotels/" },
  { name: "spending", path: "/spending/" },
  { name: "compare", path: "/compare/" },
  { name: "routes", path: "/routes/" },
  { name: "entities", path: "/entities/" },
  { name: "birmingham-place", path: "/places/E08000025/" }
] as const;

test.describe("desktop layout snapshots", () => {
  for (const pageConfig of desktopPages) {
    test(`${pageConfig.name} keeps the top-of-page hierarchy stable`, async ({ page }) => {
      await stabilizePage(page, { blockFonts: false });

      await page.goto(pageConfig.path, { waitUntil: "networkidle" });
      await waitForFonts(page);
      await disableMotion(page);
      await limitToTopOfPage(page, 5);

      await expect(page.locator("main")).toBeVisible();
      await expect(page).toHaveScreenshot(`${pageConfig.name}-desktop.png`, {
        animations: "disabled",
        caret: "hide",
        fullPage: false,
        maxDiffPixels: 2500
      });
    });
  }
});
