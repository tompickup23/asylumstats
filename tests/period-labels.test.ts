import { describe, expect, it } from "vitest";
import localRouteLatest from "../src/data/live/local-route-latest.json";
import routeDashboard from "../src/data/live/route-dashboard.json";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BARE_YEAR = /^\d{4}$/;

// These guard a class of bug rather than a single figure: a period label that
// does not describe the data underneath it. The YE March 2026 build shipped one
// quarter of small boat arrivals labelled "2026", which read as an 89% fall, and
// stamped March 2026 local authority data as "2025-12-31" on every area page.
describe("published period labels describe their own coverage", () => {
  it("stamps the local snapshot from the source release, consistently everywhere", () => {
    const snapshotDate = localRouteLatest.snapshotDate;

    expect(snapshotDate).toMatch(ISO_DATE);
    expect(routeDashboard.localSnapshotDate).toBe(snapshotDate);

    // Every area carries the same stamp; a per-area drift means one code path
    // is still hardcoding a date.
    const areaStamps = new Set(localRouteLatest.areas.map((area) => area.snapshotDate));
    expect([...areaStamps]).toEqual([snapshotDate]);
  });

  it("points every 'As at' national card at that same snapshot date", () => {
    const asAtCards = routeDashboard.nationalCards.filter((card) =>
      card.period.startsWith("As at")
    );

    expect(asAtCards.length).toBeGreaterThan(0);
    for (const card of asAtCards) {
      expect(card.period).toBe(`As at ${localRouteLatest.snapshotDate}`);
    }
  });

  it("flags partial years in route series and never labels them as a bare year", () => {
    const partialPoints = routeDashboard.routeFamilies.flatMap((family) =>
      family.series
        .filter((point) => (point as { isPartialYear?: boolean }).isPartialYear)
        .map((point) => ({ family: family.id, ...point }))
    );

    // The current release always has an incomplete trailing calendar year.
    expect(partialPoints.length).toBeGreaterThan(0);

    for (const point of partialPoints) {
      expect(point.periodLabel).not.toMatch(BARE_YEAR);
      expect(point.periodLabel).toContain("only");
    }
  });

  it("headlines small boat arrivals on a complete period, not a part-year", () => {
    const card = routeDashboard.nationalCards.find((entry) => entry.id === "small_boat_arrivals");
    expect(card).toBeDefined();

    // Either a full four-quarter window or a genuinely complete calendar year.
    expect(card!.period).toMatch(/^(Year ending \w+ \d{4}|\d{4})$/);

    const smallBoats = routeDashboard.routeFamilies.find((family) => family.id === "small_boats");
    const partialTail = smallBoats!.series.filter(
      (point) => (point as { isPartialYear?: boolean }).isPartialYear
    );

    // A four-quarter total cannot be smaller than any single partial year inside
    // it. This is what failed before: the card reported one quarter, 4,441.
    for (const point of partialTail) {
      expect(card!.value).toBeGreaterThan(point.value);
    }
  });

  it("derives the entry-method split from the same window as the headline card", () => {
    const card = routeDashboard.nationalCards.find((entry) => entry.id === "small_boat_arrivals");
    const methods = routeDashboard.illegalEntryMethodsLatestYear;

    expect(routeDashboard.illegalEntryMethodsPeriodLabel).toBe(card!.period);

    const smallBoatRow = methods.find((row) => row.method === "Small boat arrivals");
    expect(smallBoatRow!.value).toBe(card!.value);
  });
});
