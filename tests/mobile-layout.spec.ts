import { expect, test, type Page } from "@playwright/test";

const pages = [
  { name: "home", path: "/", focus: "#read-this-first", hasPageContents: false },
  { name: "hotels", path: "/hotels/", focus: "#hotel-findings", hasPageContents: true },
  { name: "spending", path: "/spending/", focus: "#money-findings", hasPageContents: true },
  { name: "entities", path: "/entities/", focus: "#entity-findings", hasPageContents: true },
  { name: "compare", path: "/compare/", focus: "#compare-findings", hasPageContents: true },
  { name: "routes", path: "/routes/", focus: "#route-findings", hasPageContents: true },
  { name: "sources", path: "/sources/", focus: "#source-findings", hasPageContents: true },
  { name: "methodology", path: "/methodology/", focus: "#method-findings", hasPageContents: true }
] as const;

const placePages = [
  { name: "birmingham", path: "/places/E08000025/", focus: "#stock-logic" },
  { name: "north-yorkshire", path: "/places/E06000065/", focus: "#stock-logic" }
] as const;

const filteredViews = [
  {
    name: "compare-filtered",
    path: "/compare/?compare_model=hotel-heavy&compare_focus=contingency&compare_limit=24#compare-explorer",
    root: "#compare-explorer",
    summary: "[data-compare-summary]",
    expectedSummary: /Showing \d+ of \d+ matching places/,
    expectedFocus: "contingency",
    expectedLocation: "compare_model=hotel-heavy"
  },
  {
    name: "hotels-filtered",
    path: "/hotels/?hotel_status=current&hotel_coverage=unresolved#hotel-filters",
    root: "#hotel-filters",
    summary: "[data-hotel-site-summary]",
    expectedSummary: /Showing \d+ matching site rows/,
    expectedFocus: "current",
    expectedLocation: "hotel_coverage=unresolved"
  },
  {
    name: "spending-filtered",
    path: "/spending/?money_route=asylum_support&money_value=with_value&money_sort=value#money-explorer",
    root: "#money-explorer",
    summary: "[data-money-summary]",
    expectedSummary: /Showing \d+ of \d+ public ledger rows/,
    expectedFocus: "asylum_support",
    expectedLocation: "money_sort=value"
  },
  {
    name: "entities-filtered",
    path: "/entities/?entity_role=prime_provider&entity_footprint=named_estate&entity_sort=estate#entity-explorer",
    root: "#entity-explorer",
    summary: "[data-entity-summary]",
    expectedSummary: /Showing \d+ of \d+ matching profiles/,
    expectedFocus: "prime_provider",
    expectedLocation: "entity_footprint=named_estate"
  },
  {
    name: "place-drilldown",
    path: "/places/E09000028/?place_metric=contingency_accommodation&place_scope=national#place-drilldown",
    root: "#place-drilldown",
    summary: "[data-place-drill-summary]",
    expectedSummary: /ranks \d+ of \d+ nationally|nationally on contingency accommodation/i,
    expectedFocus: "contingency_accommodation",
    expectedLocation: "place_scope=national"
  }
] as const;

async function stabilizePage(page: Page) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
}

async function disableMotion(page: Page) {
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
}

test.describe("mobile evidence-first layout", () => {
  for (const pageConfig of pages) {
    test(`${pageConfig.name} keeps the priority section visible and stable`, async ({ page }, testInfo) => {
      await stabilizePage(page);

      await page.goto(pageConfig.path, { waitUntil: "networkidle" });
      await disableMotion(page);

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

test.describe("mobile place pages", () => {
  for (const pageConfig of placePages) {
    test(`${pageConfig.name} keeps place navigation and stock logic stable`, async ({ page }, testInfo) => {
      await stabilizePage(page);

      await page.goto(pageConfig.path, { waitUntil: "networkidle" });
      await disableMotion(page);

      const pageContents = page.locator(".page-contents").first();
      const firstContentSection = page.locator("main > section.section").first();
      const stockLogicSection = page.locator(pageConfig.focus);

      await expect(pageContents).toBeVisible();
      await expect(stockLogicSection).toBeVisible();
      await expect(firstContentSection).toHaveAttribute("id", pageConfig.focus.slice(1));
      await expect(page.locator(".page-contents-links a").first()).toHaveAttribute("href", pageConfig.focus);

      const pageContentsPosition = await pageContents.evaluate((node) => getComputedStyle(node).position);
      expect(pageContentsPosition).toBe("static");

      const overflowWidth = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflowWidth).toBeLessThanOrEqual(2);

      const screenshot = await page.screenshot({ fullPage: false });
      await testInfo.attach(`${pageConfig.name}-place-mobile`, {
        body: screenshot,
        contentType: "image/png"
      });
    });
  }
});

test.describe("mobile filtered views", () => {
  for (const view of filteredViews) {
    test(`${view.name} keeps query state and layout stable`, async ({ page }, testInfo) => {
      await stabilizePage(page);

      await page.goto(view.path, { waitUntil: "networkidle" });
      await disableMotion(page);

      const root = page.locator(view.root);
      const summary = page.locator(view.summary);

      await expect(root).toBeVisible();
      await expect(summary).toContainText(view.expectedSummary);
      await expect(page).toHaveURL(new RegExp(view.expectedLocation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

      if (view.name === "compare-filtered") {
        await expect(page.locator('select[name="compare_focus"]')).toHaveValue(view.expectedFocus);
        const visibleModels = await page
          .locator("[data-compare-item]:not([hidden])")
          .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-model") ?? ""));
        expect(visibleModels.length).toBeGreaterThan(0);
        expect(visibleModels.every((value) => value === "hotel-heavy")).toBe(true);
      }

      if (view.name === "hotels-filtered") {
        const visibleHotelRows = await page
          .locator("[data-hotel-site-row]:not([hidden])")
          .evaluateAll((elements) =>
            elements.map((element) => ({
              status: element.getAttribute("data-status") ?? "",
              coverage: element.getAttribute("data-coverage") ?? ""
            }))
          );
        expect(visibleHotelRows.length).toBeGreaterThan(0);
        expect(visibleHotelRows.every((row) => row.status === "current" && row.coverage === "unresolved")).toBe(
          true
        );
      }

      if (view.name === "spending-filtered") {
        await expect(page.locator('select[name="money_route"]')).toHaveValue(view.expectedFocus);
        const visibleMoneyRows = await page
          .locator("[data-money-row]:not([hidden])")
          .evaluateAll((elements) =>
            elements.map((element) => ({
              route: element.getAttribute("data-route") ?? "",
              hasValue: element.getAttribute("data-has-value") ?? ""
            }))
          );
        expect(visibleMoneyRows.length).toBeGreaterThan(0);
        expect(visibleMoneyRows.every((row) => row.route === "asylum_support" && row.hasValue === "true")).toBe(
          true
        );
      }

      if (view.name === "place-drilldown") {
        await expect(page.locator('select[name="place_metric"]')).toHaveValue(view.expectedFocus);
        await expect(page.locator('select[name="place_scope"]')).toHaveValue("national");
        await expect(page.locator("[data-place-drill-panel]:not([hidden])")).toHaveAttribute(
          "data-metric",
          "contingency_accommodation"
        );
      }

      if (view.name === "entities-filtered") {
        await expect(page.locator('select[name="entity_role"]')).toHaveValue(view.expectedFocus);
        await expect(page.locator('select[name="entity_footprint"]')).toHaveValue("named_estate");
        const visibleEntityRows = await page
          .locator("[data-entity-item]:not([hidden])")
          .evaluateAll((elements) =>
            elements.map((element) => ({
              role: element.getAttribute("data-role") ?? "",
              currentSites: Number(element.getAttribute("data-current-sites") ?? "0")
            }))
          );
        expect(visibleEntityRows.length).toBeGreaterThan(0);
        expect(visibleEntityRows.every((row) => row.role === "prime_provider" && row.currentSites > 0)).toBe(true);
      }

      const overflowWidth = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflowWidth).toBeLessThanOrEqual(2);

      const screenshot = await page.screenshot({ fullPage: false });
      await testInfo.attach(`${view.name}-filtered-mobile`, {
        body: screenshot,
        contentType: "image/png"
      });
    });
  }
});
