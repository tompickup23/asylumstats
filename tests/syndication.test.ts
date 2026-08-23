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
