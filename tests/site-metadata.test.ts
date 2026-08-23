import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { getEntityProfiles } from "../src/lib/entities";
import { loadLocalRouteLatest } from "../src/lib/route-data";
import {
  DEFAULT_SOCIAL_IMAGE_PATH,
  SITE_URL,
  buildAbsoluteUrl,
  buildEntityStructuredData,
  buildPlaceStructuredData,
  buildReleaseCollectionStructuredData,
  getIndexableSitePaths,
  regionNameInSentence,
  getPublicPlaceRegions,
  normalisePageTitle
} from "../src/lib/site";

describe("site metadata helpers", () => {
  it("normalises page titles without duplicating the site name", () => {
    expect(normalisePageTitle("Routes")).toBe("Routes | asylumstats");
    expect(normalisePageTitle("Routes | asylumstats")).toBe("Routes | asylumstats");
  });

  it("builds absolute URLs on the production domain", () => {
    expect(buildAbsoluteUrl("/routes/")).toBe(`${SITE_URL}/routes/`);
  });

  it("returns unique indexable paths and excludes context-only council pages", () => {
    const paths = getIndexableSitePaths();

    expect(paths.length).toBeGreaterThan(6);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/");
    expect(paths).toContain("/places/");
    expect(paths.some((path) => path.startsWith("/places/regions/"))).toBe(true);
    expect(paths).toContain("/routes/");
    expect(paths).toContain("/entities/");
    expect(paths).toContain("/spending/");
    expect(paths).not.toContain("/hotels/");
    // /councils/ is noIndex research infrastructure and is deliberately not listed. The
    // hub used to be here while its own page carried noIndex, which asked search engines
    // to index a page telling them not to.
    expect(paths).not.toContain("/councils/");
    // Hub pages are indexable; individual noindex'd profile pages must not slip in
    expect(paths.some((path) => /^\/entities\/[^/]+/.test(path))).toBe(false);
    expect(paths.some((path) => /^\/councils\/[^/]+/.test(path))).toBe(false);
    expect(paths.some((path) => path.startsWith("/places/"))).toBe(true);
  });

  it("defaults social images to the generated PNG card", () => {
    expect(DEFAULT_SOCIAL_IMAGE_PATH).toBe("/og-card.png");
  });

  it("ships raster social card assets alongside the SVG", () => {
    expect(existsSync(new URL("../public/og-card.png", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../public/og-card.webp", import.meta.url))).toBe(true);
  });

  it("builds place structured data with area and dataset nodes", () => {
    const area = loadLocalRouteLatest().areas[0];
    const nodes = buildPlaceStructuredData(area, {
      canonicalUrl: buildAbsoluteUrl(`/places/${area.areaCode}/`),
      description: "Test description",
      socialImageUrl: buildAbsoluteUrl("/og-card.png"),
      snapshotDate: area.snapshotDate,
      areaRank: 1,
      contingencyRank: 2,
      namedSiteCount: 3,
      unnamedSiteCount: 1
    });

    expect(nodes).toHaveLength(3);
    expect(nodes[1]["@type"]).toBe("AdministrativeArea");
    expect(nodes[2]["@type"]).toBe("Dataset");
  });

  it("builds release collection structured data with an item list", () => {
    const nodes = buildReleaseCollectionStructuredData(
      [
        {
          date: "2026-02-26",
          title: "National asylum statistics updated",
          summary: "Year ending December 2025 figures published.",
          sourceUrl: "https://www.gov.uk/example"
        }
      ],
      {
        canonicalUrl: buildAbsoluteUrl("/releases/"),
        description: "Release diary",
        socialImageUrl: buildAbsoluteUrl("/og-card.png")
      }
    );

    expect(nodes).toHaveLength(3);
    expect(nodes[1]["@type"]).toBe("CollectionPage");
    expect(nodes[2]["@type"]).toBe("ItemList");
  });

  it("builds entity structured data with profile and organization nodes", () => {
    const entity = getEntityProfiles()[0]!;
    const nodes = buildEntityStructuredData(entity, {
      canonicalUrl: buildAbsoluteUrl(`/entities/${entity.entityId}/`),
      description: "Entity profile",
      socialImageUrl: buildAbsoluteUrl("/og-card.png"),
      snapshotDate: "2025-12-31"
    });

    expect(nodes).toHaveLength(3);
    expect(nodes[1]["@type"]).toBe("ProfilePage");
    expect(nodes[2]["@type"]).toBe("Organization");
  });
});

describe("region names in a sentence", () => {
  it("adds the definite article only where the name needs one", () => {
    expect(regionNameInSentence("North West")).toBe("the North West");
    expect(regionNameInSentence("East of England")).toBe("the East of England");
    expect(regionNameInSentence("London")).toBe("London");
    expect(regionNameInSentence("Scotland")).toBe("Scotland");
    expect(regionNameInSentence("Wales")).toBe("Wales");
    expect(regionNameInSentence("Northern Ireland")).toBe("Northern Ireland");
  });

  it("does not double the article on Yorkshire and The Humber", () => {
    // The name carries its own "The". Prefixing another produced
    // "Asylum seekers in the Yorkshire and The Humber" in a live page title.
    expect(regionNameInSentence("Yorkshire and The Humber")).toBe("Yorkshire and The Humber");
  });

  it("covers every region the site actually builds", () => {
    // A region added later must be considered deliberately, not silently default to no
    // article. This asserts the helper has an opinion about each live region name.
    for (const region of getPublicPlaceRegions()) {
      const rendered = regionNameInSentence(region.regionName);
      expect(rendered.endsWith(region.regionName)).toBe(true);
      expect(rendered.startsWith("the the")).toBe(false);
    }
  });
});
