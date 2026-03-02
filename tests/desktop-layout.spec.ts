import { expect, test } from "@playwright/test";
import { disableMotion, limitToTopOfPage, stabilizePage, waitForFonts } from "./layout-helpers";

const desktopPages = [
  {
    name: "home",
    path: "/",
    focus: "#read-this-first",
    hasPageContents: false,
    hasRegionMapExplorer: true
  },
  { name: "places", path: "/places/", focus: "#place-map", hasPageContents: true, hasRegionMapExplorer: true },
  { name: "north-west-region", path: "/places/regions/north-west/", focus: "#region-findings", hasPageContents: true, hasRegionMapExplorer: true },
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

      if ("hasRegionMapExplorer" in pageConfig && pageConfig.hasRegionMapExplorer) {
        await expect(page.locator("[data-region-map-explorer]")).toBeVisible();
        await expect(page.locator("[data-region-map-view-button]")).toHaveCount(3);
        await expect(page.locator("[data-region-map-legend]")).toBeVisible();

        if (!("hasRegionMapSummary" in pageConfig) || pageConfig.hasRegionMapSummary !== false) {
          await expect(page.locator(".region-map-summary-stats").first()).toBeVisible();
        }
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

test("home deck updates from Britain to region to local authority from the map stage", async ({ page }) => {
  await stabilizePage(page, { blockFonts: false });

  await page.goto("/", { waitUntil: "networkidle" });
  await waitForFonts(page);
  await disableMotion(page);
  await limitToTopOfPage(page, 5);

  const deckTitle = page.locator("[data-home-title]");
  const modeState = page.locator("[data-home-mode-state]");

  await expect(deckTitle).toHaveText("Britain now");
  await expect(page.locator("[data-home-parent]")).toBeHidden();
  await expect(page.locator("[data-home-reset]")).toBeHidden();

  await page.locator('[data-region-map-view]:not([hidden]) [data-region-map-region="Scotland"]').click();

  await expect(deckTitle).toHaveText("Scotland");
  await expect(modeState).toHaveText("Manual");
  await expect(page.locator("[data-home-parent]")).toContainText("Back to Britain");
  await expect(page.locator("[data-home-reset]")).toBeVisible();

  const mapPreviewButton = page.locator("[data-region-map-summary-links] [data-region-map-preview]").first();
  const firstPlaceName = (await page.locator("[data-region-map-summary-links] strong").first().textContent())?.trim() ?? "";

  await mapPreviewButton.click();

  await expect(deckTitle).toHaveText(firstPlaceName);
  await expect(page.locator("[data-home-parent]")).toContainText("Back to Scotland");
});
