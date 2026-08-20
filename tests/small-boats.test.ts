import { describe, expect, it } from "vitest";
import smallBoats from "../src/data/live/small-boats.json";

/**
 * The small boats series is the most newsworthy number on the site and the one that
 * goes stale fastest: the Home Office publishes weekly, on Fridays. Before this ingest
 * the freshest figure here was 4,441 for the quarter to 31 March, four and a half
 * months behind.
 *
 * These tests guard the two things that have actually gone wrong on this site. First,
 * period labels that were written down rather than derived, which put an 89% collapse
 * on the homepage in PR #26. Second, a part-year total compared against a whole year,
 * which is the same error wearing a different hat.
 */
const data = smallBoats as {
  coverageStart: string;
  coverageEnd: string;
  latestWeekEnding: string;
  yearToDate: {
    asAt: string;
    year: number;
    arrivals: number;
    priorYear: number;
    priorYearArrivals: number;
    changePct: number | null;
  };
  latestWeek: { weekEnding: string; arrivals: number };
  completeCalendarYears: Record<string, number>;
  weekly: Array<{ weekEnding: string; arrivals: number }>;
  daily: Array<{ date: string; arrivals: number }>;
};

describe("small boats series", () => {
  it("covers the full published range from 2018", () => {
    expect(data.coverageStart).toBe("2018-01-01");
    expect(data.daily.length).toBeGreaterThan(3000);
  });

  it("stamps the year-to-date figure with the date it was cut at", () => {
    // Not a hardcoded date: it must equal the last day actually present in the series.
    expect(data.yearToDate.asAt).toBe(data.coverageEnd);
    expect(data.yearToDate.asAt).toBe(data.daily[data.daily.length - 1].date);
  });

  it("compares like with like across years", () => {
    // The comparison is only meaningful if both totals are cut at the same month and
    // day. Recompute independently and check the transform agrees.
    const cut = data.yearToDate.asAt.slice(5); // MM-DD
    const sumTo = (year: number) =>
      data.daily
        .filter((day) => day.date.startsWith(`${year}-`) && day.date.slice(5) <= cut)
        .reduce((total, day) => total + day.arrivals, 0);

    expect(sumTo(data.yearToDate.year)).toBe(data.yearToDate.arrivals);
    expect(sumTo(data.yearToDate.priorYear)).toBe(data.yearToDate.priorYearArrivals);
  });

  it("states a change consistent with the two totals it compares", () => {
    const { arrivals, priorYearArrivals, changePct } = data.yearToDate;
    const expected = Number((((arrivals - priorYearArrivals) / priorYearArrivals) * 100).toFixed(1));
    expect(changePct).toBe(expected);
  });

  it("excludes the running year from the complete-calendar-year totals", () => {
    // Publishing an incomplete year beside finished ones is exactly how a part-year
    // figure gets read as a collapse.
    expect(Object.keys(data.completeCalendarYears)).not.toContain(String(data.yearToDate.year));
    expect(data.completeCalendarYears["2025"]).toBe(41_472);
  });

  it("takes the latest week from the weekly sheet, not the daily one", () => {
    // The weekly sheet is the only place preventions appear, and it can lag the daily
    // sheet by a few days, so the two must not be conflated.
    expect(data.latestWeek.weekEnding).toBe(data.latestWeekEnding);
    expect(data.latestWeekEnding).toBe(data.weekly[data.weekly.length - 1].weekEnding);
    expect(data.latestWeekEnding <= data.coverageEnd).toBe(true);
  });
});
