import { describe, expect, it } from "vitest";
import type { LocalRouteAreaSummary, RouteSeriesPoint } from "../src/lib/route-data";
import routeDashboard from "../src/data/live/route-dashboard.json";
import {
  formatOrdinal,
  getDistributionStats,
  getPercentileRank,
  getRegionPressureSummaries,
  getSeriesDelta
} from "../src/lib/route-analytics";

function makeArea(overrides: Partial<LocalRouteAreaSummary>): LocalRouteAreaSummary {
  return {
    areaCode: "A1",
    areaName: "Alpha",
    regionName: "North West",
    countryName: "England",
    population: 100000,
    homesForUkraineArrivals: 10,
    homesForUkraineRate: 1,
    afghanProgrammePopulation: 5,
    afghanProgrammeRate: 0.5,
    afghanProgrammeLaHousing: 2,
    afghanProgrammePrsHousing: 1,
    supportedAsylum: 100,
    supportedAsylumRate: 10,
    contingencyAccommodation: 20,
    contingencyAccommodationRate: 2,
    initialAccommodation: 5,
    dispersalAccommodation: 75,
    subsistenceOnly: 20,
    allThreePathwaysTotal: 115,
    shareOfPopulationPct: 0.12,
    snapshotDate: "2025-12-31",
    resettlementCumulativeTotal: 15,
    afghanResettlementCumulative: 5,
    ukResettlementFamilyCumulative: 9,
    communitySponsorshipCumulative: 1,
    resettlementLatestYearTotal: 3,
    latestResettlementQuarterLabel: "Q4 2025",
    latestResettlementQuarterValue: 1,
    ...overrides
  };
}

describe("route analytics helpers", () => {
  it("aggregates regional pressure summaries and sorts them by supported asylum", () => {
    const areas = [
      makeArea({
        areaCode: "A1",
        areaName: "Alpha",
        regionName: "North West",
        supportedAsylum: 120,
        contingencyAccommodation: 30,
        allThreePathwaysTotal: 150,
        population: 100000
      }),
      makeArea({
        areaCode: "A2",
        areaName: "Beta",
        regionName: "North West",
        supportedAsylum: 80,
        contingencyAccommodation: 10,
        allThreePathwaysTotal: 100,
        population: 50000
      }),
      makeArea({
        areaCode: "A3",
        areaName: "Gamma",
        regionName: "London",
        supportedAsylum: 150,
        contingencyAccommodation: 40,
        allThreePathwaysTotal: 175,
        population: 200000
      })
    ];

    const summaries = getRegionPressureSummaries(areas);

    expect(summaries).toHaveLength(2);
    expect(summaries[0].regionName).toBe("North West");
    expect(summaries[0].supportedAsylum).toBe(200);
    expect(summaries[0].contingencyAccommodation).toBe(40);
    expect(summaries[0].areaCount).toBe(2);
    expect(summaries[0].supportedAsylumRate).toBeCloseTo(13.33, 2);
    expect(summaries[0].shareOfPopulationPct).toBeCloseTo(0.17, 2);
    expect(summaries[1].regionName).toBe("London");
  });

  it("calculates distribution statistics for benchmark strips", () => {
    const stats = getDistributionStats([10, 20, 30, 40, 50]);

    expect(stats.min).toBe(10);
    expect(stats.median).toBe(30);
    expect(stats.upperQuartile).toBe(40);
    expect(stats.p90).toBeCloseTo(46, 5);
    expect(stats.max).toBe(50);
  });

  it("returns percentile ranks based on values at or below the target", () => {
    expect(getPercentileRank([10, 20, 30, 40], 25)).toBe(50);
    expect(getPercentileRank([10, 20, 30, 40], 40)).toBe(100);
  });

  it("formats ordinals correctly for percentile copy", () => {
    expect(formatOrdinal(1)).toBe("1st");
    expect(formatOrdinal(2)).toBe("2nd");
    expect(formatOrdinal(3)).toBe("3rd");
    expect(formatOrdinal(4)).toBe("4th");
    expect(formatOrdinal(11)).toBe("11th");
    expect(formatOrdinal(12)).toBe("12th");
    expect(formatOrdinal(13)).toBe("13th");
    expect(formatOrdinal(21)).toBe("21st");
    expect(formatOrdinal(32)).toBe("32nd");
    expect(formatOrdinal(83)).toBe("83rd");
    expect(formatOrdinal(100)).toBe("100th");
  });

  it("calculates the last observed delta in a route series", () => {
    const points: RouteSeriesPoint[] = [
      { periodLabel: "2023", periodEnd: "2023-12-31", value: 1200 },
      { periodLabel: "2024", periodEnd: "2024-12-31", value: 1400 },
      { periodLabel: "2025", periodEnd: "2025-12-31", value: 1325 }
    ];

    expect(getSeriesDelta(points)).toBe(-75);
  });
});

/**
 * Asylum return rate, from the Asy_D04 outcome cohorts.
 *
 * Two things here have already gone wrong once and must not go wrong silently again.
 *
 * The denominator. Returns include people who withdrew, not only people refused: the
 * 2022 Albania returns were overwhelmingly withdrawals. Measured against refusals alone
 * that cohort returns 179% of the people it refused, which is impossible and was the
 * first version of this analysis. The denominator is refusals plus withdrawals.
 *
 * The comparison. The Home Office states this dataset "is not comparable over time"
 * because recent cohorts are still accruing returns. Ranking a 2024 cohort against a
 * 2010 one is precisely that error, so settled and unsettled cohorts are separated in
 * the data rather than left to the page to remember.
 */
describe("asylum return rate cohorts", () => {
  const cohorts = (routeDashboard as any).nationalSystemDynamics.outcomeCohorts as Array<{
    claimYear: string;
    returnsCount: number;
    enforcedReturns: number;
    voluntaryReturns: number;
    returnableOutcomeCount: number;
    latestRefusalCount: number;
    latestWithdrawalCount: number;
    returnRatePct: number | null;
    cohortAgeYears: number;
    returnsSettled: boolean;
    totalClaims: number;
  }>;

  it("uses refusals plus withdrawals as the denominator, never refusals alone", () => {
    for (const cohort of cohorts) {
      expect(cohort.returnableOutcomeCount).toBe(
        cohort.latestRefusalCount + cohort.latestWithdrawalCount
      );
    }
  });

  it("keeps every cohort's return rate at or below 100%", () => {
    // The guard against the denominator regressing to refusals-only: that produced
    // Albania 2022 at 179%.
    for (const cohort of cohorts) {
      if (cohort.returnRatePct === null) continue;
      expect(cohort.returnRatePct, `${cohort.claimYear} exceeds 100%`).toBeLessThanOrEqual(100);
    }
  });

  it("totals enforced and voluntary into the returns count", () => {
    for (const cohort of cohorts) {
      expect(cohort.returnsCount).toBe(cohort.enforcedReturns + cohort.voluntaryReturns);
    }
  });

  it("marks cohorts settled only after enough years have elapsed", () => {
    for (const cohort of cohorts) {
      expect(cohort.returnsSettled).toBe(cohort.cohortAgeYears >= 8);
    }
    const settled = cohorts.filter((c) => c.returnsSettled).map((c) => Number(c.claimYear));
    const unsettled = cohorts.filter((c) => !c.returnsSettled).map((c) => Number(c.claimYear));
    // Measured against the previous edition: 2018 moved 0.26pp in a quarter, 2019 moved
    // 0.67pp. The boundary sits between them.
    expect(Math.max(...settled)).toBe(2018);
    expect(Math.min(...unsettled)).toBe(2019);
  });

  it("shows the halving that the settled cohorts actually support", () => {
    const sum = (years: number[]) =>
      cohorts
        .filter((c) => years.includes(Number(c.claimYear)))
        .reduce(
          (acc, c) => ({
            r: acc.r + c.returnsCount,
            d: acc.d + c.returnableOutcomeCount
          }),
          { r: 0, d: 0 }
        );
    const early = sum([2007, 2008, 2009, 2010, 2011, 2012, 2013]);
    const late = sum([2015, 2016, 2017, 2018]);
    // The early cohorts are closed and their rate is settled, so it is pinned.
    // The 2015 to 2018 cohorts are not: people are still being returned against those
    // claim years, so the rate creeps up with every release. It read 26.2 against the
    // March 2026 data and 26.4 against June 2026, which is the series working, not a
    // regression. Pinning it to one decimal place broke the deploy on release day.
    // The finding this guards is the gap between the two, so that is what is asserted.
    const earlyRate = Math.round((early.r / early.d) * 1000) / 10;
    const lateRate = Math.round((late.r / late.d) * 1000) / 10;
    expect(earlyRate).toBe(55.3);
    expect(lateRate).toBeGreaterThan(20);
    expect(lateRate).toBeLessThan(35);
    expect(earlyRate - lateRate).toBeGreaterThan(20);
  });
});
