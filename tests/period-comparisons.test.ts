import { describe, expect, it } from "vitest";
import routeDashboard from "../src/data/live/route-dashboard.json";
import { getLikeForLikeQuarter, getYearEndingComparison } from "../src/lib/route-analytics";
import type { RouteSeriesPoint } from "../src/lib/route-data";

function seriesFor(routeId: string): RouteSeriesPoint[] {
  const family = routeDashboard.routeFamilies.find((entry) => entry.id === routeId);
  expect(family, `route family ${routeId} is missing from the payload`).toBeDefined();
  return family!.series as RouteSeriesPoint[];
}

// The sibling of period-labels.test.ts. That file guards the labels; this one guards
// the comparisons drawn beside them. The homepage previously carried "up 12.6% year on
// year" next to a figure that had been re-based onto a four-quarter window, so the card
// asserted a rise during a fall. Both helpers must refuse to compare unlike periods.
describe("trend claims compare like with like", () => {
  it("recovers the year-earlier quarter for small boat arrivals", () => {
    const card = routeDashboard.nationalCards.find((entry) => entry.id === "small_boat_arrivals");
    expect(card).toBeDefined();

    const series = seriesFor("small_boats");
    const comparison = getLikeForLikeQuarter(series, card!.value, card!.period);

    // Refusing is a valid answer, and it is the answer whenever the series cannot
    // support the comparison. The small boats series is calendar years with one
    // partial year on the end; while that partial year was "2026 (Q1 only)" a quarter
    // could be recovered from it, and once the June 2026 release made it "Q1 to Q2"
    // it could not. This test used to demand a non-null result, which quietly encoded
    // "the partial year is exactly one quarter" and broke the deploy the first time
    // that stopped being true.
    //
    // What must never happen is a comparison drawn across unlike periods, so that is
    // what is asserted: if the helper returns something, every property below has to
    // hold. If it returns null, the series must genuinely lack a single-quarter tail,
    // which is checked rather than assumed so this branch cannot become a free pass.
    const partial = series.filter((point) => point.isPartialYear);
    if (comparison === null) {
      expect(
        partial.some((point) => /Q1 only/.test(point.periodLabel ?? "")),
        "null is only acceptable when no single-quarter tail exists to compare"
      ).toBe(false);
      return;
    }

    // The recovered quarter has to be a plausible quarter, not a residual: within the
    // same order of magnitude as the quarter it is compared against, and well below the
    // four-quarter window that contains it.
    expect(comparison!.previous).toBeGreaterThan(0);
    expect(comparison!.previous).toBeLessThan(card!.value);
    expect(comparison!.current).toBeLessThan(card!.value);
    expect(comparison!.previous).toBeLessThan(comparison!.current * 10);
    expect(comparison!.currentLabel).not.toContain("only");
    expect(comparison!.previousLabel).toMatch(/^\d{4} Q1$/);
  });

  it("refuses the comparison when the headline is not a year-ending-March window", () => {
    const series = seriesFor("small_boats");

    expect(getLikeForLikeQuarter(series, 39_271, "2025")).toBeNull();
    expect(getLikeForLikeQuarter(series, 39_271, "Year ending December 2025")).toBeNull();
    expect(getLikeForLikeQuarter(series, 39_271, "As at 2026-03-31")).toBeNull();
  });

  it("refuses the comparison when the series has no single-quarter tail", () => {
    const fullYearsOnly = seriesFor("small_boats").filter((point) => !point.isPartialYear);

    expect(getLikeForLikeQuarter(fullYearsOnly, 39_271, "Year ending March 2026")).toBeNull();
  });

  it("uses the published year-ending pair where a route family provides one", () => {
    const comparison = getYearEndingComparison(seriesFor("refugee_family_reunion"));
    expect(comparison).not.toBeNull();

    expect(comparison!.currentLabel).toMatch(/^Year ending /);
    expect(comparison!.previousLabel).toMatch(/^Year ending /);
    expect(comparison!.currentLabel).not.toBe(comparison!.previousLabel);

    // Direction of travel must follow the values, not a sentence written months ago.
    const expectedDirection = comparison!.current < comparison!.previous ? "down" : "up";
    expect(comparison!.changePct < 0 ? "down" : "up").toBe(expectedDirection);
  });

  it("returns null for route families that publish no year-ending pair", () => {
    // Small boats is the live example: calendar years plus a part-year tail only.
    expect(getYearEndingComparison(seriesFor("small_boats"))).toBeNull();
  });

  it("keeps the entry-method split summing to a share the homepage can quote", () => {
    const methods = routeDashboard.illegalEntryMethodsLatestYear;
    const total = methods.reduce((sum, row) => sum + row.value, 0);
    const smallBoats = methods.find((row) => row.method === "Small boat arrivals");

    expect(total).toBeGreaterThan(0);
    expect(smallBoats).toBeDefined();

    const share = (smallBoats!.value / total) * 100;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThanOrEqual(100);
  });
});
