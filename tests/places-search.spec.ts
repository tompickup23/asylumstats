import { expect, test } from "@playwright/test";
import { loadWithIndex } from "./helpers/load-with-index";

test("places finder returns Burnley from the mixed index without a page error", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await loadWithIndex(page, "/places/");
  await page.fill("#place-search-input", "burn");

  const burnley = page.locator("#place-search-results a", { hasText: "Burnley" });
  await expect(burnley).toBeVisible();
  await expect(burnley).toHaveAttribute("href", "/places/burnley/");
  expect(errors, `page errors while typing:\n${errors.join("\n")}`).toEqual([]);
});
