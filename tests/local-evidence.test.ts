import { describe, expect, it } from "vitest";
import {
  getCurrentLocalEvidencePoints,
  getFeaturedLocalEvidencePoints,
  getRegionLocalEvidenceLayers
} from "../src/lib/local-evidence";

describe("local evidence layer", () => {
  it("builds current named local evidence points with region and place links", () => {
    const points = getCurrentLocalEvidencePoints();

    expect(points.length).toBeGreaterThan(0);
    expect(points.every((point) => point.regionHref.startsWith("/places/regions/"))).toBe(true);
    expect(points.some((point) => point.placeHref === "/places/E06000062/")).toBe(true);
  });

  it("groups current named sites by region for the lower-level evidence layer", () => {
    const eastMidlands = getRegionLocalEvidenceLayers().find((layer) => layer.regionName === "East Midlands");

    expect(eastMidlands?.currentNamedSiteCount).toBe(3);
    expect(eastMidlands?.uniqueAreaCount).toBe(1);
    expect(eastMidlands?.points.every((point) => point.regionName === "East Midlands")).toBe(true);
  });

  it("features one lead local evidence point per visible region", () => {
    const featured = getFeaturedLocalEvidencePoints();

    expect(featured.length).toBeGreaterThan(0);
    expect(new Set(featured.map((point) => point.regionName)).size).toBe(featured.length);
  });
});
