import { describe, expect, it } from "vitest";
import { getAreaTrendSummary, loadAreaSeries } from "../src/lib/area-series";
import localRouteLatest from "../src/data/live/local-route-latest.json";

// These tests check the shape of the series and that it agrees with the Home Office's
// own local authority table. They pin no values, so a new quarterly release does not
// fail them; a broken ingest does.
describe("area series helpers", () => {
  it("loads the live area series dataset", () => {
    const points = loadAreaSeries();

    expect(points.length).toBeGreaterThan(10000);
    expect(points[0]).toHaveProperty("areaCode");
    expect(points[0]).toHaveProperty("periodEnd");
    expect(points[0]).toHaveProperty("value");
  });

  it("builds an official quarterly trend summary with current and previous deltas", () => {
    const summary = getAreaTrendSummary("E08000025");

    expect(summary).not.toBeNull();
    expect(summary?.areaName).toBe("Birmingham");
    expect(summary?.points.length).toBeGreaterThan(40);

    const points = summary!.points;
    const periods = points.map((point) => point.periodEnd);
    expect(periods).toEqual([...periods].sort());
    expect(new Set(periods).size).toBe(periods.length);

    const latest = points[points.length - 1];
    const previous = points[points.length - 2];
    expect(summary?.latestValue).toBe(latest.value);
    expect(summary?.deltaFromPrevious).toBe(latest.value - previous.value);
    expect(summary?.changePctFromPrevious).toBeCloseTo(
      ((latest.value - previous.value) / previous.value) * 100,
      1
    );
    expect(summary?.officialAnchorCount).toBe(summary?.points.length);
    expect(summary?.hasIllustrativeData).toBe(false);
  });

  it("agrees with the Home Office local authority table at its snapshot date", () => {
    // Two separate ingests: the area series comes from the NWRSMP workbooks, the
    // route table from the Home Office regional and local authority dataset.
    const series = new Map(
      loadAreaSeries().map((point) => [`${point.areaCode}|${point.periodEnd}`, point.value])
    );
    const snapshot = localRouteLatest.snapshotDate;
    const compared = localRouteLatest.areas.filter((area) =>
      series.has(`${area.areaCode}|${snapshot}`)
    );
    const disagreements = compared
      .filter((area) => series.get(`${area.areaCode}|${snapshot}`) !== area.supportedAsylum)
      .map((area) => `${area.areaName}: ${series.get(`${area.areaCode}|${snapshot}`)} vs ${area.supportedAsylum}`);

    // The NWRSMP workbook can lag a Home Office release by a quarter; when it does
    // there is nothing to compare at the snapshot date, so the check waits for the
    // next workbook rather than failing.
    if (compared.length > 0) {
      expect(compared.length).toBeGreaterThan(300);
    }
    expect(disagreements).toEqual([]);
  });

  it("returns null when a place has no trend series", () => {
    expect(getAreaTrendSummary("NO_SERIES")).toBeNull();
  });
});
