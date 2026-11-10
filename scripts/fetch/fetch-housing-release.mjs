#!/usr/bin/env node
/**
 * Release-day fetch for the housing panel's next H-CLIC edition.
 *
 * Reads `releaseDay` in data/raw/manifests/mhclg_homelessness.json: the GOV.UK page that
 * carries the detailed local authority tables, and the exact title the new attachment
 * will have. It asks that one page (GOV.UK Content API) for that one title. Found, it
 * downloads the file into data/raw/mhclg_homelessness/ and prints its hash; with --write
 * it also replaces the H-CLIC entry in the manifest. Not found, it stops and says so.
 * It never searches, and never falls back to a file with a different title, because a
 * near match is how a previous quarter gets banked as the new one.
 *
 *   node scripts/fetch/fetch-housing-release.mjs                    # 26 Nov 2026, dry run
 *   node scripts/fetch/fetch-housing-release.mjs --write            # bank it
 *   node scripts/fetch/fetch-housing-release.mjs --title "Detailed local authority level tables: January to March 2026"
 *                                                                   # rehearsal on the held edition
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = resolve(ROOT, "data/raw/manifests/mhclg_homelessness.json");
const CONTENT_API = "https://www.gov.uk/api/content";

/** The attachment with exactly this title on a GOV.UK page, or null. */
export async function findAttachment(pageUrl, title, { fetchImpl = fetch } = {}) {
  const apiUrl = pageUrl.replace("https://www.gov.uk", CONTENT_API);
  const response = await fetchImpl(apiUrl, { headers: { "user-agent": "asylumstats-data-fetch" } });
  if (!response.ok) throw new Error(`${apiUrl} returned ${response.status}.`);
  const page = await response.json();
  const attachments = page.details?.attachments ?? [];
  return {
    attachment: attachments.find((item) => item.title === title) ?? null,
    nearest: attachments.map((item) => item.title).filter((name) => /^detailed local authority level tables/i.test(name ?? "")).slice(-3)
  };
}

async function main() {
  const args = process.argv.slice(2);
  const titleArg = args.includes("--title") ? args[args.indexOf("--title") + 1] : null;
  const write = args.includes("--write");
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const target = manifest.releaseDay?.sources?.find((source) => source.releaseId === "hclic");
  if (!target) throw new Error("No releaseDay.sources entry for hclic in the housing manifest.");

  const title = titleArg ?? target.attachmentTitle;
  const { attachment, nearest } = await findAttachment(target.tablesPage, title);
  if (!attachment) {
    console.error(`"${title}" is not on ${target.tablesPage} yet. Latest there: ${nearest.join("; ") || "none"}.`);
    console.error("Not published, or retitled. Re-run after 09:30; if retitled, check the page by eye before changing the manifest.");
    process.exit(1);
  }
  console.log(`Found "${attachment.title}": ${attachment.url}`);
  if (titleArg && !write) {
    console.log("Rehearsal: title found on the page; nothing downloaded.");
    return;
  }

  // The name and URL come from a remote API: take only a plain .ods file name, and only
  // from GOV.UK's asset host, so nothing can be written outside the raw folder.
  const file = String(attachment.filename ?? "");
  if (!/^[A-Za-z0-9._-]+\.ods$/.test(file)) throw new Error(`Refusing attachment file name "${file}".`);
  const assetUrl = new URL(attachment.url);
  if (assetUrl.protocol !== "https:" || assetUrl.hostname !== "assets.publishing.service.gov.uk") {
    throw new Error(`Refusing to download from ${assetUrl.origin}.`);
  }
  const download = await fetch(assetUrl, { headers: { "user-agent": "asylumstats-data-fetch" } });
  if (!download.ok) throw new Error(`${assetUrl} returned ${download.status}.`);
  const body = Buffer.from(await download.arrayBuffer());
  writeFileSync(resolve(ROOT, "data/raw/mhclg_homelessness", file), body);
  const sha256 = createHash("sha256").update(body).digest("hex");
  console.log(`Saved data/raw/mhclg_homelessness/${file}, ${body.length} bytes, sha256 ${sha256}`);
  if (!write) {
    console.log("Dry run: manifest unchanged. Re-run with --write to replace the H-CLIC entry.");
    return;
  }

  const old = manifest.files.find((entry) => entry.releaseId === "hclic");
  Object.assign(old, {
    file,
    label: `Statutory homelessness: detailed local authority-level tables, ${target.periodLabel}`,
    sourceUrl: attachment.url,
    landing: target.publicationPage,
    released: target.releaseTimestamp.slice(0, 10),
    period: target.period,
    retrieved: new Date().toISOString().slice(0, 10),
    sizeBytes: body.length,
    sha256,
    periodLabel: target.periodLabel,
    stockDate: target.stockDate
  });
  manifest.coverageEnd = target.stockDate;
  manifest.totalBytes = manifest.files.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Manifest updated: hclic now ${file}, coverageEnd ${target.stockDate}. By hand: statisticsStatus, ` +
      "nextEdition (docs/release-day.md section 3), then npm run transform:housing and npm run audit:housing."
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
