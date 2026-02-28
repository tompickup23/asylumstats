import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { loadLocalRouteLatest } from "../src/lib/route-data";
import {
  DEFAULT_SOCIAL_IMAGE_PATH,
  SITE_URL,
  buildAbsoluteUrl,
  buildPlaceStructuredData,
  buildReleaseCollectionStructuredData,
  getIndexableSitePaths,
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

    expect(paths.length).toBeGreaterThan(8);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/");
    expect(paths).toContain("/routes/");
    expect(paths.some((path) => path.startsWith("/places/"))).toBe(true);
    expect(paths).not.toContain("/councils/");
    expect(paths.some((path) => path.startsWith("/councils/"))).toBe(false);
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
});
