import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const rawDir = path.resolve("data/raw/moj_tribunals");
const manifestDir = path.resolve("data/raw/manifests");

// Ministry of Justice, "Tribunal Statistics Quarterly: January to March 2026" (Q4 2025/26),
// published 11 June 2026. This release replaces the discontinued Home Office
// "asylum appeals lodged" dataset, which ended at 2023 Q1.
//
// MOJ publishes on financial-year quarters, so Q4 2025/26 covers January to March 2026.
// The next edition (April to June 2026) is due on 10 September 2026.
const sourceFiles = [
  {
    fileName: "Tribunals_Statistics_Quarterly_Main_Tables_Q4_2025_26.ods",
    sourceId: "moj_tribunals_main_tables",
    sourceUrl:
      "https://assets.publishing.service.gov.uk/media/6a296ed51f6fa5c3377e5cd9/Tribunals_Statistics_Quarterly_Main_Tables_Q4_2025_26.ods"
  },
  {
    fileName: "CSVs.zip",
    sourceId: "moj_tribunals_csvs",
    sourceUrl: "https://assets.publishing.service.gov.uk/media/6a296f79a3674dfd3eb50633/CSVs.zip"
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
  release: "Tribunal Statistics Quarterly: January to March 2026",
  releaseTitle: "Tribunal Statistics Quarterly: January to March 2026",
  releasePeriodLabel: "Q4 2025/26",
  releasePeriodBasis: "financial_year_quarter",
  releaseDate: "2026-06-11",
  nextEdition: "2026-09-10",
  nextEditionDate: "2026-09-10",
  landing:
    "https://www.gov.uk/government/statistics/tribunals-statistics-quarterly-january-to-march-2026",
  landingUrl:
    "https://www.gov.uk/government/statistics/tribunals-statistics-quarterly-january-to-march-2026",
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
console.log(`Fetched ${sourceFiles.length} official MOJ tribunal files.`);
