import { expect, test } from "@playwright/test";
import { disableMotion, limitToTopOfPage, stabilizePage, waitForFonts } from "./layout-helpers";

const shouldAssertScreenshots = !process.env.CI;

const desktopPages = [
  {
    name: "home",
    path: "/",
    focus: "#read-this-first",
    hasPageContents: false,
    hasRegionMapExplorer: true,
    hasRegionMapSummary: false
  },
  { name: "places", path: "/places/", focus: "#place-map", hasPageContents: true, hasRegionMapExplorer: true, hasRegionMapSummary: false },
  { name: "north-west-region", path: "/places/regions/north-west/", focus: "#region-findings", hasPageContents: true, hasAuthorityStage: true },
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

      if ("hasAuthorityStage" in pageConfig && pageConfig.hasAuthorityStage) {
        await expect(page.locator("[data-region-authority-stage]")).toBeVisible();
        await expect(page.locator("[data-region-authority-svg]")).toBeVisible();
        await expect(page.locator("[data-home-system]")).toBeVisible();
      }

      if (shouldAssertScreenshots) {
        await expect(page).toHaveScreenshot(`${pageConfig.name}-desktop.png`, {
          animations: "disabled",
          caret: "hide",
          fullPage: false,
          maxDiffPixelRatio: 0.04
        });
      }
    });
  }
});

test("home deck updates from Britain to region to local authority", async ({ page }) => {
  await stabilizePage(page, { blockFonts: false });

  await page.goto("/", { waitUntil: "networkidle" });
  await waitForFonts(page);
  await disableMotion(page);
  await limitToTopOfPage(page, 5);

  const deckTitle = page.locator("[data-home-title]");

  await expect(deckTitle).toHaveText("Britain now");
  await expect(page.locator("[data-home-parent]")).toBeHidden();
  await expect(page.locator("[data-home-reset]")).toBeHidden();

  await page.locator('[data-region-map-view]:not([hidden]) [data-region-map-region="Scotland"]').click();

  await expect(deckTitle).toHaveText("Scotland");
  await expect(page.locator("[data-home-authority-stage]")).toBeVisible();
  await expect(page.locator('[data-home-map-pane="national"]')).toBeHidden();
  await expect(page.locator("[data-home-parent]")).toBeVisible();
  await expect(page.locator("[data-home-parent]")).toHaveText("Back to Britain");
  await expect(page.locator("[data-home-open]")).toBeVisible();
  await expect(page.locator("[data-home-open]")).toHaveText("Open region page");

  const firstPlaceCard = page.locator("[data-home-links] .home-next-card-action").first();
  const firstPlaceName = (await firstPlaceCard.locator("strong").first().textContent())?.trim() ?? "";
  const firstPlaceHref = await firstPlaceCard.locator("a").getAttribute("href");
  const firstPlaceScopeId = firstPlaceHref?.match(/\/places\/([^/]+)\//)?.[1];

  expect(firstPlaceScopeId).toBeTruthy();

  await firstPlaceCard.getByRole("button", { name: "Preview place" }).click();

  await expect(deckTitle).toHaveText(firstPlaceName);
  await expect(page.locator("[data-home-parent]")).toHaveText("Back to Scotland");
  await expect(page.locator("[data-home-open]")).toHaveText("Open place page");
});

test("home map stays fully contained on a MacBook-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await stabilizePage(page, { blockFonts: false });

  await page.goto("/", { waitUntil: "networkidle" });
  await waitForFonts(page);
  await disableMotion(page);
  await limitToTopOfPage(page, 5);

  const readMetrics = () =>
    page.evaluate(() => {
      const map =
        document.querySelector(".home-map-panel [data-home-map-pane=\"national\"] .region-map:not([hidden])") ??
        document.querySelector(".home-map-panel .home-authority-map");
      const canvas =
        document.querySelector(".home-map-panel [data-home-map-pane=\"national\"] .region-map-canvas") ??
        document.querySelector(".home-map-panel .home-authority-canvas");
      const panel = document.querySelector(".home-map-panel");
      const deckViewport = document.querySelector(".home-deck-viewport");
      const lastCard = document.querySelector('[data-home-pane="stats"] [data-home-links] .home-next-card:last-child');
      const firstCard = document.querySelector('[data-home-pane="stats"] [data-home-stats] .home-kpi-card:first-child');

      if (!map || !canvas || !panel || !deckViewport) {
        return null;
      }

      const mapRect = map.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const deckViewportRect = deckViewport.getBoundingClientRect();
      const lastCardRect = lastCard?.getBoundingClientRect() ?? null;
      const firstCardRect = firstCard?.getBoundingClientRect() ?? null;

      return {
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        mapTop: mapRect.top,
        mapBottom: mapRect.bottom,
        canvasTop: canvasRect.top,
        canvasBottom: canvasRect.bottom,
        panelBottom: panelRect.bottom,
        deckViewportBottom: deckViewportRect.bottom,
        deckViewportTop: deckViewportRect.top,
        lastCardBottom: lastCardRect?.bottom ?? null,
        firstCardTop: firstCardRect?.top ?? null,
        deckScrollTop: (deckViewport as HTMLElement).scrollTop
      };
    });

  const initialMetrics = await readMetrics();
  expect(initialMetrics).not.toBeNull();
  expect(initialMetrics!.scrollHeight).toBeLessThanOrEqual(initialMetrics!.innerHeight);
  expect(initialMetrics!.mapTop).toBeGreaterThanOrEqual(initialMetrics!.canvasTop - 1);
  expect(initialMetrics!.mapBottom).toBeLessThanOrEqual(initialMetrics!.canvasBottom + 1);
  expect(initialMetrics!.mapBottom).toBeLessThanOrEqual(initialMetrics!.panelBottom + 1);

  await page.locator('[data-region-map-view]:not([hidden]) [data-region-map-region="North West"]').click();
  await expect(page.locator("[data-home-title]")).toHaveText("North West");
  await expect(page.locator("[data-home-open]")).toHaveText("Open region page");
  await expect(page.locator("[data-home-authority-stage]")).toBeVisible();

  const selectedMetrics = await readMetrics();
  expect(selectedMetrics).not.toBeNull();
  expect(selectedMetrics!.mapTop).toBeGreaterThanOrEqual(selectedMetrics!.canvasTop - 1);
  expect(selectedMetrics!.mapBottom).toBeLessThanOrEqual(selectedMetrics!.canvasBottom + 1);
  expect(selectedMetrics!.mapBottom).toBeLessThanOrEqual(selectedMetrics!.panelBottom + 1);
  expect(selectedMetrics!.deckScrollTop).toBe(0);

  const firstPlaceCard = page.locator("[data-home-links] .home-next-card-action").first();
  await firstPlaceCard.getByRole("button", { name: "Preview place" }).click();
  await expect(page.locator("[data-home-parent]")).toHaveText("Back to North West");
  await expect(page.locator("[data-home-open]")).toHaveText("Open place page");
  await expect(page.locator("[data-home-links] .home-next-card")).toHaveCount(1);

  const placeMetrics = await readMetrics();
  expect(placeMetrics).not.toBeNull();
  expect(placeMetrics!.mapTop).toBeGreaterThanOrEqual(placeMetrics!.canvasTop - 1);
  expect(placeMetrics!.mapBottom).toBeLessThanOrEqual(placeMetrics!.canvasBottom + 1);
  expect(placeMetrics!.deckScrollTop).toBe(0);
  expect(placeMetrics!.firstCardTop).not.toBeNull();
  expect(placeMetrics!.firstCardTop!).toBeGreaterThanOrEqual(placeMetrics!.deckViewportTop - 1);
});

test("home visible controls and links stay coherent for first-time use", async ({ page }) => {
  await stabilizePage(page, { blockFonts: false });

  await page.goto("/", { waitUntil: "networkidle" });
  await waitForFonts(page);
  await disableMotion(page);
  await limitToTopOfPage(page, 5);

  await expect(page.locator(".home-map-copy p")).toContainText(
    "Pick one region on the map. The deck narrows from Britain to one region to one local authority."
  );
  await expect(page.locator("[data-home-controls]")).toBeHidden();

  await expect(page.locator("[data-home-visuals] .home-visual-card").first()).toBeVisible();
  await expect(page.locator('[data-home-pane="stats"] .home-story-card')).toBeVisible();

  await page.getByRole("button", { name: "Preview region" }).first().click();
  await expect(page.locator("[data-home-title]")).not.toHaveText("Britain now");
  await expect(page.locator("[data-home-open]")).toHaveText("Open region page");
  await expect(page.locator("[data-home-parent]")).toBeVisible();
  await expect(page.locator("[data-home-parent]")).toHaveText("Back to Britain");
  await expect(page.locator("[data-home-links-label]")).toHaveText("Open one local authority");
  await expect(page.locator("[data-home-authority-stage]")).toBeVisible();

  const firstPlaceCard = page.locator("[data-home-links] .home-next-card-action").first();
  await firstPlaceCard.getByRole("button", { name: "Preview place" }).click();
  await expect(page.locator("[data-home-open]")).toHaveText("Open place page");
  await expect(page.locator("[data-home-links-label]")).toHaveText("Also open");
  await expect(page.locator("[data-home-links] .home-next-card")).toHaveCount(1);
  await expect(page.locator("[data-home-links] a").first()).toHaveAttribute("href", /\/places\/regions\/.+\/$/);

  await page.locator("[data-home-parent]").click();
  await expect(page.locator("[data-home-title]")).toHaveText("North West");
  await page.locator("[data-home-parent]").click();
  await expect(page.locator("[data-home-title]")).toHaveText("Britain now");
  await expect(page.locator('[data-home-map-pane="national"]')).toBeVisible();
});
