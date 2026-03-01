import { expect, test } from "@playwright/test";
import { disableMotion, limitToTopOfPage, stabilizePage, waitForFonts } from "./layout-helpers";

const desktopPages = [
  { name: "home", path: "/", focus: "#read-this-first", hasPageContents: false },
  { name: "hotels", path: "/hotels/", focus: "#hotel-findings", hasPageContents: true },
  { name: "spending", path: "/spending/", focus: "#money-findings", hasPageContents: true },
  { name: "compare", path: "/compare/", focus: "#compare-findings", hasPageContents: true },
  { name: "routes", path: "/routes/", focus: "#route-findings", hasPageContents: true },
  { name: "entities", path: "/entities/", focus: "#entity-findings", hasPageContents: true },
  { name: "birmingham-place", path: "/places/E08000025/", focus: "#place-findings", hasPageContents: true }
] as const;

test.describe("desktop layout snapshots", () => {
  for (const pageConfig of desktopPages) {
    test(`${pageConfig.name} keeps the top-of-page hierarchy stable`, async ({ page }) => {
      await stabilizePage(page, { blockFonts: false });

      await page.goto(pageConfig.path, { waitUntil: "networkidle" });
      await waitForFonts(page);
      await disableMotion(page);
      await limitToTopOfPage(page, 5);

      const focusSection = page.locator(pageConfig.focus);

      await expect(page.locator("main")).toBeVisible();
      await expect(focusSection).toBeVisible();

      if (pageConfig.hasPageContents) {
        await expect(page.locator(".page-contents")).toBeVisible();
        await expect(page.locator(".page-contents-links a").first()).toHaveAttribute("href", pageConfig.focus);
      }

      await expect(page).toHaveScreenshot(`${pageConfig.name}-desktop.png`, {
        animations: "disabled",
        caret: "hide",
        fullPage: false,
        maxDiffPixelRatio: 0.04
      });
    });
  }
});
