#!/usr/bin/env node
/**
 * Fetch the Home Office small boats time series.
 *
 * This is the most newsworthy number the site carries and it was four and a half months
 * stale: the freshest small-boat figure on the site was 4,441 for the quarter to 31
 * March, while the Home Office publishes weekly, on Fridays.
 *
 * The URL is DISCOVERED, not hardcoded, and that is the point of this script. The file
 * lives at a path containing both a release date and a media hash
 * (.../media/<hash>/07_August_2026_Small_boats_-_time_series.ods), so it changes every
 * week; hardcoding it would go stale within seven days. The repo already has a worked
 * example of the failure mode: fetch-routes.mjs still points at dec-2025 files months
 * after the mar-2026 release, which is why the routes manifest describes data that is no
 * longer what the site uses. The older statistical-data-set URL for this series has been
 * dead since February 2023.
 *
 * So: read the publication page, find the current .ods link, fail loudly if it is not
 * there rather than silently keeping whatever is on disk.
 *
 *   node scripts/fetch/fetch-small-boats.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = resolve(ROOT, "data/raw/small_boats");
const MANIFEST = resolve(ROOT, "data/raw/manifests/small_boats.json");

const PUBLICATION =
  "https://www.gov.uk/government/publications/migrants-detected-crossing-the-english-channel-in-small-boats";

async function discoverTimeSeriesUrl() {
  const response = await fetch(PUBLICATION, {
    headers: { "user-agent": "asylumstats-data-fetch" }
  });
  if (!response.ok) {
    throw new Error(`Publication page returned ${response.status}`);
  }
  const html = await response.text();

  // Any .ods on this page whose filename mentions the time series. Matching on the
  // filename rather than position, so a reordered page does not break it.
  const candidates = [
    ...html.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"' ]+\.ods/gi)
  ]
    .map((match) => match[0])
    .filter((url) => /small_?boats/i.test(url) && /time_?series/i.test(url));

  const unique = [...new Set(candidates)];
  if (!unique.length) {
    throw new Error(
      "No small boats time series .ods found on the publication page. " +
        "The page layout or filename convention has changed; check " +
        PUBLICATION
    );
  }
  if (unique.length > 1) {
    console.warn(`Found ${unique.length} candidate files, taking the first:`);
    unique.forEach((url) => console.warn(`  ${url}`));
  }
  return unique[0];
}

const url = await discoverTimeSeriesUrl();
const fileName = decodeURIComponent(url.split("/").pop());
console.log(`Discovered: ${fileName}`);

const download = await fetch(url, { headers: { "user-agent": "asylumstats-data-fetch" } });
if (!download.ok) throw new Error(`Download returned ${download.status} for ${url}`);
const bytes = Buffer.from(await download.arrayBuffer());

if (bytes.length < 10_000) {
  throw new Error(`Downloaded file is only ${bytes.length} bytes, which is not the series`);
}

mkdirSync(RAW_DIR, { recursive: true });
const target = resolve(RAW_DIR, fileName);
writeFileSync(target, bytes);

const manifest = {
  dataset: "small_boats",
  publisher: "Home Office",
  release: "Migrants detected crossing the English Channel in small boats, time series",
  // Weekly on Fridays. Deliberately not stamped with a fetch timestamp: the file name
  // carries the release date, and a changing timestamp would churn the manifest on
  // every run and hide real changes in review.
  cadence: "weekly (Fridays)",
  landing: PUBLICATION,
  sourceUrl: url,
  bank: "home-office/weekly",
  areaTier: "national",
  fileCount: 1,
  totalBytes: bytes.length,
  files: [
    {
      file: fileName,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    }
  ]
};
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Saved ${(bytes.length / 1024).toFixed(1)} kB to data/raw/small_boats/`);
console.log(`Manifest written to data/raw/manifests/small_boats.json`);
