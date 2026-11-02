import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildPlacePath } from "../src/lib/site-identity";

/**
 * Old URLs that Search Console still reports as 404 resolve to a page that exists.
 *
 * Place pages lived at /places/<area code>/ until 11 April 2026. astro.config.mjs builds
 * one static redirect per area code from the routes mart; these checks read the build,
 * so they skip until dist exists, like the other built-site guards.
 */
const ROOT = resolve(import.meta.dirname ?? __dirname, "..");
const DIST = join(ROOT, "dist");
const areas = JSON.parse(
  readFileSync(join(ROOT, "data/marts/uk_routes/local-route-latest.json"), "utf8")
).areas as Array<{ areaCode: string; areaName: string }>;

function refreshTarget(path: string): string | undefined {
  const file = join(DIST, path, "index.html");
  if (!existsSync(file)) return undefined;
  return readFileSync(file, "utf8").match(/http-equiv="refresh" content="0;url=([^"]+)"/)?.[1];
}

const pageBuilt = (path: string) => existsSync(join(DIST, path, "index.html"));

describe.skipIf(!existsSync(DIST))("legacy URL redirects in the built site", () => {
  it("redirects every area code to its place page, and the place page exists", () => {
    const problems: string[] = [];
    for (const area of areas) {
      const from = `/places/${area.areaCode}/`;
      const to = buildPlacePath(area);
      const target = refreshTarget(from);
      if (target !== to) problems.push(`${from} -> ${target ?? "nothing"}, expected ${to}`);
      else if (!pageBuilt(to)) problems.push(`${from} -> ${to}, which was not built`);
    }
    expect(problems).toEqual([]);
  });

  it("redirects the pages removed in April 2026 to pages that exist", () => {
    for (const from of [
      "/hotels/",
      "/findings/blackburn-minority-white-british-2028/",
      "/findings/five-councils-minority-wb-by-2050/",
      "/findings/cohort-component-projections-318-areas/",
      "/findings/census-decade-white-british-decline/",
      "/findings/stochastic-projections-confidence/"
    ]) {
      const target = refreshTarget(from);
      expect(target, from).toBeDefined();
      expect(pageBuilt(target!), `${from} -> ${target}`).toBe(true);
    }
  });

  it("builds a 404 page with the site header and is not indexed", () => {
    const html = readFileSync(join(DIST, "404.html"), "utf8");
    expect(html).toMatch(/<meta name="robots" content="noindex/);
    expect(html).toContain('href="/places/"');
    expect(html).toMatch(/static\.cloudflareinsights\.com\/beacon\.min\.js/);
  });
});
