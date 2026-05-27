/**
 * Aggregate the Home Office immigration detention dataset for AS.
 *
 * Three Det_D sheets:
 *   Det_D01: People entering detention by nationality / sex / age / location.
 *   Det_D02: People in detention at point in time, by length of detention.
 *   Det_D03: People leaving detention by reason (bailed / removed / etc).
 *
 * 23,000 people entered detention in year ending March 2026, +7 percent
 * YoY. The output surfaces totals, length of detention distribution,
 * reasons for leaving (the key 'were they actually removed' signal),
 * and nationality breakdowns.
 *
 * Input:
 *   data/raw/uk_routes/immigration-detention-datasets-mar-2026.xlsx
 *
 * Output:
 *   src/data/live/detention.json
 *
 * Source: Home Office Immigration Statistics, year ending March 2026
 * release (21 May 2026).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const SOURCE = path.resolve("data/raw/uk_routes/immigration-detention-datasets-mar-2026.xlsx");
const OUTPUT = path.resolve("src/data/live/detention.json");

console.log(`Reading ${SOURCE}`);
const wb = xlsx.readFile(SOURCE, { raw: false });

function safeInt(v) {
  const n = parseInt(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function readRows(sheet) {
  return xlsx.utils.sheet_to_json(wb.Sheets[sheet], { range: 1, raw: false, defval: "" });
}

// ---- Det_D01: People entering detention ----
const enteringRows = readRows("Data_Det_D01");
console.log(`Det_D01 (entering): ${enteringRows.length} rows`);

const enteringByYear = {};                       // year -> total
const enteringByYearNat = {};                    // year -> nat -> count
const enteringByLocation = {};                   // location -> count (latest year only)
let latestYear = 0;
for (const row of enteringRows) {
  const year = parseInt(row.Year);
  if (!year) continue;
  if (year > latestYear) latestYear = year;
}
for (const row of enteringRows) {
  const year = parseInt(row.Year);
  const n = safeInt(row.Entering);
  if (!year || n === 0) continue;
  enteringByYear[year] = (enteringByYear[year] || 0) + n;
  const nat = String(row.Nationality || "").trim();
  if (nat) {
    if (!enteringByYearNat[year]) enteringByYearNat[year] = {};
    enteringByYearNat[year][nat] = (enteringByYearNat[year][nat] || 0) + n;
  }
  if (year === latestYear) {
    const loc = String(row["First place of detention"] || "").trim();
    if (loc) enteringByLocation[loc] = (enteringByLocation[loc] || 0) + n;
  }
}

// ---- Det_D02: People in detention (stock) ----
const stockRows = readRows("Data_Det_D02");
console.log(`Det_D02 (in detention): ${stockRows.length} rows`);

const stockByDate = {};                          // date -> total
const stockByLength = {};                        // length bucket -> count (latest snapshot only)
let latestDate = "";
for (const row of stockRows) {
  const d = String(row["Date (as at…)"] || row["Date (as at…)"] || row.Date || "").trim();
  if (d > latestDate) latestDate = d;
}
for (const row of stockRows) {
  const d = String(row["Date (as at…)"] || row.Date || "").trim();
  const n = safeInt(row.People);
  if (!d || n === 0) continue;
  stockByDate[d] = (stockByDate[d] || 0) + n;
  if (d === latestDate) {
    const len = String(row["Length of detention"] || "").trim();
    if (len) stockByLength[len] = (stockByLength[len] || 0) + n;
  }
}

// ---- Det_D03: People leaving detention by reason ----
const leavingRows = readRows("Data_Det_D03");
console.log(`Det_D03 (leaving): ${leavingRows.length} rows`);

const leavingByYear = {};                        // year -> total
const leavingByYearReason = {};                  // year -> reason -> count
const leavingByYearLength = {};                  // year -> length -> count (latest year only)
for (const row of leavingRows) {
  const year = parseInt(row.Year);
  const n = safeInt(row.Leaving);
  if (!year || n === 0) continue;
  leavingByYear[year] = (leavingByYear[year] || 0) + n;
  const reason = String(row["Reason for leaving detention"] || "").trim();
  if (reason) {
    if (!leavingByYearReason[year]) leavingByYearReason[year] = {};
    leavingByYearReason[year][reason] = (leavingByYearReason[year][reason] || 0) + n;
  }
  if (year === latestYear) {
    const len = String(row["Length of detention"] || "").trim();
    if (len) leavingByYearLength[year] = leavingByYearLength[year] || {};
    if (len) leavingByYearLength[year][len] = (leavingByYearLength[year][len] || 0) + n;
  }
}

// ---- Top nationalities entering (latest year) ----
const latestNatEntering = enteringByYearNat[latestYear] || {};
const topNationalitiesEntering = Object.entries(latestNatEntering)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 15)
  .map(([nat, count]) => ({ nationality: nat, count }));

// ---- Annual time series ----
const annualSeries = [];
const allYears = [...new Set([
  ...Object.keys(enteringByYear),
  ...Object.keys(leavingByYear),
])].map(Number).sort();

for (const year of allYears) {
  annualSeries.push({
    year,
    entering: enteringByYear[year] || 0,
    leaving: leavingByYear[year] || 0,
    leaving_by_reason: leavingByYearReason[year] || {},
  });
}

const output = {
  source: "Home Office Immigration Statistics: Immigration detention detailed datasets, year ending March 2026 release (21 May 2026). Sheets Det_D01 (entering), Det_D02 (in detention at date), Det_D03 (leaving).",
  lastUpdated: "2026-05-27",
  release_date: "2026-05-21",
  caveat: "Detention figures count separate events: a single person can enter detention more than once in a year. 'Length of detention' is the cumulative duration of the current spell only. 'Reason for leaving' is the most direct indicator of enforcement outcomes - 'Removed from the UK' is the only reason that maps to an actual departure.",
  headline: {
    entering_latest_year: enteringByYear[latestYear] || 0,
    entering_latest_year_period: `Calendar ${latestYear}`,
    leaving_latest_year: leavingByYear[latestYear] || 0,
    in_detention_latest_date: stockByDate[latestDate] || 0,
    in_detention_snapshot_date: latestDate,
  },
  annual_series: annualSeries,
  top_nationalities_entering_latest: topNationalitiesEntering,
  in_detention_by_length: stockByLength,
  entering_by_location_latest: Object.entries(enteringByLocation)
    .sort(([, a], [, b]) => b - a)
    .map(([location, count]) => ({ location, count })),
  leaving_by_reason_latest_year: leavingByYearReason[latestYear] || {},
};

writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
console.log(`\nWrote ${OUTPUT}`);
console.log(`Latest year (${latestYear}):`);
console.log(`  Entering detention:     ${enteringByYear[latestYear]?.toLocaleString() || 0}`);
console.log(`  Leaving detention:      ${leavingByYear[latestYear]?.toLocaleString() || 0}`);
console.log(`  In detention (${latestDate}): ${stockByDate[latestDate]?.toLocaleString() || 0}`);
console.log(`\nLeaving by reason (${latestYear}):`);
for (const [reason, count] of Object.entries(leavingByYearReason[latestYear] || {})
  .sort(([, a], [, b]) => b - a)) {
  console.log(`  ${reason.padEnd(50)} ${count.toLocaleString().padStart(8)}`);
}
console.log(`\nTop 10 nationalities entering (${latestYear}):`);
for (const n of topNationalitiesEntering.slice(0, 10)) {
  console.log(`  ${n.nationality.padEnd(25)} ${n.count.toLocaleString().padStart(8)}`);
}
