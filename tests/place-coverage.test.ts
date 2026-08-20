import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getPublicPlaceAreas, buildPlacePath, slugifyAreaName } from "../src/lib/site";
import { loadLocalRouteLatest } from "../src/lib/route-data";

/**
 * The homepage once advertised "361 local authority profiles" in three places and the
 * directory advertised 307, while 152 pages actually built. Searching a real place
 * returned nothing and the site read as if its search was broken. Nothing asserted that
 * the number in the copy matched the number of pages, so the drift went unnoticed
 * through every refresh.
 *
 * These tests are the guard. They are deliberately about the relationship between the
 * copy, the generator and the routes spine, not about the value 361, so they keep
 * holding when the spine changes size.
 */
describe("place page coverage", () => {
  const spine = loadLocalRouteLatest().areas;
  const built = getPublicPlaceAreas();

  it("builds a page for every area in the routes spine", () => {
    expect(built.length).toBe(spine.length);
  });

  it("gives every area a unique slug, so no page silently overwrites another", () => {
    const slugs = built.map((area) => slugifyAreaName(area.areaName));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("produces a non-empty slug for every area", () => {
    const empty = built.filter((area) => slugifyAreaName(area.areaName).length === 0);
    expect(empty.map((area) => area.areaName)).toEqual([]);
  });

  it("advertises the built count rather than a hardcoded one", () => {
    // A bare three-digit number next to "areas" or "local authorit..." is how the stale
    // 361 and 307 survived. Catch the pattern, not the specific values.
    const pages = ["src/pages/index.astro", "src/pages/places/index.astro"];
    for (const page of pages) {
      const source = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
      const hardcoded = source.match(/\b\d{3}\s+(?:areas|local authorit)/gi) ?? [];
      expect(hardcoded, `${page} hardcodes an area count`).toEqual([]);
    }
  });

  it("routes every area to a /places/ path", () => {
    const bad = built.filter((area) => !buildPlacePath(area).startsWith("/places/"));
    expect(bad).toEqual([]);
  });
});
