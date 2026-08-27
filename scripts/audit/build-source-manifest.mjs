#!/usr/bin/env node
/**
 * Source manifest builder for the Drive data bank.
 *
 * Every raw file the site derives from gets a sha256, a size and the release it was
 * published under, so any published figure can be traced to the exact file that
 * produced it. That traceability is the site's central claim and it is currently the
 * one thing it cannot demonstrate: the model inputs are gitignored and nothing records
 * what was downloaded when.
 *
 * Manifests live in `data/raw/manifests/` in the repo and are mirrored to
 * `doge:Asylum Stats/_manifests/`. The files themselves are too large for git and live
 * only in the data bank.
 *
 *   node scripts/audit/build-source-manifest.mjs uk_routes
 *   node scripts/audit/build-source-manifest.mjs --all
 *
 * Release metadata is not guessable from a filename, so it is declared here. A dataset
 * with no entry still gets hashed, but is flagged so it cannot quietly stay unlabelled.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const RAW = resolve(ROOT, "data/raw");
const MANIFESTS = resolve(ROOT, "data/raw/manifests");

/**
 * Declared provenance per dataset.
 *
 * `bank` is the destination folder under `doge:Asylum Stats/`.
 * `nextEdition` drives the staleness check: once it is in the past, CI should complain
 * rather than letting a release slip by unnoticed, which is how the site ended up four
 * and a half months behind on small boats.
 * `areaTier` mirrors scripts/audit/area-coverage.mjs so the all-361 page build knows
 * which sections a given area can actually fill.
 */
const SOURCES = {
  uk_routes: {
    publisher: "Home Office",
    release: "Immigration system statistics, year ending June 2026",
    releaseDate: "2026-08-27",
    nextEdition: "2026-11-30",
    landing:
      "https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-june-2026",
    bank: "home-office/quarterly",
    areaTier: "spine"
  },
  moj_tribunals: {
    publisher: "Ministry of Justice",
    release: "Tribunal Statistics Quarterly: January to March 2026",
    releaseDate: "2026-06-11",
    nextEdition: "2026-09-10",
    landing:
      "https://www.gov.uk/government/statistics/tribunals-statistics-quarterly-january-to-march-2026",
    bank: "moj",
    areaTier: "national"
  },
  newethpop: {
    publisher: "UK Data Archive / University of Leeds",
    release: "NEWETHPOP ethnic population projections (Leeds2)",
    releaseDate: "2017-01-01",
    nextEdition: null,
    landing: "https://doi.org/10.5255/UKDA-SN-852508",
    bank: "model-inputs",
    areaTier: "national",
    note: "Academic comparison set. Used only to validate our model against, never published as ours."
  },
  census_base: { publisher: "ONS", release: "Census 2021 base population", releaseDate: null,
    nextEdition: null, landing: "https://www.ons.gov.uk/census", bank: "model-inputs", areaTier: "national" },
  census_single_year: { publisher: "ONS", release: "Census 2021 single year of age", releaseDate: null,
    nextEdition: null, landing: "https://www.ons.gov.uk/census", bank: "model-inputs", areaTier: "national" },
  census_ethnicity: { publisher: "ONS", release: "Census 2021 ethnicity", releaseDate: null,
    nextEdition: null, landing: "https://www.ons.gov.uk/census", bank: "model-inputs", areaTier: "national" },
  census_ethnicity_detail: { publisher: "ONS", release: "Census 2021 ethnicity detail", releaseDate: null,
    nextEdition: null, landing: "https://www.ons.gov.uk/census", bank: "model-inputs", areaTier: "national" },
  census_2011_ethnicity_age: { publisher: "ONS", release: "Census 2011 DC2101EW ethnicity by age", releaseDate: null,
    nextEdition: null, landing: "https://www.nomisweb.co.uk", bank: "model-inputs", areaTier: "national" },
  census_2011_migration: { publisher: "ONS", release: "Census 2011 migration", releaseDate: null,
    nextEdition: null, landing: "https://www.nomisweb.co.uk", bank: "model-inputs", areaTier: "national" },
  census_migration: { publisher: "ONS", release: "Census 2021 migration", releaseDate: null,
    nextEdition: null, landing: "https://www.ons.gov.uk/census", bank: "model-inputs", areaTier: "national" },
  snpp: { publisher: "ONS", release: "Subnational population projections, 2022-based", releaseDate: null,
    nextEdition: null, landing: "https://www.ons.gov.uk", bank: "ons", areaTier: "national" },
  ons_births: { publisher: "ONS", release: "Births in England and Wales 2025", releaseDate: "2026-05-27",
    nextEdition: null, landing: "https://www.ons.gov.uk", bank: "ons", areaTier: "national" },
  dfe_schools: { publisher: "Department for Education", release: "School census 2025/26", releaseDate: "2026-06-04",
    nextEdition: null, landing: "https://explore-education-statistics.service.gov.uk", bank: "dfe", areaTier: "partial" },
  regional_sources: { publisher: "North West RSMP", release: "Regional strategic migration partnership data",
    releaseDate: null, nextEdition: null, landing: "https://northwestrsmp.org.uk", bank: "home-office/transparency",
    areaTier: "local" },
  lancashire_cc: { publisher: "Lancashire County Council", release: "LCC transparency data (via aidoge gh-pages)",
    releaseDate: null, nextEdition: null, landing: "https://www.lancashire.gov.uk", bank: "home-office/transparency",
    areaTier: "local" }
};

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile() && !entry.name.startsWith(".")) {
      out.push({ full, rel: full.slice(base.length + 1) });
    }
  }
  return out;
}

function build(dataset) {
  const dir = resolve(RAW, dataset);
  if (!existsSync(dir)) return { dataset, skipped: "not on disk" };

  const declared = SOURCES[dataset] ?? null;
  const files = walk(dir)
    .map(({ full, rel }) => {
      const stat = statSync(full);
      return {
        file: rel,
        sizeBytes: stat.size,
        sha256: sha256(full),
        modified: stat.mtime.toISOString().slice(0, 10)
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));

  const manifest = {
    dataset,
    ...(declared ?? { undeclared: true }),
    fileCount: files.length,
    totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
    files
  };

  writeFileSync(
    resolve(MANIFESTS, `${dataset}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return { dataset, files: files.length, bytes: manifest.totalBytes, undeclared: !declared };
}

const args = process.argv.slice(2);
const targets = args.includes("--all")
  ? readdirSync(RAW, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "manifests")
      .map((e) => e.name)
  : args;

if (!targets.length) {
  console.error("Usage: build-source-manifest.mjs <dataset>... | --all");
  process.exit(1);
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
let undeclaredCount = 0;

for (const dataset of targets) {
  const result = build(dataset);
  if (result.skipped) {
    console.log(`${dataset.padEnd(26)} skipped (${result.skipped})`);
    continue;
  }
  if (result.undeclared) undeclaredCount += 1;
  console.log(
    `${dataset.padEnd(26)} ${String(result.files).padStart(4)} files  ${mb(result.bytes).padStart(10)}` +
      `${result.undeclared ? "  UNDECLARED: add it to SOURCES" : ""}`
  );
}

if (undeclaredCount) {
  console.log(`\n${undeclaredCount} dataset(s) have no declared provenance.`);
}
