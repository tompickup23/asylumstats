#!/usr/bin/env node
/**
 * Refresh the numeric facts in asylum-finance.json from the routes mart.
 *
 * This file is one of the four on the site with no generator, and it showed: it still
 * said 41,000 small boats for the year ending December 2025 and 31,000 people in hotels
 * at the end of that December, months after the March 2026 release. Nothing rendered
 * those figures, because `facts` has no consumer and `hotelFacts` reaches only the
 * disabled hotels page, so they were a landmine rather than a live error. Re-enabling
 * that page would have shipped all of them.
 *
 * Every one of those numbers already exists in the routes mart, which is exactly why
 * hand-maintaining a second copy is what made them stale. So the prose here stays
 * hand-curated (scope rules, route family definitions, inclusion tests, provider and
 * evidence notes, all of which are judgement and belong to a person) and the numbers are
 * regenerated. Idempotent: run it as often as you like.
 *
 *   node scripts/transform/transform-asylum-finance.mjs
 *   node scripts/transform/transform-asylum-finance.mjs --check   # fail if stale
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FINANCE = resolve(ROOT, "src/data/live/asylum-finance.json");
const DASHBOARD = resolve(ROOT, "data/marts/uk_routes/national-route-dashboard.json");
const MANIFEST = resolve(ROOT, "data/raw/manifests/asylum_finance.json");

const checkOnly = process.argv.includes("--check");

const finance = JSON.parse(readFileSync(FINANCE, "utf8"));
const dashboard = JSON.parse(readFileSync(DASHBOARD, "utf8"));

const card = (id) => {
  const found = dashboard.nationalCards.find((entry) => entry.id === id);
  if (!found) throw new Error(`No national card "${id}" in the routes mart`);
  return found;
};
const routeFamily = (id) => {
  const found = dashboard.routeFamilies.find((entry) => entry.id === id);
  if (!found) throw new Error(`No route family "${id}" in the routes mart`);
  return found;
};
const supportRow = (metricId) => {
  const found = dashboard.nationalSystemDynamics.latestSupportBreakdown.find(
    (entry) => entry.metricId === metricId
  );
  if (!found) throw new Error(`No support breakdown row "${metricId}" in the routes mart`);
  return found;
};

const fmt = (value) => value.toLocaleString("en-GB");
const snapshot = dashboard.localSnapshotDate;
const asAt = `As at ${new Date(`${snapshot}T00:00:00Z`).toLocaleDateString("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC"
})}`;

const smallBoats = card("small_boat_arrivals");
const supported = card("supported_asylum");
const resettled = card("resettled_total");
const afghan = card("afghan_arrivals");
const familyReunion = card("family_reunion");
const safeLegal = routeFamily("safe_legal_total");
const hotels = supportRow("hotel");

// Afghan share is derived, not carried: it was a written-down 89% against a resettlement
// total that has since changed.
const afghanSharePct = Math.round((afghan.value / resettled.value) * 100);

/** Rebuild a fact card, keeping the hand-written framing and replacing the figures. */
const rebuild = (existing, { value, period, sourceUrl }) => ({
  ...existing,
  value,
  period,
  ...(sourceUrl ? { sourceUrl } : {})
});

const byLabel = (list, label) => {
  const found = list.find((entry) => entry.label === label);
  if (!found) throw new Error(`No existing fact labelled "${label}" to refresh`);
  return found;
};

const facts = [
  rebuild(byLabel(finance.facts, "Small boat arrivals"), {
    value: fmt(smallBoats.value),
    period: smallBoats.period,
    sourceUrl: smallBoats.sourceUrl
  }),
  rebuild(byLabel(finance.facts, "People in asylum hotels"), {
    value: fmt(hotels.value),
    period: asAt
  }),
  rebuild(byLabel(finance.facts, "Resettled refugees"), {
    value: fmt(resettled.value),
    period: resettled.period,
    sourceUrl: resettled.sourceUrl
  }),
  rebuild(byLabel(finance.facts, "Afghan share of resettlement"), {
    value: `${afghanSharePct}%`,
    period: resettled.period,
    sourceUrl: resettled.sourceUrl
  }),
  rebuild(byLabel(finance.facts, "Refugee Family Reunion visas"), {
    value: fmt(familyReunion.value),
    period: familyReunion.period,
    sourceUrl: familyReunion.sourceUrl
  }),
  rebuild(byLabel(finance.facts, "Safe and legal humanitarian grants"), {
    value: fmt(safeLegal.latestValue),
    period: safeLegal.latestPeriod,
    sourceUrl: safeLegal.sourceUrl
  })
];

const hotelFacts = finance.hotelFacts.map((fact) => {
  if (fact.label === "People in asylum hotels") {
    return rebuild(fact, { value: fmt(hotels.value), period: asAt });
  }
  // "Hotels in use" is a count of sites, not people, and no current release publishes
  // it: the 197 came from a Home Affairs Committee report in January 2026. It cannot be
  // derived here, so it keeps its stated date and the manifest's freshness check is what
  // flags it rather than a silent refresh.
  return fact;
});

const updated = { ...finance, facts, hotelFacts };
const serialised = `${JSON.stringify(updated, null, 2)}\n`;

if (checkOnly) {
  if (readFileSync(FINANCE, "utf8") !== serialised) {
    console.error(
      "asylum-finance.json numeric facts are stale against the routes mart.\n" +
        "Run: npm run transform:asylumfinance"
    );
    process.exit(1);
  }
  console.log("asylum-finance: numeric facts match the routes mart.");
  process.exit(0);
}

writeFileSync(FINANCE, serialised);

// Freshness is policed by data age against the quarterly cycle: these facts are only as
// current as the routes release they derive from.
const manifest = {
  dataset: "asylum_finance",
  publisher: "asylumstats, derived",
  release: "Asylum finance scope rules and headline facts",
  cadence: "quarterly, follows the Home Office immigration system statistics",
  landing: "https://www.gov.uk/government/collections/immigration-statistics-quarterly-release",
  bank: "n/a, derived from the routes mart",
  areaTier: "national",
  provenance:
    "Scope rules, route family definitions and inclusion tests are hand-curated judgement. " +
    "The numeric facts are regenerated by scripts/transform/transform-asylum-finance.mjs " +
    "from data/marts/uk_routes/national-route-dashboard.json.",
  manualFields: [
    "hotelFacts.Hotels in use: site count, no current release publishes it, last stated January 2026",
    "hotelFacts.Daily hotel cost: the cited Home Office factsheet URL now returns 404",
    "hotelFacts.Hotel cost share: NAO, first 7 months of 2024/25"
  ],
  coverageEnd: snapshot,
  // Quarterly stock data is ~149 days old by the time the next release lands (31 March
  // data, 27 August release), so the threshold sits just past that. Tighter and it fires
  // every quarter for a fortnight while nothing is actually wrong.
  maxAgeDays: 155,
  fileCount: 1,
  files: [{ file: "src/data/live/asylum-finance.json" }]
};
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `asylum-finance refreshed from the routes mart (${snapshot}):\n` +
    `  small boats        ${fmt(smallBoats.value)}  ${smallBoats.period}\n` +
    `  in hotels          ${fmt(hotels.value)}  ${asAt}\n` +
    `  supported          ${fmt(supported.value)}\n` +
    `  resettled          ${fmt(resettled.value)}  (Afghan share ${afghanSharePct}%)\n` +
    `  family reunion     ${fmt(familyReunion.value)}\n` +
    `  safe and legal     ${fmt(safeLegal.latestValue)}`
);
