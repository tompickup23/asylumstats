import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import xlsx from "xlsx";
import { parseCsv } from "../lib/csv-parser.mjs";
import { buildAppealsBlock } from "../lib/tribunal-appeals.mjs";

const rawDir = path.resolve("data/raw/moj_tribunals");
const canonicalDir = path.resolve("data/canonical/moj_tribunals");
const martsDir = path.resolve("data/marts/moj_tribunals");
const liveDir = path.resolve("src/data/live");

// Read from the manifest the fetcher wrote, never named here. This block used to restate the
// release and open the ODS by its Q4 2025/26 filename, so on 10 September the fetcher would
// have pulled April to June and this file would have failed to find it, or silently
// re-transformed the previous quarter on a machine that still had the old file on disk.
const fetchManifest = JSON.parse(
  readFileSync(path.resolve("data/raw/manifests/moj_tribunals.json"), "utf8")
);

function manifestFile(role, pattern) {
  const entry = fetchManifest.files?.find((file) => pattern.test(file.fileName));
  if (!entry) {
    throw new Error(
      `No ${role} file in data/raw/manifests/moj_tribunals.json. Files listed: ` +
        (fetchManifest.files ?? []).map((file) => file.fileName).join(", ") +
        ". Run `npm run fetch:tribunals` first; this transform will not guess a filename."
    );
  }
  return entry;
}

const mainTablesEntry = manifestFile("main tables", /Main_Tables.*\.ods$/i);

const sourceFiles = {
  mainTables: path.join(rawDir, mainTablesEntry.fileName),
  nationalCsv: path.join(rawDir, "csvs", "Receipts and Disposals National.csv")
};

const release = {
  title: fetchManifest.releaseTitle,
  periodLabel: fetchManifest.releasePeriodLabel,
  periodCoverage: fetchManifest.releasePeriodCoverage,
  publishedDate: fetchManifest.releaseDate,
  nextEditionDate: fetchManifest.nextEditionDate,
  nextEditionCoverage: fetchManifest.nextEditionCoverage
};

for (const [field, value] of Object.entries(release)) {
  if (!value) {
    throw new Error(
      `data/raw/manifests/moj_tribunals.json has no ${field}. The manifest predates the ` +
        "derived-release fetcher. Re-run `npm run fetch:tribunals`."
    );
  }
}

const sourceMeta = {
  mojTribunals: {
    // Period-free, deliberately. This id was moj_tribunals_q4_2025_26, and routes.astro looks
    // charts up by it: chartSource returns {} on a miss, so the next release would have
    // silently stripped the source line off the tribunal charts rather than failing.
    source_id: "moj_tribunals",
    source_url: fetchManifest.landingUrl,
    attachment_url: mainTablesEntry.sourceUrl,
    methodology_url: "https://www.gov.uk/government/collections/tribunals-statistics",
    release_date: release.publishedDate
  }
};

const CHAMBER_LABEL = "First-tier Tribunal, Immigration and Asylum Chamber";

/** "2025/26" shifted by n years, e.g. -1 gives "2024/25". */
function shiftFinancialYear(label, offset) {
  const match = /^(\d{4})\/(\d{2})$/.exec(label);
  if (!match) throw new Error(`Unrecognised financial-year label "${label}".`);
  const start = Number(match[1]) + offset;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

// Case-type columns we publish. The MOJ table also carries Managed Migration, Entry Clearance,
// Family Visit Visa, Deport and others, Deportation Appeals and Deprivation of Citizenship, but
// those are now residual (mostly zero or withheld) after the Immigration Act 2014 changes.
// `timelinessLabel` is the row label used in table T_3, which abbreviates the asylum column.
const CASE_TYPES = [
  {
    id: "asylum_protection",
    column: "Asylum/Protection/Revocation of Protection",
    timelinessLabel: "Asylum/Protection",
    label: "Asylum, protection and revocation of protection"
  },
  { id: "human_rights", column: "Human Rights", timelinessLabel: "Human Rights", label: "Human rights" },
  {
    id: "eea_free_movement",
    column: "EEA Free Movement",
    timelinessLabel: "EEA Free Movement",
    label: "EEA free movement"
  }
];

function ensureCleanDir(directory) {
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeNdjson(filePath, rows) {
  writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function hashId(parts) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function unitForMetric(metricId) {
  if (metricId.endsWith("_pct")) {
    return "percentage";
  }

  if (metricId.endsWith("_weeks")) {
    return "weeks";
  }

  return "cases";
}

function makeObservation({
  metricId,
  areaCode = "UK",
  areaName = "United Kingdom",
  periodStart,
  periodEnd,
  periodType,
  value,
  seriesStatus = null,
  notes = null,
  fileHash
}) {
  const sourceMetaEntry = sourceMeta.mojTribunals;
  return {
    observation_id: `obs_${hashId([metricId, sourceMetaEntry.source_id, areaCode, periodEnd, String(value)])}`,
    metric_id: metricId,
    source_id: sourceMetaEntry.source_id,
    area_code_original: areaCode,
    area_code_current: areaCode,
    area_name_original: areaName,
    area_type: "country",
    country_code: "united_kingdom",
    region_code: null,
    period_start: periodStart,
    period_end: periodEnd,
    period_type: periodType,
    release_date: sourceMetaEntry.release_date,
    value,
    unit: unitForMetric(metricId),
    status: "official",
    series_status: seriesStatus,
    source_url: sourceMetaEntry.source_url,
    archive_source_url: null,
    file_hash: fileHash,
    methodology_url: sourceMetaEntry.methodology_url,
    notes
  };
}

function readSheet(sheetName) {
  const workbook = xlsx.readFile(sourceFiles.mainTables);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet ${sheetName} is missing from the MOJ main tables workbook.`);
  }

  return xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
}

// MOJ marks cells as ".." when not available and "-" when genuinely zero. Some cells arrive
// padded (" .. "), so the text is trimmed before either marker is tested.
function parseCell(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value ?? "").trim();
  if (!text || text === ".." || text === ":") {
    return null;
  }

  if (text === "-") {
    return 0;
  }

  const parsed = Number(text.replace(/,/g, "").replace(/%/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

// Strips trailing footnote references such as "Human Rights5" or
// "Asylum/Protection/Revocation of Protection5,6".
function normaliseHeader(value) {
  return String(value ?? "")
    .replace(/[\d,\s]+$/, "")
    .trim();
}

// Financial-year labels and quarter cells carry revision markers: "r" for revised as part of
// the annual reconciliation exercise, "p" for provisional and subject to later revision.
function splitRevisionMarker(value) {
  const text = String(value ?? "").trim();
  const match = /^(.*?)(r|p)$/.exec(text);
  if (!match) {
    return { text, status: "final" };
  }

  return { text: match[1].trim(), status: match[2] === "p" ? "provisional" : "revised" };
}

function financialYearBounds(financialYear) {
  const match = /^(\d{4})\/(\d{2})$/.exec(financialYear);
  if (!match) {
    return null;
  }

  const startYear = Number(match[1]);
  return { periodStart: `${startYear}-04-01`, periodEnd: `${startYear + 1}-03-31` };
}

// MOJ uses financial-year quarters: Q1 is April to June, Q4 is January to March of the
// following calendar year. Q4 2025/26 therefore ends on 31 March 2026.
function financialQuarterBounds(financialYear, quarterNumber) {
  const match = /^(\d{4})\/(\d{2})$/.exec(financialYear);
  if (!match) {
    return null;
  }

  const startYear = Number(match[1]);
  const bounds = {
    1: [`${startYear}-04-01`, `${startYear}-06-30`],
    2: [`${startYear}-07-01`, `${startYear}-09-30`],
    3: [`${startYear}-10-01`, `${startYear}-12-31`],
    4: [`${startYear + 1}-01-01`, `${startYear + 1}-03-31`]
  }[quarterNumber];

  return bounds ? { periodStart: bounds[0], periodEnd: bounds[1] } : null;
}

/**
 * Reads one of the FIA_* tables into flat rows.
 *
 * The tables share a layout: a header row of case-type columns, an annual block (quarter cell
 * empty), then a quarterly block where the financial year appears only on the Q1 row. FIA_2 and
 * FIA_3 add an "Outcome" column and repeat several outcome rows per period, with the quarter
 * named only on the first row of each block. Both the financial year and the quarter are
 * therefore forward-filled.
 */
function readFiaTable(sheetName, { hasOutcomeColumn }) {
  const rows = readSheet(sheetName);
  const headerIndex = rows.findIndex((row) => String(row[0]).trim() === "Financial Year");
  if (headerIndex === -1) {
    throw new Error(`Could not locate the header row in ${sheetName}.`);
  }

  const header = rows[headerIndex].map(normaliseHeader);
  const firstValueColumn = hasOutcomeColumn ? 3 : 2;
  const parsed = [];

  let financialYear = "";
  let quarterCell = "";

  for (const row of rows.slice(headerIndex + 1)) {
    const firstCell = String(row[0] ?? "").trim();
    // The data block ends at the source and notes footer.
    if (/^(Source:|Notes|HMCTS|ARIA)/.test(firstCell) || /^(\.\.|-|r =|p =)/.test(firstCell)) {
      break;
    }

    if (firstCell) {
      financialYear = firstCell;
      quarterCell = "";
    }

    const rawQuarter = String(row[1] ?? "").trim();
    if (rawQuarter) {
      quarterCell = rawQuarter;
    }

    const outcome = hasOutcomeColumn ? String(row[2] ?? "").trim() : null;
    if (hasOutcomeColumn && !outcome) {
      continue;
    }

    const yearParts = splitRevisionMarker(financialYear);
    const quarterParts = splitRevisionMarker(quarterCell);
    const quarterNumber = /^Q([1-4])$/.exec(quarterParts.text)?.[1];

    // Revision status is taken from whichever cell carries the marker for this row.
    const seriesStatus =
      quarterParts.status !== "final"
        ? quarterParts.status
        : yearParts.status !== "final"
          ? yearParts.status
          : "final";

    const values = {};
    for (let index = firstValueColumn; index < header.length; index += 1) {
      const column = header[index];
      if (column) {
        values[column] = parseCell(row[index]);
      }
    }

    if (quarterNumber) {
      const bounds = financialQuarterBounds(yearParts.text, Number(quarterNumber));
      if (!bounds) {
        continue;
      }

      parsed.push({
        periodType: "quarter",
        financialYear: yearParts.text,
        quarterNumber: Number(quarterNumber),
        periodLabel: `Q${quarterNumber} ${yearParts.text}`,
        ...bounds,
        seriesStatus,
        outcome,
        values
      });
      continue;
    }

    // Annual rows in FIA_1 to FIA_3 name the financial year; FIA_4 labels them by snapshot date.
    const bounds = financialYearBounds(yearParts.text);
    if (!bounds) {
      continue;
    }

    parsed.push({
      periodType: "year",
      financialYear: yearParts.text,
      quarterNumber: null,
      periodLabel: yearParts.text,
      ...bounds,
      seriesStatus,
      outcome,
      values
    });
  }

  return parsed;
}

function pickSeries(rows, { periodType, column, outcome = null }) {
  return rows
    .filter((row) => row.periodType === periodType)
    .filter((row) => (outcome === null ? true : row.outcome === outcome))
    .map((row) => ({
      periodLabel: row.periodLabel,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      seriesStatus: row.seriesStatus,
      value: row.values[column] ?? null
    }))
    .filter((point) => point.value !== null);
}

function findPoint(series, periodLabel) {
  return series.find((point) => point.periodLabel === periodLabel) ?? null;
}

function toPublishedSeries(series) {
  return series.map(({ periodLabel, periodEnd, value, seriesStatus }) => ({
    periodLabel,
    periodEnd,
    value,
    seriesStatus
  }));
}

function parseWeeks(value) {
  const match = /(\d+(?:\.\d+)?)/.exec(String(value ?? ""));
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

if (!existsSync(sourceFiles.mainTables)) {
  throw new Error(
    `Missing ${sourceFiles.mainTables}. Run "npm run fetch:tribunals" before transforming.`
  );
}

const mainTablesHash = fileSha256(sourceFiles.mainTables);

const receiptsRows = readFiaTable("FIA_1", { hasOutcomeColumn: false });
const disposalsRows = readFiaTable("FIA_2", { hasOutcomeColumn: true });
const determinedRows = readFiaTable("FIA_3", { hasOutcomeColumn: true });
const openCaseloadRows = readFiaTable("FIA_4", { hasOutcomeColumn: false });

const DISPOSALS_OUTCOME = "Disposals";
const DETERMINED_OUTCOME = "Determined at hearing / papers";
const ALLOWED_OUTCOME = "Allowed/Granted %";

const quarterly = {
  receipts: pickSeries(receiptsRows, { periodType: "quarter", column: "Total" }),
  disposals: pickSeries(disposalsRows, { periodType: "quarter", column: "Total", outcome: DISPOSALS_OUTCOME }),
  openCaseload: pickSeries(openCaseloadRows, { periodType: "quarter", column: "Total" }),
  determinedAtHearing: pickSeries(determinedRows, {
    periodType: "quarter",
    column: "Total",
    outcome: DETERMINED_OUTCOME
  }),
  allowedRatePct: pickSeries(determinedRows, {
    periodType: "quarter",
    column: "Total",
    outcome: ALLOWED_OUTCOME
  }).map((point) => ({ ...point, value: Number((point.value * 100).toFixed(1)) }))
};

const annual = {
  receipts: pickSeries(receiptsRows, { periodType: "year", column: "Total" }),
  disposals: pickSeries(disposalsRows, { periodType: "year", column: "Total", outcome: DISPOSALS_OUTCOME })
};

// All four derive from the release. The three that were written in here meant a new edition
// would compare the wrong quarters: on the April to June release, "Q4 2024/25" is not the
// year-ago comparison for Q1 2026/27.
const latestPeriodLabel = release.periodLabel;
const [latestQuarterToken, latestAnnualLabel] = latestPeriodLabel.split(" ");
const previousAnnualLabel = shiftFinancialYear(latestAnnualLabel, -1);
const previousPeriodLabel = `${latestQuarterToken} ${previousAnnualLabel}`;

// "January to March 2026" and its year-ago counterpart, for the timeliness table headers.
const latestQuarterCoverage = release.periodCoverage;
const previousQuarterCoverage = release.periodCoverage.replace(
  /(\d{4})$/,
  (year) => String(Number(year) - 1)
);

const caseTypeSeries = CASE_TYPES.map((caseType) => {
  const receipts = pickSeries(receiptsRows, { periodType: "quarter", column: caseType.column });
  const disposals = pickSeries(disposalsRows, {
    periodType: "quarter",
    column: caseType.column,
    outcome: DISPOSALS_OUTCOME
  });
  const openCaseload = pickSeries(openCaseloadRows, { periodType: "quarter", column: caseType.column });
  const allowedRatePct = pickSeries(determinedRows, {
    periodType: "quarter",
    column: caseType.column,
    outcome: ALLOWED_OUTCOME
  }).map((point) => ({ ...point, value: Number((point.value * 100).toFixed(1)) }));

  return { ...caseType, receipts, disposals, openCaseload, allowedRatePct };
});

// Timeliness. T_1 is the annual financial-year mean, T_2 the same quarter a year apart, and
// T_3 breaks the latest quarter down by case type. The annual and quarterly means differ, so
// both are published with their basis named.
const timelinessAnnualRows = readSheet("T_1");
const timelinessQuarterRows = readSheet("T_2");
const timelinessCaseTypeRows = readSheet("T_3");

function readTimelinessBlock(rows, chamberMatcher, labels) {
  const startIndex = rows.findIndex((row) => chamberMatcher.test(String(row[0])));
  if (startIndex === -1) {
    return {};
  }

  // Each chamber block runs from its heading to its "Difference" row. The period labels repeat
  // verbatim in the blocks for the other chambers below, so the scan must stop at the block end.
  const result = {};
  for (const row of rows.slice(startIndex + 1)) {
    const label = String(row[0] ?? "").trim();
    if (labels[label]) {
      result[labels[label]] = parseWeeks(row[4]);
    }

    if (label === "Difference") {
      break;
    }
  }

  return result;
}

const annualTimeliness = readTimelinessBlock(
  timelinessAnnualRows,
  /First-tier Tribunal \(Immigration and Asylum Chamber\)/,
  { [previousAnnualLabel]: "previousMeanWeeks", [latestAnnualLabel]: "latestMeanWeeks" }
);

const quarterlyTimeliness = readTimelinessBlock(
  timelinessQuarterRows,
  /First Tier Tribunal \(Immigration and Asylum Chamber\)/,
  { [previousQuarterCoverage]: "previousMeanWeeks", [latestQuarterCoverage]: "latestMeanWeeks" }
);

const caseTypeTimelinessStart = timelinessCaseTypeRows.findIndex((row) =>
  /First Tier Tribunal \(Immigration and Asylum Chamber\)/.test(String(row[0]))
);
const caseTypeTimeliness = {};
for (const row of timelinessCaseTypeRows.slice(caseTypeTimelinessStart + 1, caseTypeTimelinessStart + 7)) {
  const label = normaliseHeader(row[0]);
  const weeks = parseWeeks(row[1]);
  if (label && weeks !== null) {
    caseTypeTimeliness[label] = weeks;
  }
}

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------

// The reconciliation anchors below were read off the published tables for this release and
// are the only thing establishing that the ODS parse is reading the right cells. MOJ moves
// columns between editions, so they are deliberately release-specific and the transform
// refuses to run when they stop matching.
const ANCHORS_RECORDED_FOR = "Q4 2025/26";

const reconciliationChecks = [];

function check(label, actual, expected) {
  reconciliationChecks.push({ label, actual, expected, ok: actual === expected });
}

check("receipts, Q4 2025/26", findPoint(quarterly.receipts, latestPeriodLabel)?.value, 27689);
check("receipts, Q4 2024/25", findPoint(quarterly.receipts, previousPeriodLabel)?.value, 26273);
check("disposals, Q4 2025/26", findPoint(quarterly.disposals, latestPeriodLabel)?.value, 15317);
check("disposals, Q4 2024/25", findPoint(quarterly.disposals, previousPeriodLabel)?.value, 11420);
check("open caseload, Q4 2025/26", findPoint(quarterly.openCaseload, latestPeriodLabel)?.value, 151767);
check("open caseload, Q4 2024/25", findPoint(quarterly.openCaseload, previousPeriodLabel)?.value, 90389);
check("allowed rate, Q4 2025/26", findPoint(quarterly.allowedRatePct, latestPeriodLabel)?.value, 39);
check("allowed rate, Q4 2024/25", findPoint(quarterly.allowedRatePct, previousPeriodLabel)?.value, 42.5);
check("annual receipts, 2025/26", findPoint(annual.receipts, latestAnnualLabel)?.value, 117697);
check("annual receipts, 2024/25", findPoint(annual.receipts, previousAnnualLabel)?.value, 79074);

const asylumProtection = caseTypeSeries.find((entry) => entry.id === "asylum_protection");
check(
  "asylum and protection open caseload, Q4 2025/26",
  findPoint(asylumProtection.openCaseload, latestPeriodLabel)?.value,
  87450
);
check(
  "asylum and protection open caseload, Q4 2024/25",
  findPoint(asylumProtection.openCaseload, previousPeriodLabel)?.value,
  50976
);
check(`mean weeks to clear, ${latestQuarterCoverage}`, quarterlyTimeliness.latestMeanWeeks, 61);
for (const caseType of CASE_TYPES) {
  check(
    `mean weeks to clear by case type, ${caseType.id}`,
    typeof caseTypeTimeliness[caseType.timelinessLabel],
    "number"
  );
}
check("mean weeks to clear, January to March 2025", quarterlyTimeliness.previousMeanWeeks, 50);

// Independent cross-check of the ODS parse against the published national CSV, which also
// carries the per-quarter revision status.
const csvRevisionStatus = new Map();
if (existsSync(sourceFiles.nationalCsv)) {
  const csvRows = parseCsv(readFileSync(sourceFiles.nationalCsv, "utf8"));
  const quarterPattern = /^Q([1-4])\b/;

  for (const row of csvRows) {
    const tribunal = String(row["tribunal (2)"] ?? "").trim();
    if (tribunal !== "First Tier Tribunal (Immigration and Asylum Chamber)") {
      continue;
    }

    const financialYear = String(row.year ?? "").trim();
    const quarterNumber = quarterPattern.exec(String(row.quarter ?? "").trim())?.[1];
    if (!quarterNumber) {
      continue;
    }

    const periodLabel = `Q${quarterNumber} ${financialYear}`;
    const category = String(row.category ?? "").trim();
    const value = parseCell(row.value);
    const revised = String(row["revised (1)"] ?? "").trim();
    if (revised) {
      csvRevisionStatus.set(periodLabel, revised);
    }

    if (value === null) {
      continue;
    }

    const series = category === "receipts" ? quarterly.receipts : category === "disposals" ? quarterly.disposals : null;
    if (!series) {
      continue;
    }

    const odsValue = findPoint(series, periodLabel)?.value;
    if (odsValue !== undefined && odsValue !== value) {
      reconciliationChecks.push({
        label: `CSV cross-check, ${category} ${periodLabel}`,
        actual: odsValue,
        expected: value,
        ok: false
      });
    }
  }
} else {
  console.warn(
    `Warning: ${sourceFiles.nationalCsv} is missing, so the CSV cross-check was skipped. Run "npm run fetch:tribunals" to restore it.`
  );
}

const failedChecks = reconciliationChecks.filter((entry) => !entry.ok);
if (failedChecks.length > 0) {
  const detail = failedChecks
    .map((entry) => `  ${entry.label}: parsed ${entry.actual}, expected ${entry.expected}`)
    .join("\n");
  const newEdition = latestPeriodLabel !== ANCHORS_RECORDED_FOR;
  throw new Error(
    `MOJ tribunal reconciliation failed. The published figures no longer match the parse:\n${detail}\n\n` +
      (newEdition
        ? `This is ${latestPeriodLabel} and the anchors above were recorded for ` +
          `${ANCHORS_RECORDED_FOR}, so this is the expected failure on a new edition rather ` +
          "than a broken parse. Read the new figures off the published tables at " +
          `${fetchManifest.landingUrl}, replace the expected values in ` +
          "scripts/transform/transform-tribunals.mjs, and move ANCHORS_RECORDED_FOR to " +
          `${latestPeriodLabel}. Do not copy them from the parse output: the point of these ` +
          "numbers is that a human checked them against what MOJ published."
        : `This is still ${latestPeriodLabel}, the edition the anchors were recorded for, so ` +
          "the parse has changed rather than the data. Something is reading the wrong cells.")
  );
}

// ---------------------------------------------------------------------------
// Build outputs
// ---------------------------------------------------------------------------

function deltaBlock(series, latestLabel, previousLabel) {
  const latest = findPoint(series, latestLabel)?.value ?? null;
  const previous = findPoint(series, previousLabel)?.value ?? null;
  const change = latest !== null && previous !== null ? Number((latest - previous).toFixed(1)) : null;
  const changePct =
    latest !== null && previous ? Number((((latest - previous) / previous) * 100).toFixed(1)) : null;

  return { latest, previous, change, changePct };
}

const headline = {
  receipts: deltaBlock(quarterly.receipts, latestPeriodLabel, previousPeriodLabel),
  disposals: deltaBlock(quarterly.disposals, latestPeriodLabel, previousPeriodLabel),
  openCaseload: deltaBlock(quarterly.openCaseload, latestPeriodLabel, previousPeriodLabel),
  determinedAtHearing: deltaBlock(quarterly.determinedAtHearing, latestPeriodLabel, previousPeriodLabel),
  allowedRatePct: deltaBlock(quarterly.allowedRatePct, latestPeriodLabel, previousPeriodLabel),
  annualReceipts: deltaBlock(annual.receipts, latestAnnualLabel, previousAnnualLabel),
  annualDisposals: deltaBlock(annual.disposals, latestAnnualLabel, previousAnnualLabel)
};

const latestBreakdown = [
  { label: "Receipts", value: headline.receipts.latest, metricId: "fttiac_receipts" },
  { label: "Disposals", value: headline.disposals.latest, metricId: "fttiac_disposals" },
  {
    label: "Determined at hearing or on paper",
    value: headline.determinedAtHearing.latest,
    metricId: "fttiac_determined_at_hearing"
  },
  { label: "Open caseload at quarter end", value: headline.openCaseload.latest, metricId: "fttiac_open_caseload" }
];

const caseTypes = caseTypeSeries.map((caseType) => ({
  id: caseType.id,
  label: caseType.label,
  sourceColumn: caseType.column,
  meanWeeksToClear: caseTypeTimeliness[caseType.timelinessLabel] ?? null,
  receipts: deltaBlock(caseType.receipts, latestPeriodLabel, previousPeriodLabel),
  disposals: deltaBlock(caseType.disposals, latestPeriodLabel, previousPeriodLabel),
  openCaseload: deltaBlock(caseType.openCaseload, latestPeriodLabel, previousPeriodLabel),
  allowedRatePct: deltaBlock(caseType.allowedRatePct, latestPeriodLabel, previousPeriodLabel),
  series: {
    receipts: toPublishedSeries(caseType.receipts),
    disposals: toPublishedSeries(caseType.disposals),
    openCaseload: toPublishedSeries(caseType.openCaseload),
    allowedRatePct: toPublishedSeries(caseType.allowedRatePct)
  }
}));

// Revision status is taken from the receipts table, which is the one MOJ marks with r and p on
// every quarter cell. FIA_4 (open caseload) carries no markers at all, so its points parse as
// "final" even for the provisional quarter. The published status below is therefore the release
// level statement, cross-checked against the national CSV.
const revisionStatusByPeriod = quarterly.receipts
  .slice(-8)
  .map((point) => ({
    periodLabel: point.periodLabel,
    status: point.seriesStatus,
    publishedStatus: csvRevisionStatus.get(point.periodLabel) ?? null
  }));

const periodBasisNote =
  `MOJ publishes tribunal statistics on financial-year quarters, so ${latestPeriodLabel} covers ${latestQuarterCoverage}. The Home Office claims, decisions, backlog, support and returns series elsewhere on this site use calendar quarters. The two bases are not interchangeable and should not be plotted on a single axis.`;

const continuityNote =
  "This series is not a like-for-like continuation of the Home Office asylum-appeals-lodged dataset that ended at 2023 Q1. It counts every appeal lodged with the First-tier Tribunal Immigration and Asylum Chamber, including human rights and EEA free movement cases, so the volumes are much larger than the old asylum-only figures. The two series should not be spliced into one continuous line.";

const provisionalNote =
  `${latestPeriodLabel} figures are provisional and subject to revision. Earlier quarters of ${latestAnnualLabel} are revised as later editions land, and ${previousAnnualLabel} is now final.`;

const tribunalAppeals = {
  generatedAt: new Date().toISOString(),
  datasetId: "moj_tribunals",
  chamberLabel: CHAMBER_LABEL,
  chamberShortLabel: "FtTIAC",
  release,
  periodBasis: "financial_year_quarter",
  periodBasisNote,
  continuityNote,
  provisionalNote,
  latestPeriodLabel,
  previousPeriodLabel,
  latestAnnualLabel,
  previousAnnualLabel,
  headline,
  latestBreakdown,
  caseTypes,
  timeliness: {
    quarterly: {
      basisLabel: `${latestQuarterCoverage} against ${previousQuarterCoverage}`,
      latestMeanWeeks: quarterlyTimeliness.latestMeanWeeks ?? null,
      previousMeanWeeks: quarterlyTimeliness.previousMeanWeeks ?? null,
      changeWeeks:
        quarterlyTimeliness.latestMeanWeeks !== null && quarterlyTimeliness.previousMeanWeeks !== null
          ? quarterlyTimeliness.latestMeanWeeks - quarterlyTimeliness.previousMeanWeeks
          : null
    },
    annual: {
      basisLabel: "2025/26 against 2024/25",
      latestMeanWeeks: annualTimeliness.latestMeanWeeks ?? null,
      previousMeanWeeks: annualTimeliness.previousMeanWeeks ?? null,
      changeWeeks:
        annualTimeliness.latestMeanWeeks !== null && annualTimeliness.previousMeanWeeks !== null
          ? annualTimeliness.latestMeanWeeks - annualTimeliness.previousMeanWeeks
          : null
    },
    note: "Mean time from receipt to clearance. MOJ has withdrawn the quartile measures for First-tier Tribunal figures pending a review of how aggregate timeliness is derived from caseload data. Means are unaffected."
  },
  revisionStatusByPeriod,
  series: {
    receipts: toPublishedSeries(quarterly.receipts),
    disposals: toPublishedSeries(quarterly.disposals),
    openCaseload: toPublishedSeries(quarterly.openCaseload),
    determinedAtHearing: toPublishedSeries(quarterly.determinedAtHearing),
    allowedRatePct: toPublishedSeries(quarterly.allowedRatePct)
  },
  annualSeries: {
    receipts: toPublishedSeries(annual.receipts),
    disposals: toPublishedSeries(annual.disposals)
  },
  readingNotes: [
    continuityNote,
    periodBasisNote,
    provisionalNote,
    "Open caseload is a quarter-end snapshot taken at the point of data extraction, so it cannot be reconstructed by adding receipts and subtracting disposals across quarters.",
    "Disposals include appeals withdrawn, struck out or found invalid. The allowed rate is calculated only on the smaller group determined at a hearing or on paper."
  ],
  sources: [sourceMeta.mojTribunals],
  reconciliation: {
    checkedAt: new Date().toISOString(),
    checkCount: reconciliationChecks.length,
    allPassed: true
  }
};

// Canonical observations.
const observationRows = [];
const quarterlyMetricMap = [
  { metricId: "fttiac_receipts", series: quarterly.receipts, notes: "FtTIAC appeal receipts, all case types." },
  { metricId: "fttiac_disposals", series: quarterly.disposals, notes: "FtTIAC appeal disposals, all case types." },
  {
    metricId: "fttiac_open_caseload",
    series: quarterly.openCaseload,
    notes: "FtTIAC open caseload at quarter end, all case types."
  },
  {
    metricId: "fttiac_determined_at_hearing",
    series: quarterly.determinedAtHearing,
    notes: "FtTIAC appeals determined at a hearing or on paper, all case types."
  },
  {
    metricId: "fttiac_allowed_rate_pct",
    series: quarterly.allowedRatePct,
    notes: "Share of FtTIAC appeals determined at a hearing or on paper that were allowed or granted."
  }
];

for (const { metricId, series, notes } of quarterlyMetricMap) {
  for (const point of series) {
    observationRows.push(
      makeObservation({
        metricId,
        periodStart: point.periodStart,
        periodEnd: point.periodEnd,
        periodType: "quarter",
        value: point.value,
        seriesStatus: point.seriesStatus,
        notes,
        fileHash: mainTablesHash
      })
    );
  }
}

for (const caseType of caseTypeSeries) {
  const perCaseType = [
    { suffix: "receipts", series: caseType.receipts },
    { suffix: "disposals", series: caseType.disposals },
    { suffix: "open_caseload", series: caseType.openCaseload },
    { suffix: "allowed_rate_pct", series: caseType.allowedRatePct }
  ];

  for (const { suffix, series } of perCaseType) {
    for (const point of series) {
      observationRows.push(
        makeObservation({
          metricId: `fttiac_${caseType.id}_${suffix}`,
          periodStart: point.periodStart,
          periodEnd: point.periodEnd,
          periodType: "quarter",
          value: point.value,
          seriesStatus: point.seriesStatus,
          notes: `FtTIAC ${caseType.label} appeals, ${suffix.replace(/_/g, " ")}.`,
          fileHash: mainTablesHash
        })
      );
    }
  }
}

for (const { metricId, series } of [
  { metricId: "fttiac_receipts_annual", series: annual.receipts },
  { metricId: "fttiac_disposals_annual", series: annual.disposals }
]) {
  for (const point of series) {
    observationRows.push(
      makeObservation({
        metricId,
        periodStart: point.periodStart,
        periodEnd: point.periodEnd,
        periodType: "year",
        value: point.value,
        seriesStatus: point.seriesStatus,
        notes: "FtTIAC financial-year total, all case types.",
        fileHash: mainTablesHash
      })
    );
  }
}

const canonicalManifest = {
  generated_at: new Date().toISOString(),
  dataset_id: "moj_tribunals",
  domains: ["asylum_appeals", "tribunals"],
  period_basis: "financial_year_quarter",
  record_counts: {
    canonical_observations: observationRows.length,
    case_types: caseTypes.length,
    reconciliation_checks: reconciliationChecks.length
  },
  outputs: ["tribunal_observations.ndjson", "tribunal-appeals.json"]
};

ensureCleanDir(canonicalDir);
ensureCleanDir(martsDir);

writeNdjson(path.join(canonicalDir, "tribunal_observations.ndjson"), observationRows);
writeJson(path.join(canonicalDir, "manifest.json"), canonicalManifest);
writeJson(path.join(martsDir, "tribunal-appeals.json"), tribunalAppeals);
copyFileSync(path.join(martsDir, "tribunal-appeals.json"), path.join(liveDir, "tribunal-appeals.json"));

// The route dashboard is produced by transform-routes.mjs from the Home Office releases, which
// no longer publish an appeals series. Its appeals block is refreshed here from the same shared
// builder that transform-routes.mjs uses, so the dashboard stays current without needing a full
// Home Office re-ingest.
const appealsBlock = buildAppealsBlock(tribunalAppeals);
const dashboardTargets = [
  path.join(liveDir, "route-dashboard.json"),
  path.resolve("data/marts/uk_routes/national-route-dashboard.json")
];

for (const target of dashboardTargets) {
  if (!existsSync(target)) {
    continue;
  }

  const dashboard = JSON.parse(readFileSync(target, "utf8"));
  if (!dashboard?.nationalSystemDynamics?.postDecisionPath) {
    continue;
  }

  dashboard.nationalSystemDynamics.postDecisionPath.appeals = appealsBlock;

  // Replace, do not append. This used to add the tribunal source only when its exact id was
  // absent, so when the id stopped carrying the release period the dashboard ended up
  // carrying both moj_tribunals_q4_2025_26 and moj_tribunals. Under the old scheme every
  // edition would have left another dead id behind.
  const sources = Array.isArray(dashboard.sources) ? dashboard.sources : [];
  dashboard.sources = [
    ...sources.filter(
      (entry) =>
        entry.source_id !== "asylum_appeals_mar_2023" &&
        !String(entry.source_id ?? "").startsWith("moj_tribunals")
    ),
    sourceMeta.mojTribunals
  ];

  if (Array.isArray(dashboard.limitations)) {
    dashboard.limitations = dashboard.limitations.map((item) =>
      /appeals dataset currently ends at 2023 Q1/.test(item)
        ? "Appeals now come from the MOJ tribunal statistics rather than the discontinued Home Office appeals dataset. MOJ counts every First-tier Tribunal immigration and asylum appeal on financial-year quarters, so the volumes are much larger than the old asylum-only series and the periods do not line up with the Home Office calendar quarters."
        : item
    );
  }

  if (Array.isArray(dashboard.nationalSystemDynamics.postDecisionPath.readingNotes)) {
    dashboard.nationalSystemDynamics.postDecisionPath.readingNotes[0] =
      "Appeals are part of the post-decision path for refused claims. The tribunal series is now current, but it is a MOJ caseload measure on financial-year quarters, not a Home Office asylum-only count.";
  }

  writeJson(target, dashboard);
}

console.log(
  `Built moj_tribunals marts with ${observationRows.length} canonical observations across ${caseTypes.length} case types. ` +
    `${reconciliationChecks.length} reconciliation checks passed. Latest period ${latestPeriodLabel}.`
);
