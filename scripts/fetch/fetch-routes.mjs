import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listDataFiles, newestMatching, periodParts } from "../lib/govuk-discover.mjs";
import { fetchReleaseDate, nextEditionFrom, releasePageUrl } from "../lib/route-release.mjs";

const rawDir = path.resolve("data/raw/uk_routes");
const manifestDir = path.resolve("data/raw/manifests");

// Where each dataset lives. Seven sit on the quarterly data tables page; the regional
// and local authority file has its own statistical data set page.
const DATA_TABLES =
  "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables";
const REGIONAL_LA =
  "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-regional-and-local-authority-data";

/**
 * Sources named by the STABLE part of the filename, not by URL.
 *
 * These were eight hardcoded dec-2025 links, still pointing at December 2025 months
 * after the mar-2026 release. Running this would have re-fetched last year's data
 * without complaint, which is why data/raw/manifests/uk_routes.json described files that
 * were no longer the ones the site used. Each URL carries a release period and a media
 * hash, so it cannot be written down and left.
 */
const sourceStems = [
  { stem: "regional-and-local-authority-dataset", sourceId: "local_immigration_groups", page: REGIONAL_LA },
  { stem: "resettlement-local-authority-datasets", sourceId: "local_resettlement_routes", page: DATA_TABLES },
  { stem: "illegal-entry-routes-to-the-uk-dataset", sourceId: "illegal_entry_routes", page: DATA_TABLES },
  { stem: "asylum-claims-datasets", sourceId: "asylum_claims", page: DATA_TABLES },
  { stem: "asylum-claims-awaiting-decision-datasets", sourceId: "asylum_awaiting_decision", page: DATA_TABLES },
  { stem: "outcome-analysis-asylum-claims-datasets", sourceId: "asylum_outcome_analysis", page: DATA_TABLES },
  // The Home Office asylum-appeals-lodged dataset ended at 2023 Q1 and is no longer published.
  // Appeal-stage figures come from scripts/fetch/fetch-tribunals.mjs (MOJ tribunal statistics).
  { stem: "asylum-seekers-receipt-support-datasets", sourceId: "asylum_support", page: DATA_TABLES },
  { stem: "returns-datasets", sourceId: "returns", page: DATA_TABLES },
  { stem: "safe-legal-routes-summary-tables", sourceId: "safe_legal_routes_summary", page: DATA_TABLES },
  // Added 28 Aug 2026. The year ending June 2026 release publishes 32 datasets and this
  // script was taking nine of them, so four asylum-side series the site has never held
  // were being left on the page every quarter. Detention is the largest gap: there is no
  // detention series anywhere in the repo, and it is the other half of the returns story.
  { stem: "immigration-detention-datasets", sourceId: "detention", page: DATA_TABLES },
  { stem: "resettlement-scheme-datasets", sourceId: "resettlement_scheme", page: DATA_TABLES },
  { stem: "age-assessments-detailed-datasets", sourceId: "age_assessments", page: DATA_TABLES },
  {
    stem: "organised-immigration-crime-summary-tables",
    sourceId: "organised_immigration_crime",
    page: DATA_TABLES
  }
];

// Resolve each stem to the newest published file. Pages are fetched once and reused.
const pageCache = new Map();
const sourceFiles = [];
for (const source of sourceStems) {
  if (!pageCache.has(source.page)) {
    pageCache.set(source.page, await listDataFiles(source.page));
  }
  const newest = newestMatching(pageCache.get(source.page), source.stem);
  if (!newest) {
    throw new Error(
      `No current file found for "${source.stem}" on ${source.page}. ` +
        "Refusing to fall back to whatever is on disk: that is how eight dec-2025 URLs " +
        "survived the mar-2026 release."
    );
  }
  const period = periodParts(newest.fileName);
  if (!period) {
    throw new Error(
      `Found "${newest.fileName}" for ${source.sourceId} but cannot read a period from it. ` +
        "GOV.UK has changed its filename convention; teach scripts/lib/govuk-discover.mjs " +
        "the new one rather than letting an undateable file through."
    );
  }
  console.log(`  ${source.sourceId.padEnd(28)} ${newest.fileName}`);
  sourceFiles.push({
    fileName: newest.fileName,
    sourceId: source.sourceId,
    sourceUrl: newest.url,
    period
  });
}

// The publication date of each quarter, asked of GOV.UK rather than assumed. Normally
// every file belongs to the same release and this is one lookup; when one dataset lags a
// quarter it gets its own, and cites the release it actually came from.
const releaseDates = new Map();
for (const slug of new Set(sourceFiles.map((file) => file.period.slug))) {
  releaseDates.set(slug, await fetchReleaseDate(slug));
  console.log(`  release ${slug.padEnd(20)} published ${releaseDates.get(slug)}`);
}

// The newest period present is the release the site is on.
const currentPeriod = sourceFiles
  .map((file) => file.period)
  .sort((a, b) => b.key - a.key)[0];

function downloadFile(url, destination) {
  execFileSync("curl", ["-sS", "-L", url, "-o", destination], {
    stdio: "inherit",
    maxBuffer: 1024 * 1024 * 64
  });
}

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

mkdirSync(rawDir, { recursive: true });
mkdirSync(manifestDir, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  dataset: "uk_routes",
  datasetId: "uk_routes",
  publisher: "Home Office",
  cadence: "quarterly",
  // "Year ending March 2026" becomes "year ending March 2026", matching how GOV.UK
  // titles the release itself. The freshness audit prints this line.
  release: `Immigration system statistics, ${currentPeriod.label[0].toLowerCase()}${currentPeriod.label.slice(1)}`,
  releaseDate: releaseDates.get(currentPeriod.slug),
  releasePage: releasePageUrl(currentPeriod.slug),
  periodSlug: currentPeriod.slug,
  // Read by scripts/audit/source-freshness.mjs. Without it this dataset reported
  // "no-cycle" and the audit stayed silent through a missed quarterly release, which is
  // the one thing it exists to catch.
  nextEdition: nextEditionFrom(currentPeriod),
  landing: DATA_TABLES,
  fetchedFileCount: sourceFiles.length,
  files: []
};

for (const file of sourceFiles) {
  const destination = path.join(rawDir, file.fileName);
  try {
    downloadFile(file.sourceUrl, destination);
  } catch (error) {
    const cachedPath = path.join("/tmp", file.fileName);
    if (!existsSync(cachedPath)) {
      throw error;
    }
    copyFileSync(cachedPath, destination);
  }
  manifest.files.push({
    sourceId: file.sourceId,
    fileName: file.fileName,
    sourceUrl: file.sourceUrl,
    periodSlug: file.period.slug,
    periodLabel: file.period.label,
    releaseDate: releaseDates.get(file.period.slug),
    sizeBytes: statSync(destination).size,
    fileSha256: fileSha256(destination)
  });
}

writeFileSync(path.join(manifestDir, "uk_routes.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Fetched ${sourceFiles.length} official route files for ${currentPeriod.label} ` +
    `(published ${manifest.releaseDate}, next edition due by ${manifest.nextEdition}).`
);
