import { describe, expect, it } from "vitest";
import smallBoats from "../src/data/live/small-boats.json";
import { smallBoats as smallBoatsHeadline, smallBoatsRunningTotals } from "../src/lib/headline-figures";
import { getExplainers } from "../src/lib/explainers";

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

/**
 * The running total chart on the small boats explainer (R182). Its last two points are
 * the headline year to date figures, so the chart and the answer above it can never
 * print different numbers; the rest of the shape follows from a running total read every
 * seven days.
 */
describe("small boats running totals", () => {
  const points = smallBoatsRunningTotals();
  const headline = smallBoatsHeadline();

  it("ends on the latest day in the series, at the published year to date figures", () => {
    const last = points.at(-1)!;
    expect(last.date).toBe(data.coverageEnd);
    expect(last.current).toBe(data.yearToDate.arrivals);
    expect(last.prior).toBe(data.yearToDate.priorYearArrivals);
  });

  it("is read every seven days within the current year, and never falls", () => {
    expect(points[0].date.startsWith(`${data.yearToDate.year}-01-`)).toBe(true);
    for (let i = 1; i < points.length; i += 1) {
      const gap = (Date.parse(points[i].date) - Date.parse(points[i - 1].date)) / 86_400_000;
      expect(gap).toBe(7);
      expect(points[i].current).toBeGreaterThanOrEqual(points[i - 1].current);
      expect(points[i].prior).toBeGreaterThanOrEqual(points[i - 1].prior);
    }
  });

  it("counts boats over the same days as people, and fewer boats than people", () => {
    const cut = data.coverageEnd.slice(5);
    const daily = data.daily as Array<{ date: string; arrivals: number; boats: number }>;
    const boatsTo = (year: number) =>
      daily.filter((day) => day.date.startsWith(`${year}-`) && day.date.slice(5) <= cut).reduce((sum, day) => sum + day.boats, 0);
    expect(headline.boats).toBe(boatsTo(data.yearToDate.year));
    expect(headline.priorYearBoats).toBe(boatsTo(data.yearToDate.priorYear));
    expect(headline.boats).toBeLessThan(headline.arrivals);
    expect(headline.priorYearBoats).toBeLessThan(headline.priorYearArrivals);
  });

  it("draws the explainer's answer chart from these points, dated in its title", () => {
    const explainer = getExplainers().find((entry) => entry.slug === "how-many-small-boats-have-crossed-this-year")!;
    const chart = explainer.answerChart!;
    expect(chart.points.map((point) => point.value)).toEqual(points.map((point) => point.current));
    expect(chart.comparison!.points.map((point) => point.value)).toEqual(points.map((point) => point.prior));
    const dayMonth = new Date(`${data.coverageEnd}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
    expect(chart.title).toContain(`to ${dayMonth}`);
  });
});
