#!/usr/bin/env node
/**
 * Projection integrity audit.
 *
 * `ethnic-projections.json` here is byte-identical to the one published by
 * ukdemographics.co.uk: both sites serve the same Hamilton-Perry run. An audit of
 * that model on 13 Aug 2026 found defects that are live on both, so this is the
 * same guard, ported, and it reports the same counts.
 *
 * It runs against the PUBLISHED file rather than the model inputs, because the
 * inputs are not in this repository either. That makes it usable in CI, and it
 * means a fix to the model shows up here as the counts falling.
 *
 * Checks, in severity order:
 *   1. group shares sum to 100 in every projected year
 *   2. no group runs away from its 2021 base beyond a plausibility ceiling
 *   3. the published point estimate sits inside its own stochastic band
 *   4. 2061 is present for the same areas as 2051
 *
 * Check 3 is what `src/lib/projection-consistency.ts` already withholds at render
 * time. This measures how much it is withholding.
 *
 *   node scripts/audit/projection-integrity.mjs           # report
 *   node scripts/audit/projection-integrity.mjs --check   # exit 1 on any finding
 *   node scripts/audit/projection-integrity.mjs --json    # machine-readable
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const PROJ = resolve(ROOT, "src/data/live/ethnic-projections.json");

const checkOnly = process.argv.includes("--check");
const asJson = process.argv.includes("--json");

const areas = JSON.parse(readFileSync(PROJ, "utf8")).areas;

// A residual Census category cannot credibly become the plurality group in a
// local authority within one projection horizon. Past this, it is model
// divergence rather than a demographic forecast.
const RUNAWAY_CEILING_PCT = 25;
const RUNAWAY_MULTIPLE = 3;
const RESIDUAL_GROUPS = ["other", "mixed"];
const PROJ_YEARS = ["2031", "2041", "2051", "2061"];

const round = (n) => Math.round(n * 100) / 100;
const failures = { sum: [], runaway: [], band: [], coverage: [] };

for (const [code, area] of Object.entries(areas)) {
  const name = area.areaName ?? code;
  const proj = area.projections ?? {};
  const base = area.current?.groups ?? {};

  for (const year of PROJ_YEARS) {
    const row = proj[year];
    if (!row) continue;

    const sum = Object.values(row).reduce((t, v) => t + (v ?? 0), 0);
    if (Math.abs(sum - 100) > 0.6) failures.sum.push({ name, year, sum: round(sum) });

    for (const group of RESIDUAL_GROUPS) {
      const now = base[group] ?? 0;
      const then = row[group] ?? 0;
      if (then >= RUNAWAY_CEILING_PCT && (now === 0 || then >= now * RUNAWAY_MULTIPLE)) {
        failures.runaway.push({ name, year, group, base2021: now, projected: then });
      }
    }
  }

  const stochastic = area.stochastic ?? {};
  for (const year of ["2031", "2041", "2051"]) {
    const point = proj[year]?.white_british;
    const band = stochastic[year]?.wbi;
    if (point == null || !band) continue;
    if (point < band.p10 || point > band.p90) {
      failures.band.push({
        name, year, point, p10: band.p10, p90: band.p90,
        missPp: round(Math.min(Math.abs(point - band.p10), Math.abs(point - band.p90)))
      });
    }
  }

  if (proj["2051"] && !proj["2061"]) failures.coverage.push({ name });
}

const counts = Object.fromEntries(Object.entries(failures).map(([k, v]) => [k, v.length]));
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (asJson) {
  console.log(JSON.stringify({ areas: Object.keys(areas).length, counts, failures }, null, 2));
} else {
  console.log(`Projection integrity: ${Object.keys(areas).length} areas\n`);
  report("Group shares do not sum to 100", failures.sum, (f) => `${f.name} ${f.year}: sums to ${f.sum}`);
  report("Residual group runs away from its 2021 base", failures.runaway,
    (f) => `${f.name} ${f.year}: ${f.group} ${f.base2021}% (2021) -> ${f.projected}%`);
  report("Point estimate outside its own 80% band", failures.band,
    (f) => `${f.name} ${f.year}: ${f.point}% vs ${f.p10}-${f.p90}% (misses by ${f.missPp}pp)`);
  report("2051 present but 2061 missing", failures.coverage, (f) => f.name);
  console.log(total === 0 ? "PASS" : `${total} findings`);
}

function report(title, list, fmt) {
  if (list.length === 0) {
    console.log(`  ok    ${title}`);
    return;
  }
  console.log(`  FAIL  ${title}: ${list.length}`);
  for (const f of list.slice(0, 8)) console.log(`          ${fmt(f)}`);
  if (list.length > 8) console.log(`          ... and ${list.length - 8} more`);
}

// Reporting is always useful; only --check turns findings into a non-zero exit,
// so this can be run in CI without failing the build until the model is fixed.
process.exit(checkOnly && total > 0 ? 1 : 0);
