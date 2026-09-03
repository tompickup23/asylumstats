#!/usr/bin/env node
/**
 * Fetch every Home Office "spending over £25,000" transparency file from GOV.UK.
 *
 * One publication per calendar year from 2014, plus the 2010-2013 archive publication.
 * Attachments are taken from the GOV.UK Content API rather than scraped off the page,
 * so a redesign of the publication template cannot silently break the harvest.
 *
 * Writes into data/raw/ho_spend/ (gitignored, regenerable) plus a _manifest.json
 * recording, for every file: publication slug, attachment title as published, source
 * URL and byte size. The manifest is what lets a published figure be traced back to
 * the exact file it came from.
 *
 *   node scripts/fetch/fetch-ho-spend.mjs            # fetch anything missing
 *   node scripts/fetch/fetch-ho-spend.mjs --force    # re-fetch everything
 *
 * Licence: GOV.UK transparency data is Crown copyright, published under the Open
 * Government Licence v3.0. Attribution is required wherever figures derived from it
 * are published.
 */

import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const OUT = resolve(ROOT, "data/raw/ho_spend");

const UA = "asylumstats.co.uk data harvester (+https://asylumstats.co.uk)";
const FIRST_ANNUAL_YEAR = 2014;
/** The archive publication covering 2010-2013, which predates the per-year slugs. */
const ARCHIVE_SLUG = "transparency-spend-over-25-000";
const KEEP = new Set([".csv", ".ods", ".xlsx", ".xls"]);

const force = process.argv.includes("--force");

function slugsToFetch() {
  const thisYear = new Date().getUTCFullYear();
  const slugs = [];
  for (let y = FIRST_ANNUAL_YEAR; y <= thisYear; y += 1) {
    slugs.push(`home-office-spending-over-25000-${y}`);
  }
  slugs.push(ARCHIVE_SLUG);
  return slugs;
}

async function get(url, asJson = false) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return asJson ? res.json() : Buffer.from(await res.arrayBuffer());
}

function safeName(slug, title, ext) {
  const stem = String(title || "untitled").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 80);
  return `${slug}__${stem}${ext}`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = [];
  let fetched = 0;
  let skipped = 0;
  const problems = [];

  for (const slug of slugsToFetch()) {
    let doc;
    try {
      doc = await get(`https://www.gov.uk/api/content/government/publications/${slug}`, true);
    } catch (err) {
      // A future year has no publication yet. That is expected, not a failure.
      if (String(err.message).includes("HTTP 404")) continue;
      problems.push(`${slug}: ${err.message}`);
      continue;
    }

    const attachments = doc?.details?.attachments ?? [];
    for (const attachment of attachments) {
      const url = attachment?.url;
      if (!url) continue;
      const ext = extname(new URL(url).pathname).toLowerCase();
      if (!KEEP.has(ext)) continue;

      const name = safeName(slug, attachment.title, ext);
      const path = resolve(OUT, name);

      if (!force && existsSync(path)) {
        skipped += 1;
      } else {
        try {
          writeFileSync(path, await get(url));
          fetched += 1;
          await new Promise((r) => setTimeout(r, 150));
        } catch (err) {
          problems.push(`${name}: ${err.message}`);
          continue;
        }
      }

      manifest.push({
        publication: slug,
        title: attachment.title ?? null,
        url,
        file: name,
        bytes: statSync(path).size
      });
    }
    console.log(`  ${slug}: ${attachments.length} attachment(s)`);
  }

  manifest.sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(resolve(OUT, "_manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);

  console.log(
    `\nfetch-ho-spend: ${manifest.length} file(s) in manifest ` +
      `(${fetched} downloaded, ${skipped} already present).`
  );
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
