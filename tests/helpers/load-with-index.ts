import type { Page } from "@playwright/test";

/** Arm the response wait before navigation so a fast index fetch cannot race it. */
export async function loadWithIndex(page: Page, path = "/") {
  const indexLoaded = page.waitForResponse((response) =>
    response.url().includes("/search-index.json"));
  await page.goto(path);
  await indexLoaded;
}
