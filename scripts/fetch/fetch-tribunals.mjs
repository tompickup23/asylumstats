import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { discoverLatestTribunalRelease } from "../lib/tribunal-release.mjs";

const rawDir = path.resolve("data/raw/moj_tribunals");
const manifestDir = path.resolve("data/raw/manifests");

// Which release, and which files, is discovered from GOV.UK rather than written here. See
// scripts/lib/tribunal-release.mjs for why: this file previously named the release, its
// publication date, its next edition and both asset URLs by hand, and transform-tribunals.mjs
// named the ODS a second time, so the 10 September edition would have been fetched and then
// described as January to March 2026.
const release = await discoverLatestTribunalRelease();

const sourceFiles = [
  {
    fileName: path.basename(new URL(release.mainTablesUrl).pathname),
    sourceId: "moj_tribunals_main_tables",
    sourceUrl: release.mainTablesUrl,
    role: "main_tables"
  },
  {
    fileName: "CSVs.zip",
    sourceId: "moj_tribunals_csvs",
    sourceUrl: release.csvsUrl,
    role: "csvs"
  }
];

function downloadFile(url, destination) {
  execFileSync("curl", ["-sS", "-L", "--fail", url, "-o", destination], {
    stdio: "inherit",
    maxBuffer: 1024 * 1024 * 64
  });
}

function fileSha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

mkdirSync(rawDir, { recursive: true });
mkdirSync(manifestDir, { recursive: true });

// Two vocabularies in one file, on purpose. This fetcher named its fields
// releaseTitle/nextEditionDate/landingUrl; scripts/audit/source-freshness.mjs reads
// release/nextEdition/landing, because that is what build-source-manifest.mjs writes.
// The audit was reading a hand-built manifest that this fetcher then overwrote the first
// time the refresh cron actually completed, on 23 August, which quietly took moj_tribunals
// out of the freshness check altogether: it reported "no-cycle" and would have said
// nothing at all if the 10 September release were missed. Both spellings are written now,
// so whichever runs last leaves the alarm armed.
const manifest = {
  generatedAt: new Date().toISOString(),
  dataset: "moj_tribunals",
  datasetId: "moj_tribunals",
  publisher: "Ministry of Justice",
  cadence: "quarterly",
  release: release.title,
  releaseTitle: release.title,
  releasePeriodLabel: release.periodLabel,
  releasePeriodCoverage: release.coverage,
  releasePeriodBasis: "financial_year_quarter",
  releaseDate: release.publishedDate,
  nextEdition: release.nextEditionDate,
  nextEditionDate: release.nextEditionDate,
  nextEditionCoverage: release.nextEditionCoverage,
  // Derived rather than announced: GOV.UK carries no next-release date for this series, and
  // MOJ has slipped twice in two years. The freshness audit should start asking on this date,
  // not treat it as a promise.
  nextEditionIsExpected: release.nextEditionIsExpected,
  landing: release.releasePage,
  landingUrl: release.releasePage,
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

// The CSV bundle is extracted here so the transform can read a plain file. The national
// receipts and disposals CSV is used as an independent cross-check on the ODS parse, and
// it carries the per-quarter revision status (final, revised, provisional).
const csvDir = path.join(rawDir, "csvs");
mkdirSync(csvDir, { recursive: true });
execFileSync("unzip", ["-o", "-q", path.join(rawDir, "CSVs.zip"), "-d", csvDir], { stdio: "inherit" });

writeFileSync(path.join(manifestDir, "moj_tribunals.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Fetched ${sourceFiles.length} official MOJ tribunal files for ${release.title} ` +
    `(published ${release.publishedDate}, next edition expected ${release.nextEditionDate}).`
);
