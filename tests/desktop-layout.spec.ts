import { expect, test } from "@playwright/test";
import { disableMotion, limitToTopOfPage, stabilizePage, waitForFonts } from "./layout-helpers";

/**
 * Screenshot assertions, and why they are off by default.
 *
 * This was `!process.env.CI`, which had it exactly backwards. The tracked baselines are
 * Linux renders, so the old flag skipped them on the one platform that could check them
 * and enforced them on macOS, where font rendering differs enough that all nine fail
 * every run. Net effect: nine baselines enforced nowhere, and a `test:desktop` that was
 * permanently red locally and so useless as a pre-push gate.
 *
 * Two conditions now. Linux, because that is what the baselines are. And an explicit
 * opt-in, because the baselines have not been regenerated since the pages they cover
 * changed substantially (the all-361 build, PR #32's chart work), and `national` and
 * `regional` have no committed baseline at all. Turning assertions on before
 * regenerating would simply move CI from silently-not-checking to loudly-broken.
 *
 * The sequence to finish this:
 *   1. Run the `update-desktop-baselines` workflow, which regenerates on Linux and
 *      commits the PNGs.
 *   2. Set ASSERT_SCREENSHOTS=1 on the test:desktop steps in deploy.yml and
 *      site-checks.yml.
 *
 * The structural assertions above this flag run everywhere and are the part worth having
 * locally: the `.sys-card` count check is what caught a seven-card grid orphaning a row.
 * Never commit a baseline generated on macOS.
 */
const shouldAssertScreenshots =
  process.platform === "linux" && process.env.ASSERT_SCREENSHOTS === "1";

const desktopPages = [
  { name: "home", path: "/", focus: "#headline-stats", hasPageContents: false },
  { name: "places", path: "/places/", focus: "#place-search", hasPageContents: true },
  // north-west-region removed — page completely rewritten without priority-section pattern
  // Leads with the Home Office payment ledger now, not the curated findings block.
  { name: "spending", path: "/spending/", focus: "#ho-spend-ledger", hasPageContents: true },
  { name: "compare", path: "/compare/", focus: "#compare-findings", hasPageContents: true },
  { name: "routes", path: "/routes/", focus: "#route-findings", hasPageContents: true },
  { name: "entities", path: "/entities/", focus: "#ho-spend-ledger", hasPageContents: true },
  { name: "national", path: "/national/", focus: "#national-overview", hasPageContents: true },
  { name: "regional", path: "/regional/", focus: ".region-grid", hasPageContents: false },
  { name: "birmingham-place", path: "/places/birmingham/", focus: "#place-summary", hasPageContents: true }
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

test("home page renders hero and stats grid", async ({ page }) => {
  await stabilizePage(page, { blockFonts: false });

  await page.goto("/", { waitUntil: "networkidle" });
  await waitForFonts(page);
  await disableMotion(page);

  await expect(page.locator(".hero-section")).toBeVisible();
  await expect(page.locator(".hero-headline")).toBeVisible();
  await expect(page.locator("#headline-stats")).toBeVisible();
  await expect(page.locator(".sys-card")).toHaveCount(6);
  await expect(page.locator(".cost-item")).toHaveCount(3);
  await expect(page.locator("#your-area")).toBeVisible();
});
