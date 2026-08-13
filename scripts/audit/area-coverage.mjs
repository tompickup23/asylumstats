#!/usr/bin/env node
/**
 * Area coverage audit.
 *
 * The routes dataset carries all 361 UK local authorities and is the spine every
 * place page hangs off. Every other dataset covers a subset, and until now nothing
 * recorded which. That mattered little while only 152 pages were built; it matters a
 * lot for the all-361 build, because the place template renders sections that most
 * areas cannot fill.
 *
 * This script measures real coverage per dataset, writes a manifest, and fails when a
 * dataset drops below its recorded floor. Run it in CI.
 *
 *   node scripts/audit/area-coverage.mjs           # report + write manifest
 *   node scripts/audit/area-coverage.mjs --check   # fail on regression, write nothing
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const LIVE = resolve(ROOT, "src/data/live");
const OUT = resolve(ROOT, "data/marts/_coverage/area-coverage.json");

const checkOnly = process.argv.includes("--check");

const read = (name) => JSON.parse(readFileSync(resolve(LIVE, `${name}.json`), "utf8"));

/** Codes keyed on an object, or collected from a list. */
const fromKeys = (obj) => new Set(Object.keys(obj ?? {}));
const fromList = (list, field = "areaCode") =>
  new Set((list ?? []).map((row) => row?.[field]).filter(Boolean));

const baseline = read("local-route-latest");
const spine = fromList(baseline.areas);
const total = spine.size;

/**
 * Tier describes what a missing area means for the page template.
 *   spine    every area has it; absence is a bug
 *   broad    near-complete; absence is a data gap worth chasing
 *   national a real national dataset with a defined scope (e.g. England only)
 *   partial  genuinely incomplete
 *   local    scoped to a region by design; the section must gate on presence
 */
const DATASETS = [
  { id: "local-route-latest", tier: "spine", scope: "UK, all local authorities",
    codes: (d) => fromList(d.areas) },
  { id: "economic-profile", tier: "broad", scope: "UK",
    codes: (d) => fromKeys(d.profiles) },
  { id: "area-series", tier: "broad", scope: "UK time series",
    codes: (d) => fromList(d) },
  { id: "ethnic-projections", tier: "national", scope: "England only (Hamilton-Perry model)",
    codes: (d) => fromKeys(d.areas) },
  { id: "scenario-summaries", tier: "national", scope: "England only, model scenarios",
    codes: (d) => fromKeys(d.areas) },
  { id: "school-validation", tier: "partial", scope: "DfE school census subset",
    codes: (d) => fromList(d.areas) },
  { id: "crime-dashboard", tier: "local", scope: "Lancashire plus comparators",
    codes: (d) => (Array.isArray(d.areas) ? fromList(d.areas) : fromKeys(d.areas)) },
  { id: "send-dashboard", tier: "local", scope: "Lancashire plus comparators",
    codes: (d) => (Array.isArray(d.areas) ? fromList(d.areas) : fromKeys(d.areas)) },
  { id: "asc-dashboard", tier: "local", scope: "Lancashire plus comparators",
    codes: (d) => (Array.isArray(d.areas) ? fromList(d.areas) : fromKeys(d.areas)) }
];

const results = DATASETS.map((dataset) => {
  let covered = 0;
  let offSpine = 0;
  let error = null;
  try {
    const codes = dataset.codes(read(dataset.id));
    for (const code of codes) {
      if (spine.has(code)) covered += 1;
      else offSpine += 1;
    }
  } catch (cause) {
    error = cause.message;
  }
  return {
    ...dataset,
    codes: undefined,
    covered,
    missing: total - covered,
    pct: Number(((covered / total) * 100).toFixed(1)),
    offSpine,
    error
  };
});

const manifest = {
  // No generatedAt: a timestamp would churn the file on every run and defeat the
  // point of diffing coverage in review.
  spineDataset: "local-route-latest",
  totalAreas: total,
  note:
    "Coverage of each dataset against the 361-area routes spine. 'local' tier datasets " +
    "are scoped by design and the place template must gate those sections on presence, " +
    "not render them empty. Regenerate with: node scripts/audit/area-coverage.mjs",
  datasets: results.map(({ id, tier, scope, covered, missing, pct, offSpine }) => ({
    id, tier, scope, covered, missing, pct, offSpine
  }))
};

const pad = (value, width) => String(value).padEnd(width);
console.log(`\nArea coverage against the ${total}-area routes spine\n`);
console.log(`${pad("dataset", 22)}${pad("tier", 10)}${"covered".padStart(9)}${"pct".padStart(8)}  scope`);
console.log("-".repeat(88));
for (const row of results) {
  if (row.error) {
    console.log(`${pad(row.id, 22)}${pad(row.tier, 10)}${"ERROR".padStart(9)}${"".padStart(8)}  ${row.error}`);
    continue;
  }
  console.log(
    `${pad(row.id, 22)}${pad(row.tier, 10)}${String(`${row.covered}/${total}`).padStart(9)}` +
      `${String(`${row.pct}%`).padStart(8)}  ${row.scope}`
  );
}

const errored = results.filter((row) => row.error);
if (errored.length) {
  console.error(`\n${errored.length} dataset(s) failed to load.`);
  process.exit(1);
}

if (checkOnly) {
  if (!existsSync(OUT)) {
    console.error(`\nNo baseline at ${OUT}. Run without --check first.`);
    process.exit(1);
  }
  const previous = JSON.parse(readFileSync(OUT, "utf8"));
  const before = new Map(previous.datasets.map((row) => [row.id, row.covered]));
  const regressions = results.filter((row) => row.covered < (before.get(row.id) ?? 0));
  if (regressions.length) {
    console.error("\nCoverage regressed:");
    for (const row of regressions) {
      console.error(`  ${row.id}: ${before.get(row.id)} -> ${row.covered}`);
    }
    process.exit(1);
  }
  console.log("\nNo coverage regression.");
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\nWrote ${OUT}`);
