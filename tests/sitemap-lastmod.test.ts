import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guards the one rule that makes lastmod worth publishing at all.
 *
 * Google decides whether to trust the field once, for the whole domain. Stamping build
 * time on every URL is not a smaller version of doing it properly, it is the thing that
 * makes the accurate dates on the findings stop counting too. These tests fail if a
 * future change starts emitting today's date, emits a date in the future, or reaches for
 * changefreq and priority, which Google ignores.
 */
const DIST = resolve(__dirname, "../dist/sitemap.xml");

describe.skipIf(!existsSync(DIST))("sitemap lastmod", () => {
  const xml = existsSync(DIST) ? readFileSync(DIST, "utf8") : "";
  const entries = [...xml.matchAll(/<loc>(.*?)<\/loc>(?:\s*<lastmod>(.*?)<\/lastmod>)?/g)]
    .map(([, loc, lastmod]) => ({ loc, lastmod }));

  it("has entries to check", () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  it("never stamps the build date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const stamped = entries.filter((e) => e.lastmod === today);
    expect(
      stamped.map((e) => e.loc),
      "lastmod equals today's date, which is what a build stamp looks like. Derive it " +
        "from the release the page renders instead, or leave it off."
    ).toEqual([]);
  });

  it("never dates a page in the future", () => {
    const today = new Date().toISOString().slice(0, 10);
    const ahead = entries.filter((e) => e.lastmod && e.lastmod > today);
    expect(ahead.map((e) => `${e.loc} ${e.lastmod}`)).toEqual([]);
  });

  it("emits only whole ISO dates", () => {
    const malformed = entries.filter((e) => e.lastmod && !/^\d{4}-\d{2}-\d{2}$/.test(e.lastmod));
    expect(malformed.map((e) => `${e.loc} ${e.lastmod}`)).toEqual([]);
  });

  it("omits changefreq and priority, which Google ignores", () => {
    expect(xml).not.toContain("<changefreq>");
    expect(xml).not.toContain("<priority>");
  });

  it("dates every place page from the routes release", () => {
    const places = entries.filter((e) => /\/places\/[^/]+\/$/.test(e.loc));
    expect(places.length).toBeGreaterThan(300);
    expect(places.filter((e) => !e.lastmod).map((e) => e.loc)).toEqual([]);
  });
});
