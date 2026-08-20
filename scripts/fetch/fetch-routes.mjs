import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listDataFiles, newestMatching } from "../lib/govuk-discover.mjs";

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
  { stem: "safe-legal-routes-summary-tables", sourceId: "safe_legal_routes_summary", page: DATA_TABLES }
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
  console.log(`  ${source.sourceId.padEnd(28)} ${newest.fileName}`);
  sourceFiles.push({ fileName: newest.fileName, sourceId: source.sourceId, sourceUrl: newest.url });
}

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
  datasetId: "uk_routes",
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
    sizeBytes: statSync(destination).size,
    fileSha256: fileSha256(destination)
  });
}

writeFileSync(path.join(manifestDir, "uk_routes.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Fetched ${sourceFiles.length} official route files.`);
