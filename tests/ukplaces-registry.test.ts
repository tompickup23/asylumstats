import { describe, it, expect } from "vitest";
import { getUkPlacesRecord, ukPlacesUrl } from "../src/lib/ukplaces-registry";
import { loadLocalRouteLatest } from "../src/lib/route-data";

/**
 * The registry decides which sibling cross-links each place page shows, and both ways of
 * getting it wrong have already happened on this site.
 *
 * First the link was built from the area slug for every area, so all 32 Scottish and 11
 * Northern Irish pages pointed at a 404 on a Census-based site that covers England and
 * Wales only. Then the registry replaced that heuristic and went the other way: coverage
 * was resolved on the current GSS code alone, and Sheffield and Barnsley have been recoded
 * since UK Demographics keyed its data, so two live pages were flagged as absent and two
 * working links were dropped. Fixed upstream in ukplaces by falling back to the slug.
 *
 * These assert the shape of the registry rather than the contents of the other sites,
 * because a unit test cannot see whether a URL 200s. What it can do is fail when a synced
 * registry stops covering every area, or starts asserting a URL that does not match the
 * host and path the link is built from.
 */
describe("ukplaces registry", () => {
  const areas = loadLocalRouteLatest().areas;

  it("has a record for every place page", () => {
    const missing = areas.filter((area) => !getUkPlacesRecord(area.areaCode));
    expect(missing.map((area) => `${area.areaName} (${area.areaCode})`)).toEqual([]);
  });

  it("gives every record a slug the place-record URL can be built from", () => {
    for (const area of areas) {
      const record = getUkPlacesRecord(area.areaCode)!;
      expect(record.slug, `${area.areaName} has no registry slug`).toBeTruthy();
      expect(ukPlacesUrl(record)).toBe(`https://ukplaces.co.uk/places/${record.slug}/`);
    }
  });

  it("keeps every asserted demographics URL on the host and path it claims", () => {
    for (const area of areas) {
      const coverage = getUkPlacesRecord(area.areaCode)!.coverage.ukdemographics;
      if (!coverage.hasPage) {
        // A false negative drops a working link silently, which is how Sheffield and
        // Barnsley were lost, so the absent case has to be explicit rather than partial.
        expect(coverage.url, `${area.areaName} claims no page but carries a URL`).toBeNull();
        continue;
      }
      expect(coverage.url, `${area.areaName} claims a page with no URL`).toBeTruthy();
      expect(coverage.url!).toMatch(/^https:\/\/ukdemographics\.co\.uk\/places\/[a-z0-9-]+\/$/);
    }
  });

  it("covers Sheffield and Barnsley, whose GSS codes changed", () => {
    // The regression test for the upstream fix. Both publish a live page; both were
    // flagged absent because the registry looked up only the current code.
    for (const [name, gss] of [["Sheffield", "E08000039"], ["Barnsley", "E08000038"]]) {
      const coverage = getUkPlacesRecord(gss)!.coverage.ukdemographics;
      expect(coverage.hasPage, `${name} lost its demographics cross-link again`).toBe(true);
    }
  });

  it("claims demographics coverage only for England and Wales", () => {
    // UK Demographics is built on Census 2021. A Scottish or Northern Irish area showing
    // as covered means the registry has matched the wrong record.
    const wrong = areas.filter(
      (area) =>
        getUkPlacesRecord(area.areaCode)!.coverage.ukdemographics.hasPage &&
        area.countryName !== "England" &&
        area.countryName !== "Wales"
    );
    expect(wrong.map((area) => `${area.areaName} (${area.countryName})`)).toEqual([]);
  });
});
