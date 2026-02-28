import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const rawDir = path.resolve("data/raw/uk_routes");
const manifestDir = path.resolve("data/raw/manifests");

const sourceFiles = [
  {
    fileName: "regional-and-local-authority-dataset-dec-2025.ods",
    sourceId: "local_immigration_groups",
    sourceUrl:
      "https://assets.publishing.service.gov.uk/media/69959e60a58a315dbe72bf10/regional-and-local-authority-dataset-dec-2025.ods"
  },
  {
    fileName: "resettlement-local-authority-datasets-dec-2025.xlsx",
    sourceId: "local_resettlement_routes",
    sourceUrl:
      "https://assets.publishing.service.gov.uk/media/69959395bfdab2546272bf06/resettlement-local-authority-datasets-dec-2025.xlsx"
  },
  {
    fileName: "illegal-entry-routes-to-the-uk-dataset-dec-2025.xlsx",
    sourceId: "illegal_entry_routes",
    sourceUrl:
      "https://assets.publishing.service.gov.uk/media/69959205b33a4db7ff889d49/illegal-entry-routes-to-the-uk-dataset-dec-2025.xlsx"
  },
  {
    fileName: "safe-legal-routes-summary-tables-dec-2025.ods",
    sourceId: "safe_legal_routes_summary",
    sourceUrl:
      "https://assets.publishing.service.gov.uk/media/6996f20c339ee33f3ad0b92b/safe-legal-routes-summary-tables-dec-2025.ods"
  }
];

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
