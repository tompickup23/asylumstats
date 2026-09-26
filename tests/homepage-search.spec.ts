import { expect, test } from "@playwright/test";

/**
 * The two homepage lookups, exercised in a browser because that is the only place this
 * defect exists.
 *
 * Both shipped broken. /search-index.json carries four kinds of entry — place, region,
 * finding and page — and only the 361 place entries have an `areaName`. Both handlers
 * filtered the whole array on `a.areaName.toLowerCase()`, so they threw
 * "Cannot read properties of undefined (reading 'toLowerCase')" on the first page entry,
 * which sorts first, on every keystroke. Nothing rendered and nothing said why.
 *
 * No unit test could have caught it: the index was correct, both handlers compiled, and
 * the failure only exists once a real fetch meets a real keystroke. The site's other
 * Playwright specs assert layout, not behaviour, so the searches were never driven.
 *
 * Any uncaught page error fails these outright. The bug announced itself in the console
 * and nobody was listening, so listening is the test.
 */
const SEARCHES = [
  { name: "area lookup", input: "#area-search", results: "#area-results" },
  { name: "council lookup", input: "#future-search", results: "#future-results" }
] as const;

test.describe("homepage search", () => {
  for (const search of SEARCHES) {
    test(`${search.name} returns results and raises no error`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto("/");
      // The handlers populate from a fetch, so the input is live before the data is.
      await page.waitForResponse((response) => response.url().includes("/search-index.json"));

      await page.fill(search.input, "Burnley");
      const results = page.locator(search.results);
      await expect(results).toBeVisible();
      await expect(results.locator("a, button").first()).toContainText("Burnley");
      expect(errors, `page errors while typing:\n${errors.join("\n")}`).toEqual([]);
    });

    test(`${search.name} matches on a partial name and hides on no match`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto("/");
      await page.waitForResponse((response) => response.url().includes("/search-index.json"));
      const results = page.locator(search.results);

      await page.fill(search.input, "bur");
      await expect(results.locator("a, button")).not.toHaveCount(0);

      // A query matching nothing must close the panel rather than leave the last results
      // sitting under a query they do not answer.
      await page.fill(search.input, "zzzzzz");
      await expect(results).toBeHidden();
      expect(errors, `page errors while typing:\n${errors.join("\n")}`).toEqual([]);
    });
  }

  test("area lookup resolves a postcode to its authority", async ({ page }) => {
    // Hits api.postcodes.io, which the CSP allows and the page depends on. If this is ever
    // flaky in CI it should be stubbed, not deleted: the postcode path is the one most
    // readers arrive through.
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");
    await page.waitForResponse((response) => response.url().includes("/search-index.json"));

    await page.fill("#area-search", "BB11 2ED");
    const result = page.locator("#area-results a").first();
    await expect(result).toContainText("Burnley", { timeout: 15000 });
    await expect(result).toHaveAttribute("href", "/places/burnley/");
    expect(errors, `page errors during postcode lookup:\n${errors.join("\n")}`).toEqual([]);
  });

  test("header search still works, since all three read one index", async ({ page }) => {
    await page.goto("/");
    await page.click("[data-site-search-open]");
    await page.fill("[data-site-search-input]", "Burnley");
    await expect(page.locator("[data-site-search-results] a").first()).toContainText("Burnley");
  });
});
