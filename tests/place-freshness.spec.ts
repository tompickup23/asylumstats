import { test, expect } from "@playwright/test";
import manifest from "../data/raw/manifests/uk_routes.json" with { type: "json" };

test("built places cite the manifest and remove the next update at expiry", async ({ page, isMobile }) => {
  const html = await (await page.request.get("/places/burnley/")).text();
  const expiry = /data-expires-at="([^"]+)"/.exec(html)?.[1];
  test.skip(!expiry, "No future date was available at build time.");
  const expiresAt = Date.parse(expiry!);
  await page.clock.install({ time: new Date(expiresAt - 60000) });
  await page.clock.pauseAt(new Date(expiresAt - 60000));
  for (const slug of ["burnley", "birmingham", "glasgow-city"]) {
    await page.goto(`/places/${slug}/`);
    const badge = page.locator(".freshness-badge").first();
    await expect(badge.getByRole("link", { name: "Home Office", exact: true })).toHaveAttribute("href", manifest.releasePage);
    await expect(badge.locator(".freshness-next")).toHaveCount(1);
    if (!isMobile) await expect(badge.locator(".freshness-next")).toBeVisible();
    await expect(badge).toContainText("Updated");
  }
  await page.clock.fastForward(60000);
  await expect(page.locator(".freshness-next[data-expires-at]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Corrections log", exact: true })).toBeVisible();
  // A fresh visit to the same static HTML must also omit the expired line.
  await page.reload();
  await expect(page.locator(".freshness-next[data-expires-at]")).toHaveCount(0);
});

test("the next update stays hidden when JavaScript cannot check its expiry", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/places/burnley/");
  await expect(page.locator(".freshness-next[data-expires-at]")).toBeHidden();
  await expect(page.locator(".freshness-badge").first()).toContainText("Updated");
  await context.close();
});
