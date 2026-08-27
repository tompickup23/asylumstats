import { describe, expect, it } from "vitest";
import {
  getCounties,
  countyForAreaCode,
  getCountyBySlug,
  buildCountyPath
} from "../src/lib/county-directory";
import { loadLocalRouteLatest } from "../src/lib/route-data";

/**
 * These figures are the Home Office's own England totals, read from Reg_01 of
 * regional-and-local-authority-dataset-jun-2026.ods (Immigration system statistics,
 * regional and local authority data, released 27 August 2026, as at 30 June 2026).
 *
 * They are hardcoded on purpose. If a data refresh changes the underlying file, these
 * tests must fail loudly and be updated deliberately against the new publication,
 * rather than quietly tracking whatever the site happens to compute.
 */
const ENGLAND_SUPPORTED_ASYLUM = 80_947;
const ENGLAND_AFGHAN_POPULATION = 28_588;
/**
 * 140,614 is published for England. The local authority table cannot account for 40 of
 * them: it carries an "Unknown" row whose Ukraine figure is suppressed. Summing the
 * authorities therefore gives 140,574, and any page quoting this must say it excludes
 * unallocated arrivals. The shortfall was also exactly 40 at the March 2026 release,
 * which is the tell that it is the suppressed Unknown row and not drift.
 */
const ENGLAND_UKRAINE_ARRIVALS_ALLOCATED = 140_574;

const englishAreas = loadLocalRouteLatest().areas.filter((area) =>
  area.areaCode.startsWith("E")
);

describe("ceremonial county mapping", () => {
  it("places every English authority in exactly one county", () => {
    const unplaced = englishAreas.filter((area) => !countyForAreaCode(area.areaCode));
    expect(unplaced.map((a) => a.areaName)).toEqual([]);

    const placed = getCounties().reduce((total, county) => total + county.areaCount, 0);
    expect(placed).toBe(englishAreas.length);
  });

  it("assigns no authority to two counties", () => {
    const seen = new Set<string>();
    for (const county of getCounties()) {
      for (const area of county.areas) {
        expect(seen.has(area.areaCode)).toBe(false);
        seen.add(area.areaCode);
      }
    }
    expect(seen.size).toBe(englishAreas.length);
  });

  it("produces unique, non-empty county slugs", () => {
    const counties = getCounties();
    const slugs = counties.map((c) => c.countySlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const county of counties) {
      expect(county.countySlug).toMatch(/^[a-z0-9-]+$/);
      expect(county.areaCount).toBeGreaterThan(0);
    }
  });

  it("excludes Scotland, Wales and Northern Ireland, which have no county tier here", () => {
    expect(countyForAreaCode("S12000049")).toBeNull(); // Glasgow City
    expect(countyForAreaCode("W06000015")).toBeNull(); // Cardiff
  });
});

describe("reconciliation against the published England totals", () => {
  it("sums supported asylum to the published England figure exactly", () => {
    const total = getCounties().reduce((t, c) => t + c.supportedAsylum, 0);
    expect(total).toBe(ENGLAND_SUPPORTED_ASYLUM);
  });

  it("sums the Afghan programme population to the published England figure exactly", () => {
    const total = getCounties().reduce((t, c) => t + c.afghanProgrammePopulation, 0);
    expect(total).toBe(ENGLAND_AFGHAN_POPULATION);
  });

  it("sums Ukraine arrivals to the allocatable total, 40 short of the England figure", () => {
    const total = getCounties().reduce((t, c) => t + c.homesForUkraineArrivals, 0);
    expect(total).toBe(ENGLAND_UKRAINE_ARRIVALS_ALLOCATED);
  });

  it("exposes no combined total across the three measures", () => {
    // A stock and a cumulative arrivals count must never be added together. If someone
    // adds such a field, this test is the place that should stop them.
    const county = getCounties()[0] as unknown as Record<string, unknown>;
    for (const key of Object.keys(county)) {
      expect(key.toLowerCase()).not.toContain("allthreepathways");
      expect(key.toLowerCase()).not.toContain("refugeetotal");
    }
  });
});

describe("Lancashire, the worked example", () => {
  const lancashire = getCountyBySlug("lancashire");

  it("uses the ceremonial county, including the two unitaries", () => {
    expect(lancashire).not.toBeNull();
    expect(lancashire!.areaCount).toBe(14);
    const names = lancashire!.areas.map((a) => a.areaName);
    expect(names).toContain("Blackpool");
    expect(names).toContain("Blackburn with Darwen");
    expect(names).toContain("Burnley");
  });

  it("sums its members rather than carrying a separate figure", () => {
    const summed = lancashire!.areas.reduce((t, a) => t + a.supportedAsylum, 0);
    expect(lancashire!.supportedAsylum).toBe(summed);
  });

  it("rates are per 10,000 residents and plausible", () => {
    expect(lancashire!.supportedAsylumRate).toBeGreaterThan(0);
    // A county-wide support rate above 100 per 10,000, one per cent of residents, would
    // mean an arithmetic fault rather than a finding.
    expect(lancashire!.supportedAsylumRate!).toBeLessThan(100);
  });
});

describe("no impossible values anywhere", () => {
  it("keeps every county rate within a sane bound and every count non-negative", () => {
    for (const county of getCounties()) {
      expect(county.supportedAsylum).toBeGreaterThanOrEqual(0);
      expect(county.afghanProgrammePopulation).toBeGreaterThanOrEqual(0);
      expect(county.homesForUkraineArrivals).toBeGreaterThanOrEqual(0);
      if (county.supportedAsylumRate !== null) {
        expect(county.supportedAsylumRate).toBeLessThan(500);
      }
    }
  });
});

describe("counties reach the sitemap", () => {
  it("includes every county page and the index in the indexable paths", async () => {
    const { getIndexableSitePaths } = await import("../src/lib/site");
    const paths = new Set(getIndexableSitePaths());
    expect(paths.has("/places/counties/")).toBe(true);
    for (const county of getCounties()) {
      expect(paths.has(county.countyPath)).toBe(true);
    }
  });

  it("adds exactly the county pages plus the index, nothing stray", async () => {
    const { getIndexableSitePaths } = await import("../src/lib/site");
    const countyPaths = getIndexableSitePaths().filter((p) => p.startsWith("/places/counties/"));
    expect(countyPaths.length).toBe(getCounties().length + 1);
  });
});

describe("place pages link up to their county", () => {
  it("gives every English authority a county to link to, and no other country one", () => {
    const areas = loadLocalRouteLatest().areas;
    const withCounty = areas.filter((a) => countyForAreaCode(a.areaCode));
    // Every English area, and nothing outside England, which has no county tier here.
    expect(withCounty.length).toBe(englishAreas.length);
    for (const area of withCounty) {
      expect(area.areaCode.startsWith("E")).toBe(true);
    }
  });

  it("builds a county path that matches the county's own path", () => {
    for (const county of getCounties()) {
      for (const area of county.areas) {
        const name = countyForAreaCode(area.areaCode)!;
        expect(buildCountyPath(name)).toBe(county.countyPath);
      }
    }
  });
});

describe("national ranking", () => {
  it("ranks every county uniquely from 1, ordered by supported asylum", () => {
    const counties = getCounties();
    const ranks = counties.map((c) => c.nationalRank);
    expect(new Set(ranks).size).toBe(counties.length);
    expect(Math.min(...ranks)).toBe(1);
    expect(Math.max(...ranks)).toBe(counties.length);
    for (let i = 1; i < counties.length; i++) {
      expect(counties[i - 1].supportedAsylum).toBeGreaterThanOrEqual(counties[i].supportedAsylum);
    }
    for (const county of counties) {
      expect(county.countyCount).toBe(counties.length);
    }
  });
});
