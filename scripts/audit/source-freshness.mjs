#!/usr/bin/env node
/**
 * Source freshness check.
 *
 * Every stale item found on 13 Aug 2026 had the same shape: a government release came
 * out, nobody noticed, and the site kept serving the previous one. Small boats sat four
 * and a half months behind while the Home Office published weekly. The Annual Report and
 * Accounts had been out since 14 July. The organised immigration crime tables had been
 * superseded. The Monday refresh cron ran through all of it without complaint, because
 * nothing compared a source's next-edition date against today.
 *
 * The manifests now carry `nextEdition`, so this is that comparison. It reads the date
 * from an argument or SOURCE_FRESHNESS_TODAY rather than the clock, so a CI run and a
 * local run on the same commit give the same answer.
 *
 *   node scripts/audit/source-freshness.mjs 2026-08-13
 *   node scripts/audit/source-freshness.mjs 2026-08-13 --strict   # exit 1 when overdue
 *
 * Default is advisory. --strict is for the scheduled run, where an overdue source should
 * be loud rather than another line nobody reads.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFESTS = resolve(HERE, "../../data/raw/manifests");

const strict = process.argv.includes("--strict");
const dateArg = process.argv.slice(2).find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
const today = dateArg ?? process.env.SOURCE_FRESHNESS_TODAY;

if (!today) {
  console.error(
    "Pass the date explicitly: source-freshness.mjs YYYY-MM-DD [--strict]\n" +
      "or set SOURCE_FRESHNESS_TODAY. Reading the clock would make this " +
      "non-reproducible across runs of the same commit."
  );
  process.exit(2);
}

const daysBetween = (from, to) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

const rows = [];
for (const file of readdirSync(MANIFESTS).filter((name) => name.endsWith(".json")).sort()) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(MANIFESTS, file), "utf8"));
  } catch (cause) {
    rows.push({ dataset: file.replace(/\.json$/, ""), state: "unreadable", detail: cause.message });
    continue;
  }

  const dataset = manifest.dataset ?? file.replace(/\.json$/, "");

  if (manifest.undeclared) {
    rows.push({ dataset, state: "undeclared", detail: "no provenance in SOURCES" });
    continue;
  }
  if (!manifest.nextEdition) {
    // A source can be on a cycle without having a next-edition date: the small boats
    // series publishes every Friday and never announces a date. For those, freshness
    // comes from the data itself, via coverageEnd and maxAgeDays stamped by the
    // transform. Without this the series most likely to go stale was the one classified
    // "no-cycle" and never checked.
    if (manifest.coverageEnd && manifest.maxAgeDays) {
      const ageDays = daysBetween(manifest.coverageEnd, today);
      rows.push({
        dataset,
        state: ageDays > manifest.maxAgeDays ? "OVERDUE" : "current",
        detail: manifest.cadence ?? manifest.release ?? "",
        nextEdition: `data to ${manifest.coverageEnd}`,
        overdueDays: ageDays - manifest.maxAgeDays,
        ageDays,
        blockedOn: manifest.blockedOn
      });
      continue;
    }
    // Genuinely not on a cycle: a one-off academic dataset, say.
    rows.push({ dataset, state: "no-cycle", detail: manifest.release ?? "" });
    continue;
  }

  const overdueDays = daysBetween(manifest.nextEdition, today);
  rows.push({
    dataset,
    state: overdueDays > 0 ? "OVERDUE" : "current",
    detail: manifest.release ?? "",
    nextEdition: manifest.nextEdition,
    overdueDays,
    blockedOn: manifest.blockedOn
  });
}

const order = { OVERDUE: 0, undeclared: 1, unreadable: 1, current: 2, "no-cycle": 3 };
rows.sort((a, b) => (order[a.state] - order[b.state]) || a.dataset.localeCompare(b.dataset));

console.log(`\nSource freshness as at ${today}\n`);
for (const row of rows) {
  const label = row.dataset.padEnd(26);
  if (row.state === "OVERDUE") {
    console.log(
      row.ageDays === undefined
        ? `${label} OVERDUE by ${row.overdueDays}d  (next edition was ${row.nextEdition})`
        : `${label} OVERDUE      (${row.detail}, newest data ${row.ageDays}d old, limit ${row.ageDays - row.overdueDays}d)`
    );
  } else if (row.state === "current") {
    console.log(
      row.ageDays === undefined
        ? `${label} current      (next edition ${row.nextEdition}, in ${-row.overdueDays}d)`
        : `${label} current      (${row.detail}, newest data ${row.ageDays}d old)`
    );
  } else {
    console.log(`${label} ${row.state.padEnd(12)} ${row.detail}`);
  }
}

/**
 * A source that is overdue because nobody has built its ingest yet is a backlog item,
 * not a regression, and failing the weekly refresh on it every week until someone does
 * teaches people to ignore the gate. A manifest may declare `blockedOn` to say so. Those
 * rows still print, still count as overdue in the summary, and are named in their own
 * line so they cannot quietly disappear; they just do not fail --strict.
 *
 * Anything without `blockedOn` fails --strict as before. Adding the field is a deliberate
 * act with a stated reason, which is the difference between a known gap and a silent one.
 */
const overdue = rows.filter((row) => row.state === "OVERDUE");
const blocked = overdue.filter((row) => row.blockedOn);
const regressions = overdue.filter((row) => !row.blockedOn);
const unknown = rows.filter((row) => row.state === "undeclared" || row.state === "unreadable");

console.log();
if (overdue.length) {
  console.log(`${overdue.length} source(s) overdue: ${overdue.map((r) => r.dataset).join(", ")}`);
} else {
  console.log("No source is past its next-edition date.");
}
if (blocked.length) {
  console.log(
    `${blocked.length} of those are known gaps and do not fail --strict:\n` +
      blocked.map((r) => `  ${r.dataset}: ${r.blockedOn}`).join("\n")
  );
}
if (unknown.length) {
  console.log(`${unknown.length} source(s) without declared provenance: ${unknown.map((r) => r.dataset).join(", ")}`);
}

if (strict && regressions.length) process.exit(1);
