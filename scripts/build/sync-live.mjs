#!/usr/bin/env node
/**
 * Sync mart outputs into src/data/live.
 *
 * `data/marts/` is the source of truth. `src/data/live/` is what Astro imports, and for
 * every dataset listed here it is a build artefact: generated, gitignored, never edited
 * by hand. Before this existed the same JSON was committed twice, byte for byte, in
 * both places (tribunal-appeals.json alone is 6,378 lines in each).
 *
 * Only datasets that genuinely have a mart appear below. The rest of src/data/live is
 * still committed, because its generators write there directly and moving all 35 of
 * them is a separate job. Add a line here as each generator is moved onto a mart.
 *
 *   node scripts/build/sync-live.mjs           # copy marts into live
 *   node scripts/build/sync-live.mjs --check    # verify they match, change nothing
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

/** mart path (relative to data/marts) -> live filename. */
const SYNCED = {
  "uk_routes/local-route-latest.json": "local-route-latest.json",
  // Renamed on the way through: the mart is national-route-dashboard, the site has
  // always imported it as route-dashboard.
  "uk_routes/national-route-dashboard.json": "route-dashboard.json",
  "moj_tribunals/tribunal-appeals.json": "tribunal-appeals.json",
  "money_ledger/money-ledger.json": "money-ledger.json",
  "hotel_entities/hotel-entity-ledger.json": "hotel-entity-ledger.json",
  "hotel_entities/hotel-area-sightings.json": "hotel-area-sightings.json",
  "hotel_entities/hotel-archive-queue.json": "hotel-archive-queue.json",
  "small_boats/small-boats.json": "small-boats.json",
  "border_security/border-security.json": "border-security.json",
  "ho_spend/ho-asylum-entities.json": "ho-asylum-entities.json",
  "ho_spend/ho-asylum-by-year.json": "ho-asylum-by-year.json",
  "ho_spend/asylum-cost-reconciliation.json": "asylum-cost-reconciliation.json"
};

const checkOnly = process.argv.includes("--check");
const liveDir = resolve(ROOT, "src/data/live");
mkdirSync(liveDir, { recursive: true });

let copied = 0;
let drifted = 0;
const missing = [];

for (const [martPath, liveName] of Object.entries(SYNCED)) {
  const from = resolve(ROOT, "data/marts", martPath);
  const to = resolve(liveDir, liveName);

  if (!existsSync(from)) {
    missing.push(martPath);
    continue;
  }

  const source = readFileSync(from);

  if (checkOnly) {
    if (!existsSync(to) || !readFileSync(to).equals(source)) {
      console.error(`  drift: ${liveName} does not match ${martPath}`);
      drifted += 1;
    }
    continue;
  }

  writeFileSync(to, source);
  copied += 1;
}

if (missing.length) {
  console.error(`\nMissing mart(s):\n${missing.map((m) => `  ${m}`).join("\n")}`);
  process.exit(1);
}

if (checkOnly) {
  if (drifted) {
    console.error(`\n${drifted} file(s) out of sync. Run: npm run sync:live`);
    process.exit(1);
  }
  console.log(`sync-live: ${Object.keys(SYNCED).length} file(s) in sync with marts.`);
} else {
  console.log(`sync-live: copied ${copied} mart file(s) into src/data/live.`);
}
