import { expect, test } from "@playwright/test";

const pages = [
  { name: "home", path: "/", focus: "#read-this-first", hasPageContents: false },
  { name: "hotels", path: "/hotels/", focus: "#hotel-findings", hasPageContents: true },
  { name: "spending", path: "/spending/", focus: "#money-findings", hasPageContents: true },
  { name: "compare", path: "/compare/", focus: "#compare-findings", hasPageContents: true },
  { name: "routes", path: "/routes/", focus: "#route-findings", hasPageContents: true },
  { name: "sources", path: "/sources/", focus: "#source-findings", hasPageContents: true },
  { name: "methodology", path: "/methodology/", focus: "#method-findings", hasPageContents: true }
] as const;

test.describe("mobile evidence-first layout", () => {
  for (const pageConfig of pages) {
    test(`${pageConfig.name} keeps the priority section visible and stable`, async ({ page }, testInfo) => {
      await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
      await page.route("https://fonts.gstatic.com/**", (route) => route.abort());

      await page.goto(pageConfig.path, { waitUntil: "networkidle" });
      await page.addStyleTag({
        content: `
          *,
          *::before,
          *::after {
            animation: none !important;
            transition: none !important;
            scroll-behavior: auto !important;
          }
        `
      });

      const prioritySection = page.locator(pageConfig.focus);
      const firstContentSection = page.locator("main > section.section").first();

      await expect(prioritySection).toBeVisible();
      await expect(prioritySection.locator("h2").first()).toBeVisible();
      await expect(firstContentSection).toHaveAttribute("id", pageConfig.focus.slice(1));
      await expect(firstContentSection).toHaveClass(/priority-section/);

      if (pageConfig.hasPageContents) {
        const pageContents = page.locator(".page-contents").first();
        await expect(pageContents).toBeVisible();
        await expect(page.locator(".page-contents-links a").first()).toHaveAttribute("href", pageConfig.focus);

        const pageContentsPosition = await pageContents.evaluate((node) => getComputedStyle(node).position);
        expect(pageContentsPosition).toBe("static");
      }

      const overflowWidth = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflowWidth).toBeLessThanOrEqual(2);

      const screenshot = await page.screenshot({ fullPage: false });
      await testInfo.attach(`${pageConfig.name}-mobile`, {
        body: screenshot,
        contentType: "image/png"
      });
    });
  }
});
