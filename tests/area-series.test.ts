import { describe, expect, it } from "vitest";
import { getAreaTrendSummary, loadAreaSeries } from "../src/lib/area-series";

describe("area series helpers", () => {
  it("loads the mock area series dataset", () => {
    const points = loadAreaSeries();

    expect(points.length).toBeGreaterThan(0);
    expect(points[0]).toHaveProperty("areaCode");
    expect(points[0]).toHaveProperty("periodEnd");
    expect(points[0]).toHaveProperty("value");
  });

  it("builds a trend summary with current and previous deltas", () => {
    const summary = getAreaTrendSummary("E08000025");

    expect(summary).not.toBeNull();
    expect(summary?.areaName).toBe("Birmingham");
    expect(summary?.points).toHaveLength(4);
    expect(summary?.latestValue).toBe(2832);
    expect(summary?.deltaFromPrevious).toBe(77);
    expect(summary?.changePctFromPrevious).toBe(2.8);
    expect(summary?.officialAnchorCount).toBe(3);
    expect(summary?.hasIllustrativeData).toBe(true);
  });

  it("returns null when a place has no trend series", () => {
    expect(getAreaTrendSummary("NO_SERIES")).toBeNull();
  });
});
