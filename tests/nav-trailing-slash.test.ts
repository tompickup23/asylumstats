import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GitHub Pages answers /places with a 301 to /places/. Every main menu link lacked the
 * slash, so every click on the menu on every page was a redirect hop (SEO audit,
 * 2 November 2026, register task T37). Section links in the menu carry the slash.
 */
describe("main menu links", () => {
  it("end in a trailing slash", () => {
    const header = readFileSync(join(process.cwd(), "src/components/SiteHeader.astro"), "utf8");
    const hrefs = [...header.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((href) => href.startsWith("/") && !href.endsWith("/"))).toEqual([]);
  });
});
