#!/usr/bin/env node
/**
 * Fetch the Border Security Commander's Annual Report data.
 *
 * Published 16 July 2026 and not previously ingested. Two statistical releases:
 * organised immigration crime disruptions and arrests, and transfers/returns under the
 * UK-France agreement.
 *
 * Unlike every other source here, this release has NO spreadsheet. The numbers exist
 * only as HTML tables on the two release pages, so this banks the HTML itself as the
 * provenance artefact and the transform parses it. That is worth stating plainly,
 * because an HTML source is more fragile than an .ods and the transform asserts hard
 * against published totals to compensate.
 *
 * The article slugs are DISCOVERED from the parent publication page. That is not
 * ceremony here: GOV.UK truncates its own slug at 100 characters, so the UK-France page
 * really does live at a URL ending "...-between-6-august-2025-and-30", with the "-june-
 * 2026" cut off. Writing out the slug you would expect from the page title gives a 404.
 *
 *   node scripts/fetch/fetch-border-security.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = resolve(ROOT, "data/raw/border_security");
const MANIFEST = resolve(ROOT, "data/raw/manifests/border_security.json");

const PUBLICATION =
  "https://www.gov.uk/government/publications/the-border-security-commanders-annual-report-data";

// What each release is, keyed by a stable fragment of its slug. Matching on a fragment
// rather than the whole slug is what survives the truncation described above.
const RELEASES = [
  {
    id: "oic_disruptions",
    slugContains: "disruptions-and-arrests",
    label: "Disruptions and arrests for organised immigration crime activity"
  },
  {
    id: "uk_france_transfers",
    slugContains: "uk-france-agreement",
    label: "Transfers into and returns from the UK under the UK-France agreement"
  }
];

async function get(url) {
  const response = await fetch(url, { headers: { "user-agent": "asylumstats-data-fetch" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
}

const indexHtml = await get(PUBLICATION);

const slugs = [
  ...new Set(
    [
      ...indexHtml.matchAll(
        /href="(\/government\/publications\/the-border-security-commanders-annual-report-data\/[^"]+)"/g
      )
    ].map((match) => match[1])
  )
];

if (!slugs.length) {
  throw new Error(
    `No release pages linked from ${PUBLICATION}. The publication layout has changed.`
  );
}

mkdirSync(RAW_DIR, { recursive: true });

const saved = [];
for (const release of RELEASES) {
  const slug = slugs.find((candidate) => candidate.includes(release.slugContains));
  if (!slug) {
    throw new Error(
      `No release page matching "${release.slugContains}" among ${slugs.length} linked ` +
        `pages on ${PUBLICATION}. Slugs found:\n  ${slugs.join("\n  ")}`
    );
  }

  const url = `https://www.gov.uk${slug}`;
  const html = await get(url);

  // The numbers live in HTML tables; a page that has lost them is a layout change, not
  // an empty release, and should stop the run rather than write an empty mart.
  const tableCount = (html.match(/<table/g) ?? []).length;
  if (!tableCount) {
    throw new Error(`${url} contains no tables. The release format has changed.`);
  }

  const fileName = `${release.id}.html`;
  writeFileSync(resolve(RAW_DIR, fileName), html);
  saved.push({
    file: fileName,
    releaseId: release.id,
    label: release.label,
    sourceUrl: url,
    tableCount,
    sizeBytes: Buffer.byteLength(html),
    sha256: createHash("sha256").update(html).digest("hex")
  });
  console.log(`Saved ${fileName} (${tableCount} tables) from ${url}`);
}

const manifest = {
  dataset: "border_security",
  publisher: "Home Office / Border Security Command",
  release: "The Border Security Commander's Annual Report: Data",
  cadence: "annual (July)",
  landing: PUBLICATION,
  bank: "home-office/transparency",
  areaTier: "national",
  coveragePeriod:
    "OIC disruptions January 2023 to March 2026; UK-France transfers 6 August 2025 to 30 June 2026",
  releaseDate: "2026-07-16",
  nextEdition: "2027-07-31",
  // Both releases are explicitly NOT designated official statistics: disruptions are
  // "official statistics in development", arrests and the UK-France transfers are ad hoc
  // operational reporting. The site labels them as such wherever they appear.
  statisticsStatus: "ad hoc / in development, not designated official statistics",
  // The 16 July 2026 release revises OIC figures downward against what the quarterly
  // Immigration system statistics previously published, so the two are not splice-able.
  supersedes: "organised-immigration-crime-summary-tables-mar-2026.ods",
  fileCount: saved.length,
  totalBytes: saved.reduce((sum, file) => sum + file.sizeBytes, 0),
  files: saved
};
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nManifest written to data/raw/manifests/border_security.json`);
