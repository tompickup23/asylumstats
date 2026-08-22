#!/usr/bin/env node
/**
 * Fetch the Home Office Annual Report and Accounts.
 *
 * This is the audited account of what the asylum system actually cost, and until now the
 * site did not use it. Every True Cost figure on the site was built from a mix of NAO
 * reports, factsheets and estimates; the ARA is the one source where the accommodation
 * and support lines are signed off by the Comptroller and Auditor General. True Cost v3
 * is rebuilt on it, so this ingest is a prerequisite for that.
 *
 * The publication carries two assets and both matter:
 *   - the accounts PDF, which is where the asylum cost narrative and the detention line
 *     live, and
 *   - the Core Data Tables workbook, which is the machine-readable spend by directorate.
 *
 * URLs are DISCOVERED. The 2025-26 accounts sit at a media hash with a filename
 * (`36.54_HO_ARA_25-26_WEB.pdf`) that carries no sortable period, so this uses
 * `allMatching` rather than `newestMatching`: the collection page always lists the
 * current year's edition, and the year is asserted against `EXPECTED_PERIOD` below so a
 * page that quietly reverts to last year's file fails loudly.
 *
 *   node scripts/fetch/fetch-annual-report.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { listDataFiles, allMatching } from "../lib/govuk-discover.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = resolve(ROOT, "data/raw/home_office_ara");
const MANIFEST = resolve(ROOT, "data/raw/manifests/home_office_ara.json");

const PUBLICATION =
  "https://www.gov.uk/government/publications/home-office-annual-report-and-accounts-2025-to-2026";

// The financial year these accounts cover, as it appears in the accounts filename. The
// ARA filename is the only place the year is machine-readable, so it is also the guard:
// if the publication page starts serving a different year, the assertion below fails
// rather than the site silently republishing prior-year costs as current.
const EXPECTED_PERIOD = "25-26";

const files = await listDataFiles(PUBLICATION, { extensions: ["pdf", "xlsx", "ods"] });

const accounts = allMatching(files, /HO_ARA_.*\.pdf$/i, { pageUrl: PUBLICATION })
  // Departments publish a web PDF and a large-print/eLay variant of the same accounts.
  // Prefer the web edition; it is the one whose page numbering the citations use.
  .sort((a, b) => (/_WEB/i.test(b.fileName) ? 1 : 0) - (/_WEB/i.test(a.fileName) ? 1 : 0))[0];

if (!accounts.fileName.includes(EXPECTED_PERIOD)) {
  throw new Error(
    `Accounts file "${accounts.fileName}" does not cover ${EXPECTED_PERIOD}. ` +
      `The publication page may have reverted to a prior year, or the naming changed. ` +
      `Check ${PUBLICATION} before updating EXPECTED_PERIOD.`
  );
}

const coreTables = allMatching(files, /Core_Data_Tables/i, { pageUrl: PUBLICATION })[0];

const wanted = [accounts, coreTables];
mkdirSync(RAW_DIR, { recursive: true });

const saved = [];
for (const file of wanted) {
  const download = await fetch(file.url, {
    headers: { "user-agent": "asylumstats-data-fetch" }
  });
  if (!download.ok) throw new Error(`Download returned ${download.status} for ${file.url}`);
  const bytes = Buffer.from(await download.arrayBuffer());

  if (bytes.length < 100_000) {
    throw new Error(
      `${file.fileName} is only ${bytes.length} bytes. The accounts and the core tables ` +
        `are both over 1 MB, so this is an error page rather than the document.`
    );
  }

  writeFileSync(resolve(RAW_DIR, file.fileName), bytes);
  saved.push({
    file: file.fileName,
    sourceUrl: file.url,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex")
  });
  console.log(`Saved ${file.fileName} (${(bytes.length / 1_048_576).toFixed(1)} MB)`);
}

const manifest = {
  dataset: "home_office_ara",
  publisher: "Home Office",
  release: "Home Office Annual Report and Accounts 2025-26 (HC 440)",
  cadence: "annual (July)",
  landing: PUBLICATION,
  bank: "home-office/annual-report",
  areaTier: "national",
  coveragePeriod: "2025-26 financial year, 1 April 2025 to 31 March 2026",
  releaseDate: "2026-07-14",
  // Departments lay their accounts before summer recess. 2024-25 was published 28 July
  // 2025, 2025-26 on 14 July 2026, so the next edition is due July 2027; the freshness
  // check is given the end of that month so a normal few-days slip is not an alert.
  nextEdition: "2027-07-31",
  fileCount: saved.length,
  totalBytes: saved.reduce((sum, file) => sum + file.sizeBytes, 0),
  files: saved
};
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nManifest written to data/raw/manifests/home_office_ara.json`);
