/**
 * Headline figures that appear on more than one surface: the homepage cards, the
 * /explained/ pages and their social cards.
 *
 * Each has exactly one implementation here, for the reason the shared-figure guard gives
 * (tests/shared-figure-sources.test.ts): the homepage used to compute its grant rate
 * inline, dividing grants by every initial decision including withdrawals, and published
 * 31.5% as "Initial grant rate" beside a Home Office figure of 38% for the same year.
 */
import { loadRouteDashboard, type RouteSeriesPoint } from "./route-data";
import smallBoatsData from "../data/live/small-boats.json";
import ukRoutesManifest from "../../data/raw/manifests/uk_routes.json";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-06-30" -> "30 June 2026". Throws on a missing date rather than printing a blank. */
export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) throw new Error("formatLongDate: missing date");
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

/** Throws on a missing value: a page printing "0" for a figure it could not find is worse than a failed build. */
export function fmtInt(value: number | null | undefined): string {
  if (value === null || value === undefined) throw new Error("fmtInt: missing value");
  return Math.round(value).toLocaleString("en-GB");
}

/** The Home Office quarterly release every route-driven figure comes from. */
export function routesRelease(): { publishedDate: string | null; nextEditionDueBy: string | null } {
  const manifest = ukRoutesManifest as { releaseDate?: string; nextEdition?: string };
  return {
    publishedDate: manifest.releaseDate && ISO_DATE.test(manifest.releaseDate) ? manifest.releaseDate : null,
    nextEditionDueBy: manifest.nextEdition && ISO_DATE.test(manifest.nextEdition) ? manifest.nextEdition : null
  };
}

export interface GrantRate {
  pct: number;
  grants: number;
  refusals: number;
  windowLabel: string;
  /** The same four quarters one year earlier, when published. */
  previousPct: number | null;
}

function sumWindow(series: RouteSeriesPoint[], end: number): number | null {
  const window = series.slice(Math.max(0, end - 4), end);
  return window.length === 4 ? window.reduce((total, point) => total + point.value, 0) : null;
}

/**
 * The grant rate at initial decision on the Home Office's own basis: main applicants only,
 * grants over grants plus refusals, withdrawals and administrative outcomes excluded,
 * across the latest four published quarters.
 */
export function initialGrantRate(): GrantRate | null {
  const flow = loadRouteDashboard().nationalSystemDynamics.flowSeries;
  const grantsSeries = flow.mainApplicantGrants ?? [];
  const refusalsSeries = flow.mainApplicantRefusals ?? [];
  const end = grantsSeries.length;
  if (end < 4 || refusalsSeries.length !== end) return null;

  const rateAt = (at: number) => {
    const grants = sumWindow(grantsSeries, at);
    const refusals = sumWindow(refusalsSeries, at);
    return grants === null || refusals === null || grants + refusals === 0
      ? null
      : { grants, refusals, pct: Number(((grants / (grants + refusals)) * 100).toFixed(1)) };
  };

  const latest = rateAt(end);
  if (!latest) return null;
  return {
    ...latest,
    windowLabel: `${grantsSeries[end - 4].periodLabel} to ${grantsSeries[end - 1].periodLabel}`,
    previousPct: rateAt(end - 4)?.pct ?? null
  };
}

/** Year ending grant rates on the same basis, for a chart. One point per June quarter end. */
export function grantRateSeries(): Array<{ label: string; value: number }> {
  const flow = loadRouteDashboard().nationalSystemDynamics.flowSeries;
  const grants = flow.mainApplicantGrants ?? [];
  const refusals = flow.mainApplicantRefusals ?? [];
  const points: Array<{ label: string; value: number }> = [];
  for (let end = grants.length; end >= 4; end -= 4) {
    const g = sumWindow(grants, end);
    const r = sumWindow(refusals, end);
    if (g === null || r === null || g + r === 0) break;
    const year = grants[end - 1].periodLabel.slice(0, 4);
    points.unshift({ label: `YE Jun ${year}`, value: Number(((g / (g + r)) * 100).toFixed(1)) });
  }
  return points;
}

export interface SmallBoats {
  asAt: string;
  /** The day the time series file was published, read from its name ("25_September_2026_..."). */
  published: string;
  year: number;
  arrivals: number;
  priorYear: number;
  priorYearArrivals: number;
  changePct: number | null;
  latestWeek: { weekEnding: string; arrivals: number; boats: number; migrantsPrevented: number | null; eventsPrevented: number | null };
  completeCalendarYears: Record<string, number>;
  sourceUrl: string;
  cadence: string;
  /** Boats detected arriving over the same days as `arrivals`, from the daily series. */
  boats: number;
  priorYearBoats: number;
}

/**
 * A year's daily small boats series added up from 1 January to a month and day ("11-12"),
 * the cut the transform uses for the year to date (scripts/transform/transform-small-boats.mjs).
 */
function smallBoatsTotalTo(field: "arrivals" | "boats", year: number, monthDay: string): number {
  return smallBoatsData.daily.reduce(
    (sum, day) => (day.date.startsWith(`${year}-`) && day.date.slice(5) <= monthDay ? sum + day[field] : sum),
    0
  );
}

/** Year-to-date small boat arrivals against the same point last year. */
export function smallBoats(): SmallBoats {
  const data = smallBoatsData as typeof smallBoatsData & { yearToDate: { changePct: number | null } };
  const named = /^(\d{1,2})_([A-Za-z]+)_(\d{4})_/.exec(data.sourceFile);
  const parsed = named ? new Date(`${named[1]} ${named[2]} ${named[3]} UTC`) : null;
  const published = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : data.coverageEnd;
  const cut = data.coverageEnd.slice(5);
  return {
    asAt: data.coverageEnd,
    published,
    year: data.yearToDate.year,
    arrivals: data.yearToDate.arrivals,
    priorYear: data.yearToDate.priorYear,
    priorYearArrivals: data.yearToDate.priorYearArrivals,
    boats: smallBoatsTotalTo("boats", data.yearToDate.year, cut),
    priorYearBoats: smallBoatsTotalTo("boats", data.yearToDate.priorYear, cut),
    changePct: data.yearToDate.changePct,
    latestWeek: data.latestWeek,
    completeCalendarYears: data.completeCalendarYears,
    sourceUrl: data.landing,
    cadence: data.cadence
  };
}

export interface RunningTotalPoint {
  /** ISO date in the current year. */
  date: string;
  /** Arrivals from 1 January to this month and day, current year. */
  current: number;
  /** The same, in the year before. */
  prior: number;
}

/**
 * Small boat arrivals added up from 1 January, in this year and the last, read every seven
 * days back from the latest day in the series, so the last point is that day. The prior
 * year is cut at the same month and day, by the rule the transform uses for the year to
 * date figure (scripts/transform/transform-small-boats.mjs), so the two final points are
 * exactly `arrivals` and `priorYearArrivals`; tests/small-boats.test.ts holds them equal.
 */
export function smallBoatsRunningTotals(): RunningTotalPoint[] {
  const { yearToDate, coverageEnd } = smallBoatsData;
  const points: RunningTotalPoint[] = [];
  const end = new Date(`${coverageEnd}T00:00:00Z`);
  for (let at = end; at.getUTCFullYear() === yearToDate.year; at = new Date(at.getTime() - 7 * 86_400_000)) {
    const date = at.toISOString().slice(0, 10);
    points.unshift({
      date,
      current: smallBoatsTotalTo("arrivals", yearToDate.year, date.slice(5)),
      prior: smallBoatsTotalTo("arrivals", yearToDate.priorYear, date.slice(5))
    });
  }
  return points;
}
