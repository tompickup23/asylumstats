#!/usr/bin/env node
/**
 * Projection integrity audit.
 *
 * `ethnic-projections.json` here is a byte-for-byte copy of the file published by
 * ukdemographics.co.uk at a named UKD commit, made by scripts/sync/sync-from-ukd.mjs,
 * which records the commit and the sha256 in data/sync/ukd-ethnic-projections.json.
 * This header used to say the two files were byte-identical without checking; by
 * October 2026 they differed in 635 values. Check 0 now tests it.
 *
 * Checks 1 to 4 run against the PUBLISHED file rather than the model inputs,
 * because the inputs are not in this repository. That makes them usable in CI,
 * and it means a fix to the model shows up here as the counts falling.
 *
 * Checks, in severity order:
 *   0. the file is the recorded UKD file: its sha256 matches the sync record, and
 *      the recorded UKD commit holds those same bytes (read from a local UKD
 *      checkout, UKD_REPO or ~/ukdemographics, else from GitHub; --offline skips
 *      GitHub and reports the commit as unchecked)
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
 *   node scripts/audit/projection-integrity.mjs --offline # no network for check 0
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAgainstRecord, checkRecordedCommit, readRecord } from "../sync/ukd-source.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const PROJ = resolve(ROOT, "src/data/live/ethnic-projections.json");

const checkOnly = process.argv.includes("--check");
const asJson = process.argv.includes("--json");
const offline = process.argv.includes("--offline");

const projBytes = readFileSync(PROJ);
const areas = JSON.parse(projBytes.toString("utf8")).areas;

// Check 0: identity with the recorded UKD commit.
const record = readRecord(ROOT);
const identityProblems = checkAgainstRecord(projBytes, record);
const upstream = record
  ? await checkRecordedCommit(record, { offline })
  : { checked: false, via: null, problems: [] };
identityProblems.push(...upstream.problems);

// A residual Census category cannot credibly become the plurality group in a
// local authority within one projection horizon. Past this, it is model
// divergence rather than a demographic forecast.
const RUNAWAY_CEILING_PCT = 25;
const RUNAWAY_MULTIPLE = 3;
const RESIDUAL_GROUPS = ["other", "mixed"];
const PROJ_YEARS = ["2031", "2041", "2051", "2061"];

const round = (n) => Math.round(n * 100) / 100;
const failures = { identity: [], sum: [], runaway: [], band: [], coverage: [] };

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

for (const problem of identityProblems) failures.identity.push({ problem });

const counts = Object.fromEntries(Object.entries(failures).map(([k, v]) => [k, v.length]));
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (asJson) {
  console.log(JSON.stringify({ areas: Object.keys(areas).length, ukdCommit: record?.source?.commit ?? null, ukdCheckedVia: upstream.via, counts, failures }, null, 2));
} else {
  console.log(`Projection integrity: ${Object.keys(areas).length} areas`);
  console.log(record
    ? `Source: UKD ${record.source.commit.slice(0, 12)} (${record.source.committedAt}), ${upstream.checked ? `checked via ${upstream.via}` : "commit not checked"}\n`
    : "Source: no sync record\n");
  report("Identical to the recorded UKD file", failures.identity, (f) => f.problem);
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
