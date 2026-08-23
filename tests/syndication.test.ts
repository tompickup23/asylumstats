import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dist = join(__dirname, "..", "dist");
const built = existsSync(join(dist, "feed.xml"));

/**
 * These read the built output, because the defects they guard against are things that
 * only exist after rendering: a feed that parses, a sitemap whose lastmod means something,
 * a logo in a format the consumer accepts. Skipped when dist is absent so `npm test` on a
 * clean checkout is not a build.
 */
describe.skipIf(!built)("syndication surfaces", () => {
  const feed = () => readFileSync(join(dist, "feed.xml"), "utf8");
  const sitemap = () => readFileSync(join(dist, "sitemap.xml"), "utf8");

  it("publishes a feed with items in it", () => {
    const items = feed().match(/<item>/g) ?? [];
    expect(items.length).toBeGreaterThan(10);
    expect(feed()).toContain('rel="self"');
  });

  it("dates the feed in RFC 822, which is what RSS requires", () => {
    // An ISO date here parses in some readers and is dropped by others, so the item
    // silently loses its position in the timeline rather than failing.
    const dates = [...feed().matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => m[1]);
    expect(dates.length).toBeGreaterThan(10);
    for (const date of dates) {
      expect(date, date).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/);
      expect(Number.isNaN(Date.parse(date))).toBe(false);
    }
  });

  it("orders the feed newest first", () => {
    const dates = [...feed().matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => Date.parse(m[1]));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it("keeps superseded findings out of the feed, as it does out of the sitemap", () => {
    expect(feed()).not.toContain("/findings/true-grant-rate-appeals/");
    expect(sitemap()).not.toContain("/findings/true-grant-rate-appeals/");
  });

  /**
   * The failure this stops is a sitemap that stamps every URL with the build date. That
   * looks like diligence and is the opposite: it tells a crawler all 463 pages changed
   * today, so none of them stand out, and the signal is worth less than omitting it.
   */
  it("stamps lastmod only where a real date exists", () => {
    const urls = (sitemap().match(/<url>/g) ?? []).length;
    const stamped = (sitemap().match(/<lastmod>/g) ?? []).length;
    expect(urls).toBeGreaterThan(100);
    expect(stamped).toBeGreaterThan(0);
    expect(stamped).toBeLessThan(urls / 2);

    const today = new Date().toISOString().slice(0, 10);
    const dates = [...sitemap().matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    expect(dates.filter((d) => d === today).length).toBeLessThan(dates.length);
  });

  it("declares a logo in a format the consumer accepts", () => {
    // Google's Organization logo must be a raster. The site declared favicon.svg, which is
    // ignored, so the markup was there and the rich result was never available.
    const home = readFileSync(join(dist, "index.html"), "utf8");
    const logo = /"logo":\{[^}]*"url":"([^"]+)"/.exec(home);
    expect(logo, "no Organization logo in the homepage structured data").not.toBeNull();
    expect(logo![1]).toMatch(/\.(png|jpg|jpeg|gif)$/);
  });

  it("links the feed from the page so it can be found", () => {
    expect(readFileSync(join(dist, "index.html"), "utf8")).toContain('type="application/rss+xml"');
  });
});

describe.skipIf(!built)("every bespoke OG card is actually used", () => {
  /**
   * BUILD_OG=1 generates a card for every finding, every place, home and routes. Two of
   * those were being built and never linked to: /routes/ and all 361 place pages declared
   * og-card.png, the generic site card, while /og/routes.png and /og/places/<slug>.png sat
   * on disk unused. The og:image a page declares and the card the generator built for it
   * had simply never been connected on those two page types.
   *
   * This only runs when dist/og exists, i.e. after a BUILD_OG=1 build. It is not part of
   * the default `npm test` build, which does not set BUILD_OG.
   */
  const ogDir = join(dist, "og");
  const hasOg = existsSync(ogDir);

  it.skipIf(!hasOg)("links /routes/ to its generated card, not the generic one", () => {
    const routes = readFileSync(join(dist, "routes", "index.html"), "utf8");
    expect(routes).toContain("/og/routes.png");
    expect(routes).not.toMatch(/og:image" content="[^"]*\/og-card\.png"/);
  });

  it.skipIf(!hasOg)("links a sample of place pages to their generated card", () => {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const placeDirs = readdirSync(join(dist, "places")).filter(
      (name) => name !== "index.html" && name !== "regions" && name !== "counties"
    );
    expect(placeDirs.length).toBeGreaterThan(50);
    for (const slug of placeDirs.slice(0, 10)) {
      const page = readFileSync(join(dist, "places", slug, "index.html"), "utf8");
      expect(page, slug).toContain(`/og/places/${slug}.png`);
      expect(page, slug).not.toMatch(/og:image" content="[^"]*\/og-card\.png"/);
    }
  });
});
