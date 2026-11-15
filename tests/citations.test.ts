import fs from "node:fs";
import { describe, expect, it } from "vitest";
import raw from "../src/data/site/citations.json";
import { CITATIONS, citationDay, citationSubjectOf } from "../src/lib/citations";
import { SITE_URL, getIndexableSitePaths, organizationNode } from "../src/lib/site";

const BANNED = [/—/, /–/, / - /, /&mdash;|&ndash;/];
const placeTemplate = fs.readFileSync("src/pages/places/[slug].astro", "utf8");
const page = fs.readFileSync("src/pages/cited-by.astro", "utf8");

describe("citations record", () => {
  it("has at least one citation, each complete", () => {
    expect(CITATIONS.length).toBeGreaterThan(0);
    for (const c of CITATIONS) {
      for (const key of ["id", "title", "publisher", "url", "location", "used", "nameUsed", "asPath", "asLabel", "checkedNote"] as const) {
        expect(c[key], `${c.id}.${key}`).toBeTruthy();
      }
      expect(typeof c.linked).toBe("boolean");
      for (const d of [c.datePublished, c.checked]) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.checked >= c.datePublished, `${c.id}: checked before it was published`).toBe(true);
      expect(c.url).toMatch(/^https:\/\//);
      for (const copy of c.alsoIn) {
        expect(copy.url).toMatch(/^https:\/\//);
        expect(copy.publisher).toBeTruthy();
        expect(typeof copy.linked).toBe("boolean");
      }
    }
  });

  it("uses no dashes as punctuation", () => {
    const text = JSON.stringify(raw);
    for (const re of BANNED) expect(text).not.toMatch(re);
  });

  it("names outlets, not individuals", () => {
    for (const c of raw.citations) expect(c).not.toHaveProperty("author");
  });

  it("ids are unique and urls are not listed twice", () => {
    const ids = CITATIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const urls = CITATIONS.flatMap((c) => [c.url, ...c.alsoIn.map((copy) => copy.url)]);
    expect(new Set(urls).size).toBe(urls.length);
  });

  // An entry points at the page its figures came from. If that page or its anchor is
  // renamed, the record stops landing where the outlet's figures live.
  it("every cited page is still published", () => {
    const paths = new Set(getIndexableSitePaths());
    for (const c of CITATIONS) {
      const [pathname] = c.asPath.split("#");
      expect(paths.has(pathname), `${c.id}: ${pathname}`).toBe(true);
    }
  });

  it("every cited anchor is still a section id on that page type", () => {
    for (const c of CITATIONS) {
      const [pathname, fragment] = c.asPath.split("#");
      if (!fragment) continue;
      expect(pathname.startsWith("/places/"), `${c.id}: anchors are only checked on place pages`).toBe(true);
      expect(placeTemplate, `${c.id}: #${fragment}`).toContain(`id="${fragment}"`);
    }
  });

  it("the cited-by page renders the record and is indexable", () => {
    expect(page).toContain("CITATIONS.map");
    expect(getIndexableSitePaths()).toContain("/cited-by/");
  });

  it("formats dates in words without shifting the day", () => {
    expect(citationDay("2026-11-07")).toBe("7 November 2026");
    expect(citationDay("2026-01-01")).toBe("1 January 2026");
  });
});

describe("Organization structured data", () => {
  const org = organizationNode();

  it("keeps the shared @id and names the spellings outlets use", () => {
    expect(org["@id"]).toBe(`${SITE_URL}/#organization`);
    const names = org.alternateName as string[];
    for (const c of CITATIONS) expect(names, c.id).toContain(c.nameUsed);
  });

  it("lists each citing article and each copy, pointing at the page it cites", () => {
    const subjectOf = org.subjectOf as Array<Record<string, unknown>>;
    expect(subjectOf).toEqual(citationSubjectOf(SITE_URL));
    const expected = CITATIONS.reduce((n, c) => n + 1 + c.alsoIn.length, 0);
    expect(subjectOf.length).toBe(expected);
    for (const node of subjectOf) {
      expect(String(node.citation).startsWith(`${SITE_URL}/`)).toBe(true);
    }
  });

  it("the layout uses the shared node rather than its own copy", () => {
    const src = fs.readFileSync("src/layouts/BaseLayout.astro", "utf8");
    expect(src).toContain("organizationNode(siteOrigin)");
    expect(src).not.toMatch(/"@type": "Organization"/);
  });
});
