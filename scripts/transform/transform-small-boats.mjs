#!/usr/bin/env node
/**
 * Transform the small boats time series into a mart.
 *
 * Two sheets in the source: SB_01 is daily arrivals from 1 January 2018, SB_02 is
 * weekly with preventions. Both are used: the daily series is what makes a like-for-like
 * year-to-date comparison possible, and the weekly one carries preventions, which the
 * daily sheet does not.
 *
 * Every period label is derived from the data and the code throws rather than defaults
 * if it cannot be. That is the guard PR #26 established after three hardcoded labels
 * shipped figures a quarter stale, and it matters more here than anywhere else on the
 * site, because this series moves every week.
 *
 *   node scripts/transform/transform-small-boats.mjs
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = resolve(ROOT, "data/raw/small_boats");
const MART_DIR = resolve(ROOT, "data/marts/small_boats");

const sourceFile = readdirSync(RAW_DIR).filter((name) => name.endsWith(".ods")).sort().pop();
if (!sourceFile) {
  throw new Error("No .ods in data/raw/small_boats. Run: npm run fetch:smallboats");
}

const book = xlsx.read(readFileSync(resolve(RAW_DIR, sourceFile)), { type: "buffer" });

/** Rows as arrays, so the header row can be located rather than assumed. */
function sheetRows(name) {
  const sheet = book.Sheets[name];
  if (!sheet) throw new Error(`Sheet ${name} missing from ${sourceFile}`);
  return xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
}

/** dd/mm/yyyy, which is what this publication uses. Returns null on anything else. */
function parseUkDate(value) {
  const match = String(value).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(+year, +month - 1, +day));
  return Number.isNaN(date.getTime()) ? null : date;
}

const toInt = (value) => {
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const iso = (date) => date.toISOString().slice(0, 10);

// Daily arrivals
const daily = [];
for (const row of sheetRows("SB_01")) {
  const date = parseUkDate(row[0]);
  if (!date) continue;
  const arrivals = toInt(row[1]);
  if (arrivals === null) continue;
  daily.push({ date: iso(date), arrivals, boats: toInt(row[2]) });
}
if (daily.length < 2000) {
  throw new Error(`Only ${daily.length} daily rows parsed; the sheet layout has changed`);
}

// Weekly, which is the only place preventions appear
const weekly = [];
for (const row of sheetRows("SB_02")) {
  const weekEnding = parseUkDate(row[0]);
  if (!weekEnding) continue;
  const arrivals = toInt(row[1]);
  if (arrivals === null) continue;
  weekly.push({
    weekEnding: iso(weekEnding),
    arrivals,
    boats: toInt(row[2]),
    migrantsPrevented: toInt(row[4]),
    eventsPrevented: toInt(row[5])
  });
}
if (!weekly.length) throw new Error("No weekly rows parsed from SB_02");

daily.sort((a, b) => a.date.localeCompare(b.date));
weekly.sort((a, b) => a.weekEnding.localeCompare(b.weekEnding));

const latestDaily = daily[daily.length - 1];
const latestWeek = weekly[weekly.length - 1];
const latestDate = new Date(`${latestDaily.date}T00:00:00Z`);
const latestYear = latestDate.getUTCFullYear();

/**
 * Year to date, cut at the same month and day in each year.
 *
 * Comparing a part-year against a whole year is the error that put an 89% collapse on
 * the homepage in PR #26. The cut-off is taken from the data, so it moves with the
 * series rather than being written down anywhere.
 */
function yearToDate(year) {
  return daily
    .filter((day) => {
      const date = new Date(`${day.date}T00:00:00Z`);
      if (date.getUTCFullYear() !== year) return false;
      return (
        date.getUTCMonth() < latestDate.getUTCMonth() ||
        (date.getUTCMonth() === latestDate.getUTCMonth() &&
          date.getUTCDate() <= latestDate.getUTCDate())
      );
    })
    .reduce((total, day) => total + day.arrivals, 0);
}

const currentYtd = yearToDate(latestYear);
const priorYtd = yearToDate(latestYear - 1);

const calendarYears = {};
for (const day of daily) {
  const year = day.date.slice(0, 4);
  calendarYears[year] = (calendarYears[year] ?? 0) + day.arrivals;
}
// The current year is incomplete; publishing it beside finished years invites the
// like-for-like error this file exists to avoid.
delete calendarYears[String(latestYear)];

const mart = {
  source: "Home Office, migrants detected crossing the English Channel in small boats",
  sourceFile,
  landing:
    "https://www.gov.uk/government/publications/migrants-detected-crossing-the-english-channel-in-small-boats",
  cadence: "weekly (Fridays)",
  coverageStart: daily[0].date,
  coverageEnd: latestDaily.date,
  latestWeekEnding: latestWeek.weekEnding,
  yearToDate: {
    // Labels derived, never written down: the guard from PR #26.
    asAt: latestDaily.date,
    year: latestYear,
    arrivals: currentYtd,
    priorYear: latestYear - 1,
    priorYearArrivals: priorYtd,
    changePct: priorYtd ? Number((((currentYtd - priorYtd) / priorYtd) * 100).toFixed(1)) : null
  },
  latestWeek,
  completeCalendarYears: calendarYears,
  weekly,
  daily
};

mkdirSync(MART_DIR, { recursive: true });
writeFileSync(resolve(MART_DIR, "small-boats.json"), `${JSON.stringify(mart, null, 2)}\n`);

console.log(`Parsed ${daily.length} daily and ${weekly.length} weekly rows from ${sourceFile}`);
console.log(`Coverage: ${mart.coverageStart} to ${mart.coverageEnd}`);
console.log(
  `Year to date ${latestYear}: ${currentYtd.toLocaleString()} against ` +
    `${priorYtd.toLocaleString()} at the same point in ${latestYear - 1} ` +
    `(${mart.yearToDate.changePct > 0 ? "+" : ""}${mart.yearToDate.changePct}%)`
);
console.log(`Wrote data/marts/small_boats/small-boats.json`);
