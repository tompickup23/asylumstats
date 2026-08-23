import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import xlsx from "xlsx";
import { buildAppealsBlock, readTribunalAppeals } from "../lib/tribunal-appeals.mjs";
import { readRoutesManifest, releaseSectionUrl, resolveSource } from "../lib/route-release.mjs";

const rawDir = path.resolve("data/raw/uk_routes");
const canonicalDir = path.resolve("data/canonical/uk_routes");
const martsDir = path.resolve("data/marts/uk_routes");
const liveDir = path.resolve("src/data/live");

// The Home Office discontinued its asylum-appeals-lodged dataset after 2023 Q1. Appeal-stage
// figures now come from the MOJ tribunal pipeline (npm run ingest:tribunals), which publishes
// First-tier Tribunal caseload on financial-year quarters.
const tribunalAppeals = readTribunalAppeals();
if (!tribunalAppeals) {
  throw new Error(
    'Missing src/data/live/tribunal-appeals.json. Run "npm run ingest:tribunals" before transforming routes.'
  );
}

const tribunalAppealsBlock = buildAppealsBlock(tribunalAppeals);

// Which release each dataset belongs to, read from the manifest fetch-routes.mjs wrote
// rather than written out here.
//
// This used to be nine hardcoded `-mar-2026` filenames and nine hardcoded media URLs. The
// fetcher had already been taught to discover the newest file, so the pair disagreed the
// moment a quarter landed: in CI the transform failed with ENOENT on a filename nobody had
// downloaded (which killed the 10 August refresh), and on a machine still holding the old
// file it would have transformed March data and labelled it June. Everything period-shaped
// now comes from the file that was actually fetched.
//
// Only the section of the release that documents each dataset is named here, because that
// is genuinely per-dataset and does not move. The two local authority files live on the
// standing statistical data set instead of the quarterly release, so they carry an absolute
// URL and `releaseSectionUrl` passes it through.
const REGIONAL_LA_PAGE =
  "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-regional-and-local-authority-data";

const SOURCE_SECTIONS = {
  localImmigration: { sourceId: "local_immigration_groups", section: REGIONAL_LA_PAGE },
  localResettlement: { sourceId: "local_resettlement_routes", section: REGIONAL_LA_PAGE },
  illegalEntry: { sourceId: "illegal_entry_routes", section: "summary-of-latest-statistics" },
  safeLegal: { sourceId: "safe_legal_routes_summary", section: "summary-of-latest-statistics" },
  asylumClaims: { sourceId: "asylum_claims", section: "how-many-people-claim-asylum-in-the-uk" },
  asylumAwaitingDecision: {
    sourceId: "asylum_awaiting_decision",
    section: "how-many-people-are-in-the-uk-asylum-system"
  },
  asylumOutcomeAnalysis: {
    sourceId: "asylum_outcome_analysis",
    section: "how-many-people-are-granted-asylum-in-the-uk"
  },
  asylumSupport: {
    sourceId: "asylum_support",
    section: "how-many-people-are-in-the-uk-asylum-system"
  },
  returns: { sourceId: "returns", section: "how-many-people-are-returned-from-the-uk" }
};

const routesManifest = readRoutesManifest(path.resolve("data/raw/manifests/uk_routes.json"));

// `source_id` no longer carries the period. It used to read `asylum_claims_mar_2026`, and
// src/pages/routes.astro looked charts up by that exact string, so the next release would
// have silently dropped the source line from nine public charts: the id is the dataset,
// the period belongs to release_date and attachment_url alongside it.
const sourceFiles = {};
const sourceMeta = {};
for (const [key, spec] of Object.entries(SOURCE_SECTIONS)) {
  const resolved = resolveSource(routesManifest, spec.sourceId);
  const sectionUrl = releaseSectionUrl(resolved.period.slug, spec.section);
  sourceFiles[key] = path.join(rawDir, resolved.fileName);
  sourceMeta[key] = {
    source_id: spec.sourceId,
    source_url: sectionUrl,
    attachment_url: resolved.sourceUrl,
    methodology_url: sectionUrl,
    release_date: resolved.releaseDate,
    period_label: resolved.period.label
  };
}

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

function readSheetRows(filePath, sheetName) {
  const workbook = xlsx.readFile(filePath, { raw: false });
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: ""
  });
}

function rowObjects(filePath, sheetName, headerRowIndex = 1) {
  const workbook = xlsx.readFile(filePath, { raw: false });
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    range: headerRowIndex,
    raw: false,
    defval: ""
  });
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
];

// Home Office sheet titles carry their own reference date, e.g.
// "Reg_02: Immigration groups, by Local Authority, as at 31 March 2026".
// Reading it from the source keeps every published snapshot label in step with
// whichever release is on disk. Throwing beats defaulting: a silently stale
// label is the failure this replaced.
function parseSnapshotDateFromTitle(rows, sheetName) {
  const title = String(rows?.[0]?.[0] ?? "");
  const match = title.match(/as at (\d{1,2}) ([A-Za-z]+) (\d{4})/i);
  if (!match) {
    throw new Error(
      `Could not read an "as at" date from the ${sheetName} title row: ${title || "(empty)"}`
    );
  }

  const monthIndex = MONTH_NAMES.indexOf(match[2].toLowerCase());
  if (monthIndex === -1) {
    throw new Error(`Unrecognised month "${match[2]}" in the ${sheetName} title row: ${title}`);
  }

  return [
    match[3],
    String(monthIndex + 1).padStart(2, "0"),
    String(Number(match[1])).padStart(2, "0")
  ].join("-");
}

function formatSnapshotDateLong(isoDate) {
  const [year, month, day] = isoDate.split("-");
  const monthName = MONTH_NAMES[Number(month) - 1];
  return `${Number(day)} ${monthName[0].toUpperCase()}${monthName.slice(1)} ${year}`;
}

function roundNumber(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function parseNumber(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === ":" || text.toLowerCase() === "z" || text === "N/A") {
    return null;
  }

  const normalized = text.replace(/,/g, "").replace(/%/g, "").replace(/\+/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeNumber(value) {
  return parseNumber(value) ?? 0;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function endOfQuarter(quarterLabel) {
  const match = /^(\d{4}) Q([1-4])$/.exec(String(quarterLabel).trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const month = quarter * 3;
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
}

function startOfQuarter(quarterLabel) {
  const match = /^(\d{4}) Q([1-4])$/.exec(String(quarterLabel).trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const month = (quarter - 1) * 3;
  const date = new Date(Date.UTC(year, month, 1));
  return date.toISOString().slice(0, 10);
}

function endOfYear(yearLabel) {
  const year = Number(String(yearLabel).trim().slice(0, 4));
  return Number.isFinite(year) ? `${year}-12-31` : null;
}

function startOfYear(yearLabel) {
  const year = Number(String(yearLabel).trim().slice(0, 4));
  return Number.isFinite(year) ? `${year}-01-01` : null;
}

function endOfDateLabel(dateLabel) {
  const match = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(String(dateLabel).trim());
  if (!match) {
    return null;
  }

  const monthMap = {
    Jan: 1,
    Feb: 2,
    Mar: 3,
    Apr: 4,
    May: 5,
    Jun: 6,
    Jul: 7,
    Aug: 8,
    Sep: 9,
    Oct: 10,
    Nov: 11,
    Dec: 12
  };

  const day = Number(match[1]);
  const month = monthMap[match[2]];
  const year = Number(match[3]);
  if (!day || !month || !year) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function startOfDateLabel(dateLabel) {
  const iso = endOfDateLabel(dateLabel);
  if (!iso) {
    return null;
  }

  const [year, month] = iso.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function quarterLabelForDateLabel(dateLabel) {
  const iso = endOfDateLabel(dateLabel);
  if (!iso) {
    return null;
  }

  const [year, month] = iso.split("-").map(Number);
  const quarter = Math.ceil(month / 3);
  return `${year} Q${quarter}`;
}

function inferCountryFromRow(regionOrNation, areaCode = "") {
  if (String(regionOrNation).includes("Scotland") || String(areaCode).startsWith("S")) {
    return "Scotland";
  }

  if (String(regionOrNation).includes("Wales") || String(areaCode).startsWith("W")) {
    return "Wales";
  }

  if (String(regionOrNation).includes("Northern Ireland") || String(areaCode).startsWith("N")) {
    return "Northern Ireland";
  }

  if (String(regionOrNation).includes("United Kingdom")) {
    return "United Kingdom";
  }

  return "England";
}

function inferAreaType(areaCode, areaName) {
  if (areaCode === "UK") {
    return "country";
  }

  if (/^region_/.test(areaCode)) {
    return "region";
  }

  if (/^country_/.test(areaCode)) {
    return "country";
  }

  if (areaName.includes("United Kingdom")) {
    return "country";
  }

  return "local_authority";
}

function areaCodeForRegionalRow(location) {
  if (location === "United Kingdom - total") {
    return "UK";
  }

  if (/England - /.test(location) && !location.endsWith("total")) {
    return `region_${slugify(location.replace("England - ", ""))}`;
  }

  if (location.endsWith("- total")) {
    return `country_${slugify(location.replace(" - total", ""))}`;
  }

  return `special_${slugify(location)}`;
}

function classifyResettlementFamily(scheme) {
  if (/Afghan|ACRS|ARAP|ARR/.test(scheme)) {
    return "afghan_resettlement_programme";
  }

  if (/UK Resettlement Scheme|Mandate Scheme|Vulnerable Children|Vulnerable Persons|Gateway/.test(scheme)) {
    return "uk_resettlement_scheme";
  }

  return "resettled_refugees_arrivals";
}

function topAreas(areas, key, label, limit = 10) {
  return {
    metricId: key,
    label,
    rows: [...areas]
      .filter((row) => typeof row[key] === "number" && row[key] > 0)
      .sort((a, b) => b[key] - a[key])
      .slice(0, limit)
      .map((row) => ({
        areaCode: row.areaCode,
        areaName: row.areaName,
        regionName: row.regionName,
        value: row[key]
      }))
  };
}

function unitForMetric(metricId) {
  if (metricId.endsWith("_rate")) {
    return "rate_per_10000";
  }

  if (metricId.includes("_share_") || metricId.endsWith("_share")) {
    return "percentage";
  }

  return "people";
}

function makeObservation({
  metricId,
  sourceMetaEntry,
  areaCode,
  areaName,
  areaType,
  countryName,
  regionCode = null,
  periodStart,
  periodEnd,
  periodType,
  value,
  notes = null,
  fileHash
}) {
  return {
    observation_id: `obs_${hashId([metricId, sourceMetaEntry.source_id, areaCode, periodEnd, String(value)])}`,
    metric_id: metricId,
    source_id: sourceMetaEntry.source_id,
    area_code_original: areaCode,
    area_code_current: areaCode,
    area_name_original: areaName,
    area_type: areaType,
    country_code: countryName ? slugify(countryName) : null,
    region_code: regionCode,
    period_start: periodStart,
    period_end: periodEnd,
    period_type: periodType,
    release_date: sourceMetaEntry.release_date,
    value,
    unit: unitForMetric(metricId),
    status: "official",
    series_status: null,
    source_url: sourceMetaEntry.source_url,
    archive_source_url: null,
    file_hash: fileHash,
    methodology_url: sourceMetaEntry.methodology_url,
    notes
  };
}

function extractYearSeries(rows, headerRowIndex) {
  const header = rows[headerRowIndex] || [];
  const endIndex = header.findIndex((cell) => String(cell).includes("Change in the latest year"));
  const periods = header
    .slice(1, endIndex === -1 ? header.length : endIndex)
    .map((value) => String(value).trim())
    .filter(Boolean);
  const series = new Map();

  for (const row of rows.slice(headerRowIndex + 1)) {
    const label = String(row[0] || "").trim();
    if (!label) {
      continue;
    }

    series.set(
      label,
      periods.map((period, index) => ({
        periodLabel: period,
        periodEnd: endOfYear(period),
        value: parseNumber(row[index + 1])
      }))
    );
  }

  return series;
}

function combineSeries(seriesList) {
  const byPeriod = new Map();

  for (const series of seriesList) {
    for (const point of series || []) {
      if (!point?.periodLabel || point.value === null) {
        continue;
      }

      const current = byPeriod.get(point.periodLabel) || {
        periodLabel: point.periodLabel,
        periodEnd: point.periodEnd,
        value: 0
      };
      current.value += point.value;
      byPeriod.set(point.periodLabel, current);
    }
  }

  return [...byPeriod.values()].sort((a, b) => a.periodLabel.localeCompare(b.periodLabel));
}

ensureCleanDir(canonicalDir);
ensureCleanDir(martsDir);

const localImmigrationHash = fileSha256(sourceFiles.localImmigration);
const localResettlementHash = fileSha256(sourceFiles.localResettlement);
const illegalEntryHash = fileSha256(sourceFiles.illegalEntry);
const safeLegalHash = fileSha256(sourceFiles.safeLegal);
const asylumClaimsHash = fileSha256(sourceFiles.asylumClaims);
const asylumAwaitingDecisionHash = fileSha256(sourceFiles.asylumAwaitingDecision);
const asylumOutcomeAnalysisHash = fileSha256(sourceFiles.asylumOutcomeAnalysis);
const asylumSupportHash = fileSha256(sourceFiles.asylumSupport);
const returnsHash = fileSha256(sourceFiles.returns);

const localImmigrationRows = readSheetRows(sourceFiles.localImmigration, "Reg_02");
const localImmigrationRegionalRows = readSheetRows(sourceFiles.localImmigration, "Reg_01");

const localSnapshotDate = parseSnapshotDateFromTitle(localImmigrationRows, "Reg_02");
const localSnapshotDateLong = formatSnapshotDateLong(localSnapshotDate);
const localResettlementRows = rowObjects(sourceFiles.localResettlement, "Data_Res_D01", 1);
const illegalEntryRows = rowObjects(sourceFiles.illegalEntry, "Data_IER_D01", 1);
const illegalBoatClaimRows = rowObjects(sourceFiles.illegalEntry, "Data_IER_D02", 1);
const illegalBoatDecisionRows = rowObjects(sourceFiles.illegalEntry, "Data_IER_D03", 1);
const safeLegalHumRows = readSheetRows(sourceFiles.safeLegal, "Hum_01");
const safeLegalResRows = readSheetRows(sourceFiles.safeLegal, "Res_01");
const safeLegalCommunityRows = readSheetRows(sourceFiles.safeLegal, "Res_02");
const safeLegalFamRows = readSheetRows(sourceFiles.safeLegal, "Fam_01");
const safeLegalUkrRows = readSheetRows(sourceFiles.safeLegal, "Ukr_01");
const asylumClaimsRows = rowObjects(sourceFiles.asylumClaims, "Data_Asy_D01", 1);
const asylumInitialDecisionRows = rowObjects(sourceFiles.asylumClaims, "Data_Asy_D02", 1);
const asylumAwaitingDecisionRows = rowObjects(sourceFiles.asylumAwaitingDecision, "Data_Asy_D03", 1);
const asylumOutcomeAnalysisRows = rowObjects(sourceFiles.asylumOutcomeAnalysis, "Data_Asy_D04", 1);

/**
 * Extraction date of the outcome analysis, parsed from the release's own Notes sheet.
 *
 * Needed because a cohort's return rate keeps rising for years after its claims are
 * decided: a refusal is settled long before the removal happens. So the honest question
 * is not "is the outcome known" (2021 is 99.6% known and still moving) but "has this
 * cohort had long enough". That requires knowing when the data was cut.
 *
 * Parsed, never written down. A hardcoded date is exactly what put a stale period label
 * on 200 pages before, and this one moves every edition.
 */
function readOutcomeExtractionYear(filePath) {
  const notes = readSheetRows(filePath, "Notes")
    .flat()
    .map((cell) => String(cell || ""));
  for (const note of notes) {
    const match = note.match(/latest case outcomes[^.]*?as at\s+(?:(\w+)\s+)?(\d{4})/i);
    if (match) return Number(match[2]);
  }
  throw new Error(
    `Could not find the "as at <date>" note in ${filePath}. The outcome analysis cannot ` +
      `be aged without it, and guessing would silently mislabel which cohorts are settled.`
  );
}

const outcomeExtractionYear = readOutcomeExtractionYear(sourceFiles.asylumOutcomeAnalysis);

/**
 * Years after the claim year before a cohort's return rate stops moving.
 *
 * Measured, not assumed: comparing the March 2026 edition against December 2025, every
 * cohort up to 2018 moved by less than 0.3pp in the quarter, while 2019 onward moved by
 * 0.7pp to 3.6pp. With a January 2026 extraction that puts the boundary at eight years,
 * and 2018 sits exactly on it.
 */
const RETURN_COHORT_SETTLED_AFTER_YEARS = 8;
const asylumSupportRows = rowObjects(sourceFiles.asylumSupport, "Data_Asy_D09", 1);
const returnsRows = rowObjects(sourceFiles.returns, "Data_Ret_D01", 1);

const observationRows = [];

const localAreas = localImmigrationRows
  .slice(2)
  .filter((row) => row[0] && row[2] && row[15] && row[15] !== "-")
  .map((row) => {
    const area = {
      areaCode: String(row[2]).trim(),
      areaName: String(row[0]).trim(),
      regionName: String(row[1]).trim(),
      countryName: inferCountryFromRow(row[1], row[2]),
      population: safeNumber(row[15]),
      homesForUkraineArrivals: safeNumber(row[3]),
      afghanProgrammePopulation: safeNumber(row[4]),
      afghanProgrammeTransitional: safeNumber(row[5]),
      afghanProgrammeLaHousing: safeNumber(row[6]),
      afghanProgrammePrsHousing: safeNumber(row[7]),
      supportedAsylum: safeNumber(row[8]),
      initialAccommodation: safeNumber(row[9]),
      dispersalAccommodation: safeNumber(row[10]),
      contingencyAccommodation: safeNumber(row[11]),
      otherAccommodation: safeNumber(row[12]),
      subsistenceOnly: safeNumber(row[13]),
      allThreePathwaysTotal: safeNumber(row[14]),
      shareOfPopulationPct: parseNumber(row[16]),
      snapshotDate: localSnapshotDate
    };

    area.homesForUkraineRate = area.population
      ? roundNumber((area.homesForUkraineArrivals / area.population) * 10000, 2)
      : null;
    area.afghanProgrammeRate = area.population
      ? roundNumber((area.afghanProgrammePopulation / area.population) * 10000, 2)
      : null;
    area.supportedAsylumRate = area.population
      ? roundNumber((area.supportedAsylum / area.population) * 10000, 2)
      : null;
    area.contingencyAccommodationRate = area.population
      ? roundNumber((area.contingencyAccommodation / area.population) * 10000, 2)
      : null;

    observationRows.push(
      makeObservation({
        metricId: "hfu_arrivals",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: area.areaCode,
        areaName: area.areaName,
        areaType: "local_authority",
        countryName: area.countryName,
        periodStart: "2025-01-01",
        periodEnd: area.snapshotDate,
        periodType: "year",
        value: area.homesForUkraineArrivals,
        notes: `Snapshot of arrivals as at ${localSnapshotDateLong}.`,
        fileHash: localImmigrationHash
      }),
      makeObservation({
        metricId: "hfu_arrivals_rate",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: area.areaCode,
        areaName: area.areaName,
        areaType: "local_authority",
        countryName: area.countryName,
        periodStart: "2025-01-01",
        periodEnd: area.snapshotDate,
        periodType: "year",
        value: area.homesForUkraineRate ?? 0,
        notes: "Derived from arrivals and local population.",
        fileHash: localImmigrationHash
      }),
      makeObservation({
        metricId: "afghan_resettlement_programme_population",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: area.areaCode,
        areaName: area.areaName,
        areaType: "local_authority",
        countryName: area.countryName,
        periodStart: "2025-01-01",
        periodEnd: area.snapshotDate,
        periodType: "year",
        value: area.afghanProgrammePopulation,
        notes: `Population snapshot as at ${localSnapshotDateLong}.`,
        fileHash: localImmigrationHash
      }),
      makeObservation({
        metricId: "afghan_resettlement_programme_population_rate",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: area.areaCode,
        areaName: area.areaName,
        areaType: "local_authority",
        countryName: area.countryName,
        periodStart: "2025-01-01",
        periodEnd: area.snapshotDate,
        periodType: "year",
        value: area.afghanProgrammeRate ?? 0,
        notes: "Derived from Afghan Resettlement Programme population and local population.",
        fileHash: localImmigrationHash
      }),
      makeObservation({
        metricId: "asylum_supported_people",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: area.areaCode,
        areaName: area.areaName,
        areaType: "local_authority",
        countryName: area.countryName,
        periodStart: "2025-01-01",
        periodEnd: area.snapshotDate,
        periodType: "year",
        value: area.supportedAsylum,
        notes: `Population snapshot as at ${localSnapshotDateLong}.`,
        fileHash: localImmigrationHash
      }),
      makeObservation({
        metricId: "asylum_supported_people_rate",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: area.areaCode,
        areaName: area.areaName,
        areaType: "local_authority",
        countryName: area.countryName,
        periodStart: "2025-01-01",
        periodEnd: area.snapshotDate,
        periodType: "year",
        value: area.supportedAsylumRate ?? 0,
        notes: "Derived from supported asylum count and local population.",
        fileHash: localImmigrationHash
      }),
      makeObservation({
        metricId: "asylum_contingency_accommodation_people",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: area.areaCode,
        areaName: area.areaName,
        areaType: "local_authority",
        countryName: area.countryName,
        periodStart: "2025-01-01",
        periodEnd: area.snapshotDate,
        periodType: "year",
        value: area.contingencyAccommodation,
        notes: `Contingency accommodation snapshot as at ${localSnapshotDateLong}.`,
        fileHash: localImmigrationHash
      })
    );

    return area;
  });

const regionalRows = localImmigrationRegionalRows
  .slice(2)
  .filter((row) => row[0])
  .map((row) => {
    const areaCode = areaCodeForRegionalRow(String(row[0]).trim());
    const areaName = String(row[0]).trim();
    const countryName = inferCountryFromRow(areaName);

    const record = {
      areaCode,
      areaName,
      areaType: inferAreaType(areaCode, areaName),
      countryName,
      homesForUkraineArrivals: safeNumber(row[1]),
      afghanProgrammePopulation: safeNumber(row[2]),
      supportedAsylum: safeNumber(row[6]),
      contingencyAccommodation: safeNumber(row[9]),
      allThreePathwaysTotal: safeNumber(row[12]),
      population: safeNumber(row[13]),
      percentageOfPopulation: parseNumber(row[14]),
      snapshotDate: localSnapshotDate
    };

    observationRows.push(
      makeObservation({
        metricId: "hfu_arrivals",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: record.areaCode,
        areaName: record.areaName,
        areaType: record.areaType,
        countryName: record.countryName,
        periodStart: "2025-01-01",
        periodEnd: record.snapshotDate,
        periodType: "year",
        value: record.homesForUkraineArrivals,
        notes: `Regional or country snapshot as at ${localSnapshotDateLong}.`,
        fileHash: localImmigrationHash
      }),
      makeObservation({
        metricId: "afghan_resettlement_programme_population",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: record.areaCode,
        areaName: record.areaName,
        areaType: record.areaType,
        countryName: record.countryName,
        periodStart: "2025-01-01",
        periodEnd: record.snapshotDate,
        periodType: "year",
        value: record.afghanProgrammePopulation,
        notes: `Regional or country snapshot as at ${localSnapshotDateLong}.`,
        fileHash: localImmigrationHash
      }),
      makeObservation({
        metricId: "asylum_supported_people",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: record.areaCode,
        areaName: record.areaName,
        areaType: record.areaType,
        countryName: record.countryName,
        periodStart: "2025-01-01",
        periodEnd: record.snapshotDate,
        periodType: "year",
        value: record.supportedAsylum,
        notes: `Regional or country snapshot as at ${localSnapshotDateLong}.`,
        fileHash: localImmigrationHash
      }),
      makeObservation({
        metricId: "asylum_contingency_accommodation_people",
        sourceMetaEntry: sourceMeta.localImmigration,
        areaCode: record.areaCode,
        areaName: record.areaName,
        areaType: record.areaType,
        countryName: record.countryName,
        periodStart: "2025-01-01",
        periodEnd: record.snapshotDate,
        periodType: "year",
        value: record.contingencyAccommodation,
        notes: `Regional or country snapshot as at ${localSnapshotDateLong}.`,
        fileHash: localImmigrationHash
      })
    );

    return record;
  });

const resettlementSeriesByArea = new Map();

for (const row of localResettlementRows) {
  const areaCode = String(row["LAD Code"] || "").trim();
  const areaName = String(row["Local Authority"] || "").trim();
  const scheme = String(row["Resettlement Scheme"] || "").trim();
  const quarter = String(row["Quarter"] || "").trim();
  const persons = parseNumber(row["Persons"]);

  if (!areaCode || !areaName || !scheme || !quarter || persons === null) {
    continue;
  }

  const routeFamily = classifyResettlementFamily(scheme);
  const communitySponsorship = String(row["Community Sponsorship"] || "").trim();
  const key = `${areaCode}|${quarter}`;
  const seriesRow = resettlementSeriesByArea.get(key) || {
    areaCode,
    areaName,
    regionName: String(row["UK Region"] || "").trim(),
    countryName: inferCountryFromRow(row["UK Region"], areaCode),
    quarter,
    periodStart: startOfQuarter(quarter),
    periodEnd: endOfQuarter(quarter),
    resettled_refugees_arrivals: 0,
    afghan_resettlement_programme_arrivals: 0,
    uk_resettlement_scheme_arrivals: 0,
    community_sponsorship_arrivals: 0
  };

  seriesRow.resettled_refugees_arrivals += persons;

  if (routeFamily === "afghan_resettlement_programme") {
    seriesRow.afghan_resettlement_programme_arrivals += persons;
  }

  if (routeFamily === "uk_resettlement_scheme") {
    seriesRow.uk_resettlement_scheme_arrivals += persons;
  }

  if (communitySponsorship !== "N/A") {
    seriesRow.community_sponsorship_arrivals += persons;
  }

  resettlementSeriesByArea.set(key, seriesRow);
}

const resettlementObservations = [];

for (const row of [...resettlementSeriesByArea.values()]) {
  for (const metricId of [
    "resettled_refugees_arrivals",
    "afghan_resettlement_programme_arrivals",
    "uk_resettlement_scheme_arrivals",
    "community_sponsorship_arrivals"
  ]) {
    resettlementObservations.push(
      makeObservation({
        metricId,
        sourceMetaEntry: sourceMeta.localResettlement,
        areaCode: row.areaCode,
        areaName: row.areaName,
        areaType: "local_authority",
        countryName: row.countryName,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        periodType: "quarter",
        value: row[metricId],
        notes: `Quarterly arrivals aggregated from ${row.quarter}.`,
        fileHash: localResettlementHash
      })
    );
  }
}

observationRows.push(...resettlementObservations);

const illegalEntryByYearMethod = new Map();
const illegalEntryByQuarterMethod = new Map();
const illegalEntryQuartersByYear = new Map();

for (const row of illegalEntryRows) {
  const year = String(row.Year || "").trim();
  const quarter = String(row.Quarter || "").trim();
  const method = String(row["Method of entry"] || "").trim();
  const value = parseNumber(row["Number of detections"]);
  if (!year || !method || value === null) {
    continue;
  }

  const key = `${year}|${method}`;
  illegalEntryByYearMethod.set(key, (illegalEntryByYearMethod.get(key) || 0) + value);

  if (quarter) {
    const quarterKey = `${quarter}|${method}`;
    illegalEntryByQuarterMethod.set(
      quarterKey,
      (illegalEntryByQuarterMethod.get(quarterKey) || 0) + value
    );

    if (!illegalEntryQuartersByYear.has(year)) {
      illegalEntryQuartersByYear.set(year, new Set());
    }
    illegalEntryQuartersByYear.get(year).add(quarter);
  }
}

// The final calendar year of a quarterly release is nearly always incomplete:
// the year ending March 2026 edition carries only 2026 Q1. Labelling that bare
// "2026" put one quarter on a chart beside four-quarter years and read as an
// 89% collapse in small boat arrivals. Partial years now say so, matching the
// "2026 (Q1 only)" convention the Home Office uses in its own summary tables.
function describeYearCoverage(year) {
  const quarters = [...(illegalEntryQuartersByYear.get(year) ?? [])]
    .map((quarter) => quarter.replace(`${year} `, ""))
    .sort();

  if (quarters.length === 0 || quarters.length >= 4) {
    return { label: year, isComplete: quarters.length >= 4, quarters };
  }

  const span = quarters.length === 1 ? quarters[0] : `${quarters[0]} to ${quarters.at(-1)}`;
  return { label: `${year} (${span} only)`, isComplete: false, quarters };
}

const illegalEntryTotalsByYear = new Map();
const smallBoatArrivalsSeries = [];

for (const [key, value] of [...illegalEntryByYearMethod.entries()].sort()) {
  const [year, method] = key.split("|");
  illegalEntryTotalsByYear.set(year, (illegalEntryTotalsByYear.get(year) || 0) + value);

  if (method === "Small boat arrivals") {
    const coverage = describeYearCoverage(year);
    smallBoatArrivalsSeries.push({
      periodLabel: coverage.label,
      periodEnd: endOfYear(year),
      value,
      isPartialYear: !coverage.isComplete
    });

    observationRows.push(
      makeObservation({
        metricId: "small_boat_arrivals",
        sourceMetaEntry: sourceMeta.illegalEntry,
        areaCode: "UK",
        areaName: "United Kingdom",
        areaType: "country",
        countryName: "United Kingdom",
        periodStart: startOfYear(year),
        periodEnd: endOfYear(year),
        periodType: "year",
        value,
        notes: "Detected arrivals via small boat.",
        fileHash: illegalEntryHash
      })
    );
  }
}

// A trailing four-quarter window gives a like-for-like figure to headline when
// the newest calendar year is incomplete, and matches the "year ending March"
// framing every other route family on the dashboard already uses.
const illegalEntryQuartersInOrder = [
  ...new Set([...illegalEntryByQuarterMethod.keys()].map((key) => key.split("|")[0]))
].sort();
const illegalEntryLatestWindow = illegalEntryQuartersInOrder.slice(-4);

function sumWindowByMethod(method) {
  return illegalEntryLatestWindow.reduce(
    (total, quarter) => total + (illegalEntryByQuarterMethod.get(`${quarter}|${method}`) || 0),
    0
  );
}

const illegalEntryWindowLabel = illegalEntryLatestWindow.length === 4
  ? `Year ending ${
      ["March", "June", "September", "December"][
        Number(illegalEntryLatestWindow.at(-1).split("Q")[1]) - 1
      ]
    } ${illegalEntryLatestWindow.at(-1).split(" ")[0]}`
  : (smallBoatArrivalsSeries.at(-1)?.periodLabel ?? "Latest period");

const illegalEntryMethodsLatestWindow = [
  ...new Set([...illegalEntryByYearMethod.keys()].map((key) => key.split("|")[1]))
]
  .map((method) => ({ method, value: sumWindowByMethod(method) }))
  .filter((row) => row.value > 0)
  .sort((a, b) => b.value - a.value);

const smallBoatArrivalsLatestWindow = sumWindowByMethod("Small boat arrivals");
const illegalEntryTotalLatestWindow = illegalEntryMethodsLatestWindow.reduce(
  (total, row) => total + row.value,
  0
);

for (const [year, value] of [...illegalEntryTotalsByYear.entries()].sort()) {
  observationRows.push(
    makeObservation({
      metricId: "illegal_entry_route_arrivals",
      sourceMetaEntry: sourceMeta.illegalEntry,
      areaCode: "UK",
      areaName: "United Kingdom",
      areaType: "country",
      countryName: "United Kingdom",
      periodStart: startOfYear(year),
      periodEnd: endOfYear(year),
      periodType: "year",
      value,
      notes: "Detected arrivals across all recorded illegal entry routes.",
      fileHash: illegalEntryHash
    })
  );

  const smallBoatValue =
    smallBoatArrivalsSeries.find((point) => point.periodLabel === year)?.value ?? 0;
  const share = value ? roundNumber((smallBoatValue / value) * 100, 1) : 0;

  observationRows.push(
    makeObservation({
      metricId: "small_boat_arrivals_share_illegal_routes",
      sourceMetaEntry: sourceMeta.illegalEntry,
      areaCode: "UK",
      areaName: "United Kingdom",
      areaType: "country",
      countryName: "United Kingdom",
      periodStart: startOfYear(year),
      periodEnd: endOfYear(year),
      periodType: "year",
      value: share,
      notes: "Derived share of illegal entry route detections arriving by small boat.",
      fileHash: illegalEntryHash
    })
  );
}

const smallBoatAsylumClaimsByYear = new Map();

for (const row of illegalBoatClaimRows) {
  const year = String(row.Year || "").trim();
  const claimStatus = String(row["Asylum claim"] || "").trim();
  const value = parseNumber(row.Arrivals);
  if (!year || !claimStatus || value === null) {
    continue;
  }

  if (claimStatus === "Asylum claim raised") {
    smallBoatAsylumClaimsByYear.set(year, (smallBoatAsylumClaimsByYear.get(year) || 0) + value);
  }
}

for (const [year, value] of [...smallBoatAsylumClaimsByYear.entries()].sort()) {
  observationRows.push(
    makeObservation({
      metricId: "small_boat_asylum_claims",
      sourceMetaEntry: sourceMeta.illegalEntry,
      areaCode: "UK",
      areaName: "United Kingdom",
      areaType: "country",
      countryName: "United Kingdom",
      periodStart: startOfYear(year),
      periodEnd: endOfYear(year),
      periodType: "year",
      value,
      notes: "Asylum claims raised by arrival date for people arriving by small boat.",
      fileHash: illegalEntryHash
    })
  );
}

const smallBoatOutcomesByYear = new Map();

for (const row of illegalBoatDecisionRows) {
  const year = String(row.Year || "").trim();
  const outcomeGroup = String(row["Asylum Case Outcome Group"] || "").trim();
  const value = parseNumber(row.Outcomes);
  if (!year || !outcomeGroup || value === null) {
    continue;
  }

  const key = `${year}|${outcomeGroup}`;
  smallBoatOutcomesByYear.set(key, (smallBoatOutcomesByYear.get(key) || 0) + value);
}

const latestSmallBoatOutcomeYear = [...new Set([...smallBoatOutcomesByYear.keys()].map((key) => key.split("|")[0]))]
  .sort()
  .at(-1);

const smallBoatDecisionGroupsLatestYear = [...smallBoatOutcomesByYear.entries()]
  .filter(([key]) => key.startsWith(`${latestSmallBoatOutcomeYear}|`))
  .map(([key, value]) => ({
    outcomeGroup: key.split("|")[1],
    value
  }))
  .sort((a, b) => b.value - a.value);

const asylumClaimsByQuarter = new Map();
const asylumInitialDecisionsByQuarter = new Map();
const asylumInitialGrantDecisionsByQuarter = new Map();
const asylumInitialRefusalsByQuarter = new Map();
const asylumInitialWithdrawalsByQuarter = new Map();
const asylumInitialAdministrativeOutcomesByQuarter = new Map();
const returnsTotalByQuarter = new Map();
const returnsEnforcedByQuarter = new Map();
const returnsVoluntaryByQuarter = new Map();
const returnsRefusedEntryByQuarter = new Map();

for (const row of asylumClaimsRows) {
  const quarter = String(row.Quarter || "").trim();
  const claims = parseNumber(row.Claims);
  if (!quarter || claims === null) {
    continue;
  }

  asylumClaimsByQuarter.set(quarter, (asylumClaimsByQuarter.get(quarter) || 0) + claims);
}

for (const row of asylumInitialDecisionRows) {
  const quarter = String(row.Quarter || "").trim();
  const decisions = parseNumber(row.Decisions);
  const outcomeGroup = String(row["Case outcome group"] || "").trim();
  if (!quarter || decisions === null) {
    continue;
  }

  asylumInitialDecisionsByQuarter.set(quarter, (asylumInitialDecisionsByQuarter.get(quarter) || 0) + decisions);

  if (outcomeGroup === "Grant of Protection" || outcomeGroup === "Grant of Other Leave") {
    asylumInitialGrantDecisionsByQuarter.set(
      quarter,
      (asylumInitialGrantDecisionsByQuarter.get(quarter) || 0) + decisions
    );
  }

  if (outcomeGroup === "Refused") {
    asylumInitialRefusalsByQuarter.set(quarter, (asylumInitialRefusalsByQuarter.get(quarter) || 0) + decisions);
  }

  if (outcomeGroup === "Withdrawn") {
    asylumInitialWithdrawalsByQuarter.set(quarter, (asylumInitialWithdrawalsByQuarter.get(quarter) || 0) + decisions);
  }

  if (outcomeGroup === "Administrative Outcome") {
    asylumInitialAdministrativeOutcomesByQuarter.set(
      quarter,
      (asylumInitialAdministrativeOutcomesByQuarter.get(quarter) || 0) + decisions
    );
  }
}

const asylumAwaitingDecisionByDate = new Map();

for (const row of asylumAwaitingDecisionRows) {
  const dateLabel = String(row["Date (as at...)"] || "").trim();
  const stage = String(row["Application stage"] || "").trim();
  const claims = parseNumber(row.Claims);
  if (!dateLabel || claims === null || stage !== "Pending initial decision") {
    continue;
  }

  asylumAwaitingDecisionByDate.set(dateLabel, (asylumAwaitingDecisionByDate.get(dateLabel) || 0) + claims);
}

const asylumSupportByDate = new Map();
const asylumSupportAccommodationByDate = new Map();

for (const row of asylumSupportRows) {
  const dateLabel = String(row["Date (as at…)"] || row["Date (as at...)"] || "").trim();
  const accommodationType = String(row["Accommodation Type"] || "").trim();
  const people = parseNumber(row.People);
  if (!dateLabel || people === null) {
    continue;
  }

  asylumSupportByDate.set(dateLabel, (asylumSupportByDate.get(dateLabel) || 0) + people);

  const key = `${dateLabel}|${accommodationType}`;
  asylumSupportAccommodationByDate.set(key, (asylumSupportAccommodationByDate.get(key) || 0) + people);
}

for (const row of returnsRows) {
  const quarter = String(row.Quarter || "").trim();
  const returnTypeGroup = String(row["Return type group"] || "").trim();
  const returns = parseNumber(row["Number of returns"]);
  if (!quarter || returns === null) {
    continue;
  }

  returnsTotalByQuarter.set(quarter, (returnsTotalByQuarter.get(quarter) || 0) + returns);

  if (returnTypeGroup === "Enforced return") {
    returnsEnforcedByQuarter.set(quarter, (returnsEnforcedByQuarter.get(quarter) || 0) + returns);
  }

  if (returnTypeGroup === "Voluntary return") {
    returnsVoluntaryByQuarter.set(quarter, (returnsVoluntaryByQuarter.get(quarter) || 0) + returns);
  }

  if (returnTypeGroup === "Refused entry at port and subsequently departed") {
    returnsRefusedEntryByQuarter.set(quarter, (returnsRefusedEntryByQuarter.get(quarter) || 0) + returns);
  }
}

const asylumOutcomeByClaimYear = new Map();

for (const row of asylumOutcomeAnalysisRows) {
  const claimYear = String(row["Year of Claim"] || "").trim();
  const totalClaims = parseNumber(row.Claims);
  if (!claimYear || totalClaims === null) {
    continue;
  }

  const current = asylumOutcomeByClaimYear.get(claimYear) || {
    claimYear,
    totalClaims: 0,
    initialDecisions: 0,
    initialGrantProtection: 0,
    initialGrantOtherLeave: 0,
    initialRefusals: 0,
    initialWithdrawals: 0,
    initialAdministrative: 0,
    initialNotYetKnown: 0,
    latestGrantProtection: 0,
    latestGrantOtherLeave: 0,
    latestRefusals: 0,
    latestWithdrawals: 0,
    latestAdministrative: 0,
    latestNotYetKnown: 0,
    enforcedReturns: 0,
    voluntaryReturns: 0
  };

  current.totalClaims += totalClaims;
  current.initialDecisions += safeNumber(row["Initial Decisions"]);
  current.initialGrantProtection += safeNumber(row["Initial: Grants of Protection"]);
  current.initialGrantOtherLeave += safeNumber(row["Initial: Grants of Other Leave"]);
  current.initialRefusals += safeNumber(row["Initial: Refusals"]);
  current.initialWithdrawals += safeNumber(row["Initial: Withdrawals"]);
  current.enforcedReturns += safeNumber(row["Enforced Returns"]);
  current.voluntaryReturns += safeNumber(row["Voluntary Returns"]);
  current.initialAdministrative += safeNumber(row["Initial: Administrative Outcomes"]);
  current.initialNotYetKnown += safeNumber(row["Initial: Not yet known"]);
  current.latestGrantProtection += safeNumber(row["Latest: Grants of Protection"]);
  current.latestGrantOtherLeave += safeNumber(row["Latest: Grants of Other Leave"]);
  current.latestRefusals += safeNumber(row["Latest: Refusals"]);
  current.latestWithdrawals += safeNumber(row["Latest: Withdrawals"]);
  current.latestAdministrative += safeNumber(row["Latest: Administrative Outcomes"]);
  current.latestNotYetKnown += safeNumber(row["Latest: Not yet known"]);

  asylumOutcomeByClaimYear.set(claimYear, current);
}

const asylumClaimsQuarterlySeries = [...asylumClaimsByQuarter.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfQuarter(periodLabel),
    periodEnd: endOfQuarter(periodLabel),
    value
  }));

const asylumInitialDecisionsQuarterlySeries = [...asylumInitialDecisionsByQuarter.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfQuarter(periodLabel),
    periodEnd: endOfQuarter(periodLabel),
    value
  }));

const asylumInitialGrantQuarterlySeries = [...asylumInitialGrantDecisionsByQuarter.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfQuarter(periodLabel),
    periodEnd: endOfQuarter(periodLabel),
    value
  }));

const asylumInitialRefusalQuarterlySeries = [...asylumInitialRefusalsByQuarter.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfQuarter(periodLabel),
    periodEnd: endOfQuarter(periodLabel),
    value
  }));

const asylumInitialWithdrawalQuarterlySeries = [...asylumInitialWithdrawalsByQuarter.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfQuarter(periodLabel),
    periodEnd: endOfQuarter(periodLabel),
    value
  }));

const asylumInitialAdministrativeQuarterlySeries = [...asylumInitialAdministrativeOutcomesByQuarter.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfQuarter(periodLabel),
    periodEnd: endOfQuarter(periodLabel),
    value
  }));

const asylumAwaitingDecisionQuarterlySeries = [...asylumAwaitingDecisionByDate.entries()]
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfDateLabel(periodLabel),
    periodEnd: endOfDateLabel(periodLabel),
    quarterLabel: quarterLabelForDateLabel(periodLabel),
    value
  }))
  .sort((left, right) => left.periodEnd.localeCompare(right.periodEnd));

const asylumSupportQuarterlySeries = [...asylumSupportByDate.entries()]
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfDateLabel(periodLabel),
    periodEnd: endOfDateLabel(periodLabel),
    quarterLabel: quarterLabelForDateLabel(periodLabel),
    value
  }))
  .sort((left, right) => left.periodEnd.localeCompare(right.periodEnd));

const returnsTotalQuarterlySeries = [...returnsTotalByQuarter.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfQuarter(periodLabel),
    periodEnd: endOfQuarter(periodLabel),
    value
  }));

const returnsEnforcedQuarterlySeries = [...returnsEnforcedByQuarter.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfQuarter(periodLabel),
    periodEnd: endOfQuarter(periodLabel),
    value
  }));

const returnsVoluntaryQuarterlySeries = [...returnsVoluntaryByQuarter.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfQuarter(periodLabel),
    periodEnd: endOfQuarter(periodLabel),
    value
  }));

const returnsRefusedEntryQuarterlySeries = [...returnsRefusedEntryByQuarter.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([periodLabel, value]) => ({
    periodLabel,
    periodStart: startOfQuarter(periodLabel),
    periodEnd: endOfQuarter(periodLabel),
    value
  }));

const supportAccommodationSeriesByType = new Map();

for (const [key, value] of asylumSupportAccommodationByDate.entries()) {
  const [periodLabel, accommodationType] = key.split("|");
  const series = supportAccommodationSeriesByType.get(accommodationType) || [];
  series.push({
    periodLabel,
    periodStart: startOfDateLabel(periodLabel),
    periodEnd: endOfDateLabel(periodLabel),
    quarterLabel: quarterLabelForDateLabel(periodLabel),
    value
  });
  supportAccommodationSeriesByType.set(accommodationType, series);
}

for (const series of supportAccommodationSeriesByType.values()) {
  series.sort((left, right) => left.periodEnd.localeCompare(right.periodEnd));
}

const asylumOutcomeCohorts = [...asylumOutcomeByClaimYear.values()]
  .sort((left, right) => Number(left.claimYear) - Number(right.claimYear))
  .map((row) => {
    const initialGrantCount = row.initialGrantProtection + row.initialGrantOtherLeave;
    const latestGrantCount = row.latestGrantProtection + row.latestGrantOtherLeave;
    const initialSubstantiveOutcomes = initialGrantCount + row.initialRefusals;
    const latestSubstantiveOutcomes = latestGrantCount + row.latestRefusals;
    const latestOutcomeKnownCount =
      latestGrantCount + row.latestRefusals + row.latestWithdrawals + row.latestAdministrative;

    return {
      claimYear: row.claimYear,
      totalClaims: row.totalClaims,
      initialDecisions: row.initialDecisions,
      initialGrantCount,
      initialRefusalCount: row.initialRefusals,
      initialWithdrawalCount: row.initialWithdrawals,
      initialAdministrativeCount: row.initialAdministrative,
      latestGrantCount,
      latestRefusalCount: row.latestRefusals,
      latestWithdrawalCount: row.latestWithdrawals,
      latestAdministrativeCount: row.latestAdministrative,
      initialGrantRatePct: initialSubstantiveOutcomes
        ? roundNumber((initialGrantCount / initialSubstantiveOutcomes) * 100, 1)
        : null,
      latestGrantRatePct: latestSubstantiveOutcomes
        ? roundNumber((latestGrantCount / latestSubstantiveOutcomes) * 100, 1)
        : null,
      latestOutcomeKnownPct: row.totalClaims
        ? roundNumber((latestOutcomeKnownCount / row.totalClaims) * 100, 1)
        : null,

      // Returns for this claim cohort, and the only asylum-specific return rate the
      // Home Office publishes. The quarterly Returns tables carry no asylum dimension at
      // all: nationality, destination, return type, sex, age and an offender flag, and
      // nothing that says whether the person ever claimed asylum. So "refusals against
      // returns" computed from those tables compares two different populations.
      //
      // DENOMINATOR. Refusals plus withdrawals, not refusals alone. A withdrawn claim
      // still leaves someone liable to removal, and in the 2022 cohort the Albania
      // returns were overwhelmingly people who withdrew: measured against refusals only
      // that cohort returns 179% of the people it refused, which is impossible.
      // Administrative outcomes are excluded because they are void, suspended and
      // deceased cases, which are not returnable.
      enforcedReturns: row.enforcedReturns,
      voluntaryReturns: row.voluntaryReturns,
      returnsCount: row.enforcedReturns + row.voluntaryReturns,
      returnableOutcomeCount: row.latestRefusals + row.latestWithdrawals,
      returnRatePct:
        row.latestRefusals + row.latestWithdrawals
          ? roundNumber(
              ((row.enforcedReturns + row.voluntaryReturns) /
                (row.latestRefusals + row.latestWithdrawals)) *
                100,
              1
            )
          : null,

      // Whether the cohort has had long enough for its returns to complete. The Home
      // Office warns this dataset "is not comparable over time" because recent cohorts
      // are still progressing; this is that warning made machine-readable, so a page
      // cannot accidentally rank a 2024 cohort against a 2010 one.
      cohortAgeYears: outcomeExtractionYear - Number(row.claimYear),
      returnsSettled:
        outcomeExtractionYear - Number(row.claimYear) >= RETURN_COHORT_SETTLED_AFTER_YEARS
    };
  });

for (const point of asylumClaimsQuarterlySeries) {
  observationRows.push(
    makeObservation({
      metricId: "asylum_claims_total",
      sourceMetaEntry: sourceMeta.asylumClaims,
      areaCode: "UK",
      areaName: "United Kingdom",
      areaType: "country",
      countryName: "United Kingdom",
      periodStart: point.periodStart,
      periodEnd: point.periodEnd,
      periodType: "quarter",
      value: point.value,
      notes: "Quarterly asylum claims lodged in the UK.",
      fileHash: asylumClaimsHash
    })
  );
}

for (const { metricId, series } of [
  { metricId: "asylum_initial_decisions_total", series: asylumInitialDecisionsQuarterlySeries },
  { metricId: "asylum_initial_grants", series: asylumInitialGrantQuarterlySeries },
  { metricId: "asylum_initial_refusals", series: asylumInitialRefusalQuarterlySeries },
  { metricId: "asylum_initial_withdrawals", series: asylumInitialWithdrawalQuarterlySeries },
  { metricId: "asylum_initial_administrative_outcomes", series: asylumInitialAdministrativeQuarterlySeries }
]) {
  for (const point of series) {
    observationRows.push(
      makeObservation({
        metricId,
        sourceMetaEntry: sourceMeta.asylumClaims,
        areaCode: "UK",
        areaName: "United Kingdom",
        areaType: "country",
        countryName: "United Kingdom",
        periodStart: point.periodStart,
        periodEnd: point.periodEnd,
        periodType: "quarter",
        value: point.value,
        notes: "Quarterly initial-decision series derived from the asylum claims dataset.",
        fileHash: asylumClaimsHash
      })
    );
  }
}

// Appeal-stage observations now come from the MOJ tribunal pipeline
// (scripts/transform/transform-tribunals.mjs), which writes them under fttiac_* metric ids.
// The Home Office asylum-appeals-lodged dataset it replaced was discontinued after 2023 Q1.

for (const point of asylumAwaitingDecisionQuarterlySeries) {
  observationRows.push(
    makeObservation({
      metricId: "asylum_claims_awaiting_initial_decision",
      sourceMetaEntry: sourceMeta.asylumAwaitingDecision,
      areaCode: "UK",
      areaName: "United Kingdom",
      areaType: "country",
      countryName: "United Kingdom",
      periodStart: point.periodStart,
      periodEnd: point.periodEnd,
      periodType: "quarter",
      value: point.value,
      notes: "Quarter-end stock of asylum claims pending an initial decision.",
      fileHash: asylumAwaitingDecisionHash
    })
  );
}

for (const point of asylumSupportQuarterlySeries) {
  observationRows.push(
    makeObservation({
      metricId: "asylum_support_total",
      sourceMetaEntry: sourceMeta.asylumSupport,
      areaCode: "UK",
      areaName: "United Kingdom",
      areaType: "country",
      countryName: "United Kingdom",
      periodStart: point.periodStart,
      periodEnd: point.periodEnd,
      periodType: "quarter",
      value: point.value,
      notes: "Quarter-end stock of asylum seekers in receipt of Home Office support.",
      fileHash: asylumSupportHash
    })
  );
}

for (const [metricId, accommodationType] of [
  ["asylum_support_hotel_accommodation", "Contingency Accommodation - Hotel"],
  ["asylum_support_contingency_other", "Contingency Accommodation - Other"],
  ["asylum_support_dispersal_accommodation", "Dispersal Accommodation"],
  ["asylum_support_initial_accommodation", "Initial Accommodation"],
  ["asylum_support_other_accommodation", "Other Accommodation"],
  ["asylum_support_subsistence_only", "Subsistence Only"]
]) {
  for (const point of supportAccommodationSeriesByType.get(accommodationType) || []) {
    observationRows.push(
      makeObservation({
        metricId,
        sourceMetaEntry: sourceMeta.asylumSupport,
        areaCode: "UK",
        areaName: "United Kingdom",
        areaType: "country",
        countryName: "United Kingdom",
        periodStart: point.periodStart,
        periodEnd: point.periodEnd,
        periodType: "quarter",
        value: point.value,
        notes: `${accommodationType} within the asylum support stock.`,
        fileHash: asylumSupportHash
      })
    );
  }
}

for (const { metricId, series, notes } of [
  {
    metricId: "returns_total",
    series: returnsTotalQuarterlySeries,
    notes: "Quarterly all-returns series. This is broader than asylum-only returns."
  },
  {
    metricId: "returns_enforced",
    series: returnsEnforcedQuarterlySeries,
    notes: "Quarterly enforced returns within the all-returns series."
  },
  {
    metricId: "returns_voluntary",
    series: returnsVoluntaryQuarterlySeries,
    notes: "Quarterly voluntary returns within the all-returns series."
  },
  {
    metricId: "returns_refused_entry_departed",
    series: returnsRefusedEntryQuarterlySeries,
    notes: "Quarterly refused-entry departures within the all-returns series."
  }
]) {
  for (const point of series) {
    observationRows.push(
      makeObservation({
        metricId,
        sourceMetaEntry: sourceMeta.returns,
        areaCode: "UK",
        areaName: "United Kingdom",
        areaType: "country",
        countryName: "United Kingdom",
        periodStart: point.periodStart,
        periodEnd: point.periodEnd,
        periodType: "quarter",
        value: point.value,
        notes,
        fileHash: returnsHash
      })
    );
  }
}

for (const cohort of asylumOutcomeCohorts) {
  if (cohort.initialGrantRatePct !== null) {
    observationRows.push(
      makeObservation({
        metricId: "asylum_initial_grant_rate_pct",
        sourceMetaEntry: sourceMeta.asylumOutcomeAnalysis,
        areaCode: "UK",
        areaName: "United Kingdom",
        areaType: "country",
        countryName: "United Kingdom",
        periodStart: startOfYear(cohort.claimYear),
        periodEnd: endOfYear(cohort.claimYear),
        periodType: "year",
        value: cohort.initialGrantRatePct,
        notes: "Estimated initial grant rate by claim-year cohort.",
        fileHash: asylumOutcomeAnalysisHash
      })
    );
  }

  if (cohort.latestGrantRatePct !== null) {
    observationRows.push(
      makeObservation({
        metricId: "asylum_latest_grant_rate_pct",
        sourceMetaEntry: sourceMeta.asylumOutcomeAnalysis,
        areaCode: "UK",
        areaName: "United Kingdom",
        areaType: "country",
        countryName: "United Kingdom",
        periodStart: startOfYear(cohort.claimYear),
        periodEnd: endOfYear(cohort.claimYear),
        periodType: "year",
        value: cohort.latestGrantRatePct,
        notes: "Estimated latest grant rate by claim-year cohort.",
        fileHash: asylumOutcomeAnalysisHash
      })
    );
  }
}

const humSeries = extractYearSeries(safeLegalHumRows, 8);
const resSeries = extractYearSeries(safeLegalResRows, 5);
const communitySeries = extractYearSeries(safeLegalCommunityRows, 5);
const famSeries = extractYearSeries(safeLegalFamRows, 4);
const ukrSeries = extractYearSeries(safeLegalUkrRows, 6);

const totalResettledSeries = (resSeries.get("Total Resettled") || []).filter((point) => point.value !== null);
const ukResettlementFamilySeries = combineSeries([
  resSeries.get("UK Resettlement Scheme"),
  resSeries.get("Mandate Scheme"),
  resSeries.get("Vulnerable Children's Resettlement Scheme"),
  resSeries.get("Vulnerable Persons Resettlement Scheme"),
  resSeries.get("Gateway Protection Programme")
]);
const communitySponsorshipYearlySeries = (communitySeries.get("Total Community Sponsorship arrivals") || [])
  .filter((point) => /^\d{4}$/.test(point.periodLabel) && point.value !== null);
const communitySponsorshipCumulative =
  (communitySeries.get("Total Community Sponsorship arrivals") || []).find(
    (point) => point.periodLabel === "2014 - 2025"
  )?.value ?? null;

// Most of this total is not an arrival.
//
// Hum_01 splits its own total into "out of country grants", which are people offered a
// route from outside the UK, and "in country grants", which the Home Office's notes
// define as "those granted extensions within the UK: Ukraine Extension Schemes grants and
// BN(O) Route extension grants". For the year ending March 2026 that split is 43,620
// against 147,189: 77 per cent of the headline is an extension for someone already here.
//
// It is also what the apparent surge is made of. The total went 74,953 to 190,809 in a
// year, and in-country grants went 16,494 to 147,189 over the same period as the Ukraine
// Permission Extension Scheme opened. Read as arrivals, that is a 155 per cent rise in
// people coming to Britain. Out of country grants actually FELL, 58,459 to 43,620.
//
// So the split travels with the series. A figure this easy to misread should not be
// available without it.
const humanitarianSplitPoint = (label) =>
  (humSeries.get(label) || []).filter((point) => point.value !== null).at(-1) ?? null;

const humanitarianOutOfCountry = humanitarianSplitPoint("Of which out of country grants");
const humanitarianInCountry = humanitarianSplitPoint("Of which in country grants");

if (!humanitarianOutOfCountry || !humanitarianInCountry) {
  throw new Error(
    "Hum_01 no longer carries its out of country / in country split. The safe and legal " +
      "total is 77% in-country extensions and must not be published as arrivals without it."
  );
}

const routeSeries = [
  {
    id: "safe_legal_total",
    label: "Safe and legal (humanitarian) grants",
    group: "Humanitarian routes",
    schemeStatus: "Mixed route family",
    localBreakdown: "No single local authority split",
    sourceUrl: sourceMeta.safeLegal.source_url,
    note:
      "Includes refugee resettlement, refugee family reunion, Ukraine and BN(O) routes. " +
      "Do not present as a refugee total, and do not read it as arrivals: " +
      `${humanitarianInCountry.value.toLocaleString()} of the ` +
      `${((humSeries.get("Total") || []).filter((p) => p.value !== null).at(-1)?.value ?? 0).toLocaleString()} ` +
      `in ${humanitarianInCountry.periodLabel} were granted in country, which the Home Office ` +
      "defines as extensions for people already in the UK.",
    split: {
      periodLabel: humanitarianOutOfCountry.periodLabel,
      outOfCountry: humanitarianOutOfCountry.value,
      inCountry: humanitarianInCountry.value,
      outOfCountryLabel: "Granted out of country",
      inCountryLabel: "Extensions granted in country"
    },
    series: (humSeries.get("Total") || []).filter((point) => point.value !== null)
  },
  {
    id: "small_boats",
    label: "Small boat arrivals",
    group: "Irregular asylum route",
    schemeStatus: "Not a refugee scheme",
    localBreakdown: "No standard local authority split",
    sourceUrl: sourceMeta.illegalEntry.source_url,
    note: "Detected arrivals via small boat across the UK.",
    series: smallBoatArrivalsSeries
  },
  {
    id: "asylum_support",
    label: "Supported asylum population",
    group: "Asylum support system",
    schemeStatus: "Not a refugee scheme",
    localBreakdown: "Latest local authority snapshot available",
    sourceUrl: sourceMeta.localImmigration.source_url,
    note: "Quarter-end stock of people receiving asylum support. Changes reflect net movement onto and off support, not the number of distinct people who passed through the system.",
    series: regionalRows
      .filter((row) => row.areaCode === "UK")
      .map((row) => ({
        periodLabel: localSnapshotDate,
        periodEnd: row.snapshotDate,
        value: row.supportedAsylum
      }))
  },
  {
    id: "afghan_resettlement_programme",
    label: "Afghan Resettlement Programme arrivals",
    group: "Refugee resettlement and relocation",
    schemeStatus: "Scheme family",
    localBreakdown: "Latest local population snapshot and local quarterly arrivals available",
    sourceUrl: sourceMeta.safeLegal.source_url,
    note: "National yearly arrivals from summary tables; local stock from immigration group tables; quarterly local arrival history from resettlement tables.",
    series: (resSeries.get("Afghan Resettlement Programme") || []).filter((point) => point.value !== null)
  },
  {
    id: "uk_resettlement_scheme",
    label: "UK Resettlement Scheme and predecessor schemes",
    group: "Refugee resettlement",
    schemeStatus: "Scheme family",
    localBreakdown: "Quarterly local authority arrivals available",
    sourceUrl: sourceMeta.safeLegal.source_url,
    note: "This build groups UKRS, Mandate, VPRS, VCRS, and Gateway to avoid pretending the current local stock table publishes them separately.",
    series: ukResettlementFamilySeries
  },
  {
    id: "community_sponsorship",
    label: "Community Sponsorship arrivals",
    group: "Refugee resettlement support model",
    schemeStatus: "Scheme support channel",
    localBreakdown: "Quarterly local authority arrivals available",
    sourceUrl: sourceMeta.safeLegal.source_url,
    note: `Separate from core resettlement totals because this is a sponsorship mechanism rather than a separate national asylum route.${communitySponsorshipCumulative ? ` Cumulative total since 2014: ${communitySponsorshipCumulative.toLocaleString()}.` : ""}`,
    series: communitySponsorshipYearlySeries
  },
  {
    id: "refugee_family_reunion",
    label: "Refugee Family Reunion grants",
    group: "Protection-linked family route",
    schemeStatus: "Not a refugee resettlement scheme",
    localBreakdown: "No local authority split",
    sourceUrl: sourceMeta.safeLegal.source_url,
    note: "Family route connected to existing protection status in the UK.",
    series: (famSeries.get("Total grants") || []).filter((point) => point.value !== null)
  },
  {
    id: "homes_for_ukraine",
    label: "Ukraine arrivals",
    group: "Humanitarian route",
    schemeStatus: "Not a refugee resettlement scheme",
    localBreakdown: "Latest local authority arrivals snapshot available",
    sourceUrl: sourceMeta.safeLegal.source_url,
    note: "Use arrivals rather than grants when comparing to local authority placement counts.",
    series: (ukrSeries.get("Total arrivals") || []).filter((point) => point.value !== null)
  }
];

for (const route of routeSeries) {
  const metricIdMap = {
    small_boats: "small_boat_arrivals",
    asylum_support: "asylum_supported_people",
    afghan_resettlement_programme: "afghan_resettlement_programme_arrivals",
    uk_resettlement_scheme: "resettled_refugees_arrivals",
    community_sponsorship: "community_sponsorship_arrivals",
    refugee_family_reunion: "refugee_family_reunion_visas",
    homes_for_ukraine: "hfu_arrivals"
  };

  const metricId = metricIdMap[route.id];
  if (!metricId) {
    continue;
  }

  for (const point of route.series) {
    observationRows.push(
      makeObservation({
        metricId,
        sourceMetaEntry: route.id === "small_boats" ? sourceMeta.illegalEntry : sourceMeta.safeLegal,
        areaCode: "UK",
        areaName: "United Kingdom",
        areaType: "country",
        countryName: "United Kingdom",
        periodStart: startOfYear(point.periodLabel),
        periodEnd: point.periodEnd,
        periodType: "year",
        value: point.value,
        notes: `${route.label} national series.`,
        fileHash: route.id === "small_boats" ? illegalEntryHash : safeLegalHash
      })
    );
  }
}

const resettlementSummaryByArea = new Map();
let latestResettlementQuarterLabel = null;

for (const row of [...resettlementSeriesByArea.values()]) {
  latestResettlementQuarterLabel =
    !latestResettlementQuarterLabel || row.quarter > latestResettlementQuarterLabel
      ? row.quarter
      : latestResettlementQuarterLabel;

  const current = resettlementSummaryByArea.get(row.areaCode) || {
    areaCode: row.areaCode,
    areaName: row.areaName,
    regionName: row.regionName,
    countryName: row.countryName,
    resettlementCumulativeTotal: 0,
    afghanResettlementCumulative: 0,
    ukResettlementFamilyCumulative: 0,
    communitySponsorshipCumulative: 0,
    resettlementLatestYearTotal: 0,
    latestResettlementQuarterLabel: row.quarter,
    latestResettlementQuarterValue: 0
  };

  current.resettlementCumulativeTotal += row.resettled_refugees_arrivals;
  current.afghanResettlementCumulative += row.afghan_resettlement_programme_arrivals;
  current.ukResettlementFamilyCumulative += row.uk_resettlement_scheme_arrivals;
  current.communitySponsorshipCumulative += row.community_sponsorship_arrivals;

  if (row.quarter.startsWith("2025")) {
    current.resettlementLatestYearTotal += row.resettled_refugees_arrivals;
  }

  if (row.quarter >= current.latestResettlementQuarterLabel) {
    current.latestResettlementQuarterLabel = row.quarter;
    current.latestResettlementQuarterValue = row.resettled_refugees_arrivals;
  }

  resettlementSummaryByArea.set(row.areaCode, current);
}

const localAreaSummaries = localAreas
  .map((area) => {
    const resettlement = resettlementSummaryByArea.get(area.areaCode) || {
      resettlementCumulativeTotal: 0,
      afghanResettlementCumulative: 0,
      ukResettlementFamilyCumulative: 0,
      communitySponsorshipCumulative: 0,
      resettlementLatestYearTotal: 0,
      latestResettlementQuarterLabel: latestResettlementQuarterLabel || "2025 Q4",
      latestResettlementQuarterValue: 0
    };

    return {
      ...area,
      ...resettlement
    };
  })
  .sort((a, b) => b.supportedAsylum - a.supportedAsylum);

const topAreasByMetric = [
  topAreas(localAreaSummaries, "supportedAsylum", "Supported asylum population"),
  topAreas(localAreaSummaries, "supportedAsylumRate", "Supported asylum rate per 10,000"),
  topAreas(localAreaSummaries, "contingencyAccommodation", "Contingency accommodation population"),
  topAreas(localAreaSummaries, "homesForUkraineArrivals", "Homes for Ukraine arrivals"),
  topAreas(localAreaSummaries, "afghanProgrammePopulation", "Afghan Resettlement Programme population"),
  topAreas(localAreaSummaries, "resettlementCumulativeTotal", "Cumulative resettlement arrivals since 2014")
];

const defaultCompareCodes = localAreaSummaries.slice(0, 4).map((row) => row.areaCode);

const latestSmallBoatShare =
  observationRows
    .filter((row) => row.metric_id === "small_boat_arrivals_share_illegal_routes")
    .sort((a, b) => a.period_end.localeCompare(b.period_end))
    .at(-1)?.value ?? 0;

const nationalCards = [
  {
    id: "small_boat_arrivals",
    label: "Small boat arrivals",
    value: smallBoatArrivalsLatestWindow,
    period: illegalEntryWindowLabel,
    detail: "Detected arrivals via small boat across the UK, over the latest four published quarters.",
    sourceUrl: sourceMeta.illegalEntry.source_url
  },
  {
    id: "small_boat_share",
    label: "Small boat share of illegal entry routes",
    value: illegalEntryTotalLatestWindow
      ? roundNumber((smallBoatArrivalsLatestWindow / illegalEntryTotalLatestWindow) * 100, 1)
      : 0,
    period: illegalEntryWindowLabel,
    detail: "Derived from the illegal entry routes dataset.",
    sourceUrl: sourceMeta.illegalEntry.source_url,
    valueSuffix: "%"
  },
  {
    id: "supported_asylum",
    label: "Supported asylum population",
    value: regionalRows.find((row) => row.areaCode === "UK")?.supportedAsylum ?? 0,
    period: `As at ${localSnapshotDate}`,
    detail: "Latest official UK quarter-end stock snapshot from the immigration groups table, not an arrivals or throughput count.",
    sourceUrl: sourceMeta.localImmigration.source_url
  },
  {
    id: "contingency_accommodation",
    label: "Contingency accommodation population",
    value: regionalRows.find((row) => row.areaCode === "UK")?.contingencyAccommodation ?? 0,
    period: `As at ${localSnapshotDate}`,
    detail: "Proxy for the most visible temporary accommodation pressure.",
    sourceUrl: sourceMeta.localImmigration.source_url
  },
  {
    id: "afghan_arrivals",
    label: "Afghan Resettlement Programme arrivals",
    value: routeSeries.find((row) => row.id === "afghan_resettlement_programme")?.series.at(-1)?.value ?? 0,
    period: routeSeries.find((row) => row.id === "afghan_resettlement_programme")?.series.at(-1)?.periodLabel ?? "Latest year",
    detail: "National yearly arrivals through Afghan resettlement and relocation pathways.",
    sourceUrl: sourceMeta.safeLegal.source_url
  },
  {
    id: "resettled_total",
    label: "Total resettled arrivals",
    value: totalResettledSeries.at(-1)?.value ?? 0,
    period: totalResettledSeries.at(-1)?.periodLabel ?? "Latest year",
    detail: "Separate from the UKRS-family line because the total includes Afghan arrivals.",
    sourceUrl: sourceMeta.safeLegal.source_url
  },
  {
    id: "ukraine_arrivals",
    label: "Ukraine arrivals",
    value: routeSeries.find((row) => row.id === "homes_for_ukraine")?.series.at(-1)?.value ?? 0,
    period: routeSeries.find((row) => row.id === "homes_for_ukraine")?.series.at(-1)?.periodLabel ?? "Latest year",
    detail: "Do not mix this humanitarian route into refugee resettlement totals.",
    sourceUrl: sourceMeta.safeLegal.source_url
  },
  {
    id: "family_reunion",
    label: "Refugee Family Reunion grants",
    value: routeSeries.find((row) => row.id === "refugee_family_reunion")?.series.at(-1)?.value ?? 0,
    period: routeSeries.find((row) => row.id === "refugee_family_reunion")?.series.at(-1)?.periodLabel ?? "Latest year",
    detail: "Protection-linked family route, not a resettlement scheme.",
    sourceUrl: sourceMeta.safeLegal.source_url
  }
];

const latestClaimsQuarter = asylumClaimsQuarterlySeries.at(-1) ?? null;
const latestInitialDecisionQuarter = asylumInitialDecisionsQuarterlySeries.at(-1) ?? null;
const latestReturnsQuarter = returnsTotalQuarterlySeries.at(-1) ?? null;
const latestAwaitingDecisionQuarter = asylumAwaitingDecisionQuarterlySeries.at(-1) ?? null;
const latestSupportQuarter = asylumSupportQuarterlySeries.at(-1) ?? null;
const latestQuarterSupportAccommodation = [
  {
    label: "Contingency hotel",
    value:
      supportAccommodationSeriesByType.get("Contingency Accommodation - Hotel")?.at(-1)?.value ?? 0,
    metricId: "hotel"
  },
  {
    label: "Contingency other",
    value:
      supportAccommodationSeriesByType.get("Contingency Accommodation - Other")?.at(-1)?.value ?? 0,
    metricId: "contingency_other"
  },
  {
    label: "Dispersal accommodation",
    value: supportAccommodationSeriesByType.get("Dispersal Accommodation")?.at(-1)?.value ?? 0,
    metricId: "dispersal"
  },
  {
    label: "Initial accommodation",
    value: supportAccommodationSeriesByType.get("Initial Accommodation")?.at(-1)?.value ?? 0,
    metricId: "initial"
  },
  {
    label: "Other accommodation",
    value: supportAccommodationSeriesByType.get("Other Accommodation")?.at(-1)?.value ?? 0,
    metricId: "other"
  },
  {
    label: "Subsistence only",
    value: supportAccommodationSeriesByType.get("Subsistence Only")?.at(-1)?.value ?? 0,
    metricId: "subsistence_only"
  }
];

const latestQuarterDecisionBreakdown = latestInitialDecisionQuarter
  ? [
      {
        label: "Claims lodged",
        value:
          asylumClaimsQuarterlySeries.find((point) => point.periodLabel === latestInitialDecisionQuarter.periodLabel)
            ?.value ?? 0,
        metricId: "claims"
      },
      {
        label: "Initial decisions",
        value: latestInitialDecisionQuarter.value,
        metricId: "initial_decisions"
      },
      {
        label: "Grants at initial decision",
        value:
          asylumInitialGrantQuarterlySeries.find((point) => point.periodLabel === latestInitialDecisionQuarter.periodLabel)
            ?.value ?? 0,
        metricId: "initial_grants"
      },
      {
        label: "Refusals",
        value:
          asylumInitialRefusalQuarterlySeries.find((point) => point.periodLabel === latestInitialDecisionQuarter.periodLabel)
            ?.value ?? 0,
        metricId: "initial_refusals"
      },
      {
        label: "Withdrawals",
        value:
          asylumInitialWithdrawalQuarterlySeries.find(
            (point) => point.periodLabel === latestInitialDecisionQuarter.periodLabel
          )?.value ?? 0,
        metricId: "initial_withdrawals"
      },
      {
        label: "Administrative outcomes",
        value:
          asylumInitialAdministrativeQuarterlySeries.find(
            (point) => point.periodLabel === latestInitialDecisionQuarter.periodLabel
          )?.value ?? 0,
        metricId: "initial_administrative"
      }
    ]
  : [];

const latestQuarterClaimsValue = latestQuarterDecisionBreakdown.find((item) => item.metricId === "claims")?.value ?? 0;
const latestQuarterInitialDecisionsValue =
  latestQuarterDecisionBreakdown.find((item) => item.metricId === "initial_decisions")?.value ?? 0;
const latestQuarterGrantValue =
  latestQuarterDecisionBreakdown.find((item) => item.metricId === "initial_grants")?.value ?? 0;
const latestQuarterRefusalValue =
  latestQuarterDecisionBreakdown.find((item) => item.metricId === "initial_refusals")?.value ?? 0;
const latestQuarterWithdrawalValue =
  latestQuarterDecisionBreakdown.find((item) => item.metricId === "initial_withdrawals")?.value ?? 0;
const latestQuarterAdministrativeValue =
  latestQuarterDecisionBreakdown.find((item) => item.metricId === "initial_administrative")?.value ?? 0;
const latestReturnsBreakdown = latestReturnsQuarter
  ? [
      {
        label: "All returns",
        value: latestReturnsQuarter.value,
        metricId: "returns_total"
      },
      {
        label: "Voluntary",
        value:
          returnsVoluntaryQuarterlySeries.find((point) => point.periodLabel === latestReturnsQuarter.periodLabel)
            ?.value ?? 0,
        metricId: "returns_voluntary"
      },
      {
        label: "Enforced",
        value:
          returnsEnforcedQuarterlySeries.find((point) => point.periodLabel === latestReturnsQuarter.periodLabel)
            ?.value ?? 0,
        metricId: "returns_enforced"
      },
      {
        label: "Refused entry and departed",
        value:
          returnsRefusedEntryQuarterlySeries.find((point) => point.periodLabel === latestReturnsQuarter.periodLabel)
            ?.value ?? 0,
        metricId: "returns_refused_entry"
      }
    ]
  : [];
const latestQuarterHotelSupportValue =
  latestQuarterSupportAccommodation.find((item) => item.metricId === "hotel")?.value ?? 0;
const recentOutcomeCohorts = asylumOutcomeCohorts.slice(-4);

const nationalSystemDynamics = {
  stockFlowCards: [
    {
      id: "asylum_claims",
      label: "Asylum claims",
      value: latestClaimsQuarter?.value ?? 0,
      period: latestClaimsQuarter?.periodLabel ?? "Latest quarter",
      detail: "Quarterly inflow into the asylum system.",
      sourceUrl: sourceMeta.asylumClaims.source_url
    },
    {
      id: "asylum_initial_decisions",
      label: "Initial decisions",
      value: latestInitialDecisionQuarter?.value ?? 0,
      period: latestInitialDecisionQuarter?.periodLabel ?? "Latest quarter",
      detail: "Quarterly operational output. This is not the same thing as latest cohort outcomes.",
      sourceUrl: sourceMeta.asylumClaims.source_url
    },
    {
      id: "awaiting_initial_decision",
      label: "Awaiting initial decision",
      value: latestAwaitingDecisionQuarter?.value ?? 0,
      period: latestAwaitingDecisionQuarter ? `As at ${latestAwaitingDecisionQuarter.periodLabel}` : "Latest quarter",
      detail: "Quarter-end stock awaiting an initial decision.",
      sourceUrl: sourceMeta.asylumAwaitingDecision.source_url
    },
    {
      id: "supported_asylum_stock",
      label: "Supported asylum stock",
      value: latestSupportQuarter?.value ?? 0,
      period: latestSupportQuarter ? `As at ${latestSupportQuarter.periodLabel}` : "Latest quarter",
      detail: "Quarter-end stock of people receiving asylum support, which overlaps with but is not identical to the awaiting-decision backlog.",
      sourceUrl: sourceMeta.asylumSupport.source_url
    }
  ],
  flowSeries: {
    claims: asylumClaimsQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({ periodLabel, periodEnd, value })),
    initialDecisions: asylumInitialDecisionsQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({
      periodLabel,
      periodEnd,
      value
    })),
    initialGrants: asylumInitialGrantQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({
      periodLabel,
      periodEnd,
      value
    })),
    initialRefusals: asylumInitialRefusalQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({
      periodLabel,
      periodEnd,
      value
    })),
    initialWithdrawals: asylumInitialWithdrawalQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({
      periodLabel,
      periodEnd,
      value
    }))
  },
  stockSeries: {
    awaitingInitialDecision: asylumAwaitingDecisionQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({
      periodLabel,
      periodEnd,
      value
    })),
    supportedAsylum: asylumSupportQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({
      periodLabel,
      periodEnd,
      value
    })),
    hotelAccommodation: (supportAccommodationSeriesByType.get("Contingency Accommodation - Hotel") || []).map(
      ({ periodLabel, periodEnd, value }) => ({
        periodLabel,
        periodEnd,
        value
      })
    )
  },
  latestQuarter: {
    quarterLabel: latestInitialDecisionQuarter?.periodLabel ?? latestClaimsQuarter?.periodLabel ?? null,
    stockPeriodLabel: latestSupportQuarter?.periodLabel ?? latestAwaitingDecisionQuarter?.periodLabel ?? null,
    claims: latestQuarterClaimsValue,
    initialDecisions: latestQuarterInitialDecisionsValue,
    initialGrants: latestQuarterGrantValue,
    initialRefusals: latestQuarterRefusalValue,
    initialWithdrawals: latestQuarterWithdrawalValue,
    initialAdministrativeOutcomes: latestQuarterAdministrativeValue,
    awaitingInitialDecision: latestAwaitingDecisionQuarter?.value ?? 0,
    supportedAsylum: latestSupportQuarter?.value ?? 0,
    hotelAccommodation: latestQuarterHotelSupportValue,
    hotelShareOfSupportPct:
      latestSupportQuarter?.value
        ? roundNumber((latestQuarterHotelSupportValue / latestSupportQuarter.value) * 100, 1)
        : null,
    decisionMinusClaims: latestQuarterInitialDecisionsValue - latestQuarterClaimsValue
  },
  latestQuarterDecisionBreakdown,
  latestSupportBreakdown: latestQuarterSupportAccommodation,
  outcomeCohorts: asylumOutcomeCohorts,
  recentOutcomeCohorts,
  postDecisionPath: {
    appeals: tribunalAppealsBlock,
    returns: {
      latestQuarterLabel: latestReturnsQuarter?.periodLabel ?? null,
      scopeLabel: "All returns from the UK",
      scopeNote:
        "This current quarterly returns series is broader than asylum-only exits. It includes enforced returns, voluntary returns, and refused-entry departures.",
      series: {
        total: returnsTotalQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({
          periodLabel,
          periodEnd,
          value
        })),
        voluntary: returnsVoluntaryQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({
          periodLabel,
          periodEnd,
          value
        })),
        enforced: returnsEnforcedQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({
          periodLabel,
          periodEnd,
          value
        })),
        refusedEntryDeparted: returnsRefusedEntryQuarterlySeries.map(({ periodLabel, periodEnd, value }) => ({
          periodLabel,
          periodEnd,
          value
        }))
      },
      latestBreakdown: latestReturnsBreakdown
    },
    readingNotes: [
      "Appeals are part of the post-decision path for refused claims. The tribunal series is now current, but it is a MOJ caseload measure on financial-year quarters, not a Home Office asylum-only count.",
      "Current returns tables are timely but broader than asylum-only case resolution, so they should not be treated as a clean continuation of the asylum claims denominator.",
      "Latest claim-year outcomes remain the main asylum-specific resolution view because they capture later case progression, including appeals and subsequent decisions, within the asylum cohort model."
    ]
  },
  outcomeRateSeries: {
    initialGrantRate: asylumOutcomeCohorts
      .filter((cohort) => cohort.initialGrantRatePct !== null)
      .slice(-8)
      .map((cohort) => ({
        periodLabel: cohort.claimYear,
        periodEnd: endOfYear(cohort.claimYear),
        value: cohort.initialGrantRatePct
      })),
    latestGrantRate: asylumOutcomeCohorts
      .filter((cohort) => cohort.latestGrantRatePct !== null)
      .slice(-8)
      .map((cohort) => ({
        periodLabel: cohort.claimYear,
        periodEnd: endOfYear(cohort.claimYear),
        value: cohort.latestGrantRatePct
      }))
  },
  readingNotes: [
    "Quarterly claims and initial decisions are flows through the period. Awaiting decision and support are stock counts at the end of the quarter.",
    "Support stock and awaiting-initial-decision stock overlap, but they are not identical groups. Support can include people at appeal or on other support routes.",
    "Comparing claims and initial decisions in the same quarter shows operational balance, not the experience of one single claim cohort.",
    "Latest outcomes are grouped by year of claim and can change after appeals or later case progression, so they should not be read as current-quarter decision output."
  ]
};

const routeDashboard = {
  generatedAt: new Date().toISOString(),
  localSnapshotDate,
  routeFamilies: routeSeries.map((route) => ({
    ...route,
    latestValue: route.series.at(-1)?.value ?? 0,
    latestPeriod: route.series.at(-1)?.periodLabel ?? route.series.at(-1)?.periodEnd ?? "Latest",
    firstPeriod: route.series[0]?.periodLabel ?? null
  })),
  nationalCards,
  illegalEntryMethodsLatestYear: illegalEntryMethodsLatestWindow,
  illegalEntryMethodsPeriodLabel: illegalEntryWindowLabel,
  smallBoatDecisionGroupsLatestYear: {
    year: latestSmallBoatOutcomeYear,
    rows: smallBoatDecisionGroupsLatestYear
  },
  nationalSystemDynamics,
  topAreasByMetric,
  limitations: [
    "Small boat arrivals are a national arrival-route series. The published local asylum-support tables do not tell you which supported people arrived by small boat.",
    `The latest local immigration groups table is a stock snapshot as at ${localSnapshotDateLong}, while resettlement local authority data is a quarterly arrivals series.`,
    "Awaiting an initial decision and receiving asylum support overlap, but they are not identical published populations. Support is not a synonym for the backlog.",
    "Appeals now come from the MOJ tribunal statistics rather than the discontinued Home Office appeals dataset. MOJ counts every First-tier Tribunal immigration and asylum appeal on financial-year quarters, so the volumes are much larger than the old asylum-only series and the periods do not line up with the Home Office calendar quarters.",
    "A rise or fall in supported asylum stock is net change after both inflows and exits. Grants, refusals, withdrawals, departures, and other case progression can all change the published support count.",
    "A flat local supported-asylum line does not prove there was no movement. Published local tables cannot show how many different people passed through support in an area over the period.",
    "Latest outcomes are grouped by year of claim and can change after appeals or later case progression. They are not the same measure as current-quarter initial decisions.",
    "The current returns series on this page is broader than asylum-only exits because it includes enforced returns, voluntary returns, and refused-entry departures.",
    "Homes for Ukraine, refugee family reunion, and Afghan resettlement should be compared with clear labels because they are not the same kind of route or scheme."
  ],
  sources: [
    sourceMeta.localImmigration,
    sourceMeta.localResettlement,
    sourceMeta.illegalEntry,
    sourceMeta.safeLegal,
    sourceMeta.asylumClaims,
    sourceMeta.asylumAwaitingDecision,
    sourceMeta.asylumOutcomeAnalysis,
    sourceMeta.asylumSupport,
    sourceMeta.returns,
    ...tribunalAppeals.sources
  ]
};

const localRouteLatest = {
  generatedAt: new Date().toISOString(),
  snapshotDate: localSnapshotDate,
  defaultCompareCodes,
  areas: localAreaSummaries,
  topAreasByMetric,
  routeMetricFamilies: [
    {
      id: "supportedAsylum",
      label: "Supported asylum population",
      unit: "people",
      description:
        "Latest official quarter-end stock of asylum seekers receiving support. This is not the number of distinct people who moved through support over the period, and it is not identical to the awaiting-decision backlog."
    },
    {
      id: "homesForUkraineArrivals",
      label: "Homes for Ukraine arrivals",
      unit: "people",
      description: "Latest published local authority arrivals count."
    },
    {
      id: "afghanProgrammePopulation",
      label: "Afghan Resettlement Programme population",
      unit: "people",
      description: "Latest published local authority stock for the Afghan programme."
    },
    {
      id: "contingencyAccommodation",
      label: "Contingency accommodation population",
      unit: "people",
      description: "Latest published quarter-end contingency-accommodation stock, recorded within the wider asylum-support snapshot."
    },
    {
      id: "resettlementCumulativeTotal",
      label: "Cumulative resettlement arrivals since 2014",
      unit: "people",
      description: "Quarterly local authority arrivals aggregated across the resettlement dataset."
    }
  ]
};

const canonicalManifest = {
  generated_at: new Date().toISOString(),
  dataset_id: "uk_routes",
  domains: ["asylum_routes", "refugees", "ukraine_routes"],
  record_counts: {
    canonical_observations: observationRows.length,
    local_authority_summaries: localAreaSummaries.length,
    route_families: routeSeries.length
  },
  outputs: [
    "local_route_observations.ndjson",
    "national_route_observations.ndjson",
    "local_resettlement_observations.ndjson",
    "national-route-dashboard.json",
    "local-route-latest.json",
    "area-route-summaries.json"
  ]
};

const nationalObservationRows = observationRows.filter((row) => row.area_code_original === "UK");
const localObservationRows = observationRows.filter((row) => row.area_type === "local_authority");

writeNdjson(path.join(canonicalDir, "national_route_observations.ndjson"), nationalObservationRows);
writeNdjson(path.join(canonicalDir, "local_route_observations.ndjson"), localObservationRows);
writeNdjson(path.join(canonicalDir, "local_resettlement_observations.ndjson"), resettlementObservations);
writeJson(path.join(canonicalDir, "manifest.json"), canonicalManifest);

writeJson(path.join(martsDir, "national-route-dashboard.json"), routeDashboard);
writeJson(path.join(martsDir, "local-route-latest.json"), localRouteLatest);
writeJson(path.join(martsDir, "area-route-summaries.json"), localAreaSummaries);

copyFileSync(path.join(martsDir, "national-route-dashboard.json"), path.join(liveDir, "route-dashboard.json"));
copyFileSync(path.join(martsDir, "local-route-latest.json"), path.join(liveDir, "local-route-latest.json"));

console.log(
  `Built uk_routes marts with ${observationRows.length} canonical observations across ${localAreaSummaries.length} areas.`
);
