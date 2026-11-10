#!/usr/bin/env node
/**
 * Release day, as one command.
 *
 * Runs the refresh job's steps locally in the order .github/workflows/refresh-data.yml
 * runs them, then the steps docs/release-day.md adds on the day: the housing panel, the
 * build, and the reconciliation of the headline counts against the Home Office tables.
 * Every step is timed, and the table at the end is what goes in the release-day note.
 *
 *   npm run release-day -- --expect september-2026
 *   npm run release-day -- --expect june-2026 --date 2026-11-04   # a rehearsal
 *
 * --expect is required. It is the period slug the Home Office files must carry once the
 * routes fetch has run. Without it a run at 09:31, before GOV.UK has swapped the files,
 * would fetch June again, find nothing wrong and report the release refreshed.
 *
 * Steps marked "core" stop the run when they fail, as they stop the workflow. Steps
 * marked "secondary" are continue-on-error in the workflow and are recorded, not fatal.
 * Steps marked "advisory" never fail. Nothing here commits, pushes or deploys: the run
 * leaves a working tree for a human to read, test and merge.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? null : args[index + 1];
};
const expect = option("expect");
const date = option("date") ?? new Date().toISOString().slice(0, 10);
const summaryPath = option("summary");
const from = option("from");

if (!expect) {
  console.error("Pass the period the release must carry: --expect september-2026");
  process.exit(2);
}

function expectPeriod() {
  const manifest = JSON.parse(readFileSync("data/raw/manifests/uk_routes.json", "utf8"));
  const stale = manifest.files.filter((file) => file.periodSlug !== expect);
  if (manifest.periodSlug !== expect || stale.length) {
    console.error(
      `The routes fetch found ${manifest.periodSlug}, not ${expect}` +
        (stale.length ? ` (${stale.map((file) => file.fileName).join(", ")})` : "") +
        ". GOV.UK has not swapped the files yet, or one dataset lags. Stop here and re-run."
    );
    return 1;
  }
  console.log(`All ${manifest.files.length} route files carry ${expect}, published ${manifest.releaseDate}.`);
  return 0;
}

// The guards deploy.yml runs after its build, read from it so the two cannot drift.
const builtSiteGuards = /npx vitest run (tests\/[^\n]+)/.exec(readFileSync(".github/workflows/deploy.yml", "utf8"))[1].trim().split(/\s+/);

// A dist left by an earlier build makes `npm test` run the built-site guards against old
// pages: the 4 November rehearsal failed its second run that way. CI starts without one.
function clearDist() {
  rmSync("dist", { recursive: true, force: true });
  return 0;
}

const steps = [
  { name: "Fetch and transform MOJ tribunals", kind: "core", cmd: ["npm", "run", "ingest:tribunals"] },
  { name: "Fetch and transform routes", kind: "core", cmd: ["npm", "run", "ingest:routes"] },
  { name: `Routes files carry ${expect}`, kind: "core", fn: expectPeriod },
  { name: "Fetch and transform small boats", kind: "core", cmd: ["npm", "run", "ingest:smallboats"] },
  { name: "Refresh asylum finance facts", kind: "secondary", cmd: ["npm", "run", "transform:asylumfinance"] },
  { name: "Fetch and transform hotels", kind: "secondary", cmd: ["npm", "run", "ingest:hotels"] },
  { name: "Transform money ledger", kind: "core", cmd: ["npm", "run", "ingest:money"] },
  { name: "Fetch and transform Home Office spend", kind: "secondary", cmd: ["npm", "run", "ingest:hospend"] },
  { name: "Fetch and transform regional sources", kind: "secondary", cmd: ["npm", "run", "ingest:regionalsources"] },
  { name: "Check source freshness", kind: "advisory", cmd: ["node", "scripts/audit/source-freshness.mjs", date] },
  { name: "Check source links resolve", kind: "advisory", cmd: ["npm", "run", "audit:links"] },
  { name: "Report large figure moves", kind: "advisory", cmd: ["node", "scripts/audit/figure-changes.mjs", "--base", "HEAD"] },
  { name: "Clear any earlier build", kind: "core", fn: clearDist },
  { name: "Test the refreshed data", kind: "core", cmd: ["npm", "test"] },
  { name: "Headline counts match the Home Office tables", kind: "core", cmd: ["npm", "run", "audit:headlines"] },
  { name: "Transform housing panel", kind: "core", cmd: ["npm", "run", "transform:housing"] },
  { name: "Independent housing check", kind: "core", cmd: ["npm", "run", "audit:housing"] },
  { name: "Type check", kind: "core", cmd: ["npm", "run", "check"] },
  { name: "Build the site, with social cards", kind: "core", cmd: ["npm", "run", "build"], env: { BUILD_OG: "1" } },
  { name: "Guards that need the built site", kind: "core", cmd: ["npx", "vitest", "run", ...builtSiteGuards] },
  { name: "Built pages carry the table's counts", kind: "core", cmd: ["npm", "run", "audit:headlines", "--", "--dist"] },
  { name: "Fail if a source is past its next edition", kind: "secondary", cmd: ["node", "scripts/audit/source-freshness.mjs", date, "--strict"] }
];

const startAt = from ? steps.findIndex((step) => step.name.toLowerCase().startsWith(from.toLowerCase())) : 0;
if (startAt < 0) {
  console.error(`No step starts with "${from}".`);
  process.exit(2);
}

const results = [];
let stopped = null;
for (const step of steps.slice(startAt)) {
  console.log(`\n=== ${step.name} (${step.kind})`);
  const started = Date.now();
  const status = step.fn
    ? step.fn()
    : spawnSync(step.cmd[0], step.cmd.slice(1), { stdio: "inherit", env: { ...process.env, ...step.env } }).status;
  const seconds = Math.round((Date.now() - started) / 1000);
  const ok = status === 0 || step.kind === "advisory";
  results.push({ name: step.name, kind: step.kind, seconds, outcome: status === 0 ? "pass" : ok ? "advisory" : "fail" });
  if (!ok && step.kind === "core") {
    stopped = step.name;
    break;
  }
}

const minutes = (seconds) => `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
const total = results.reduce((sum, row) => sum + row.seconds, 0);
const table = [
  `Release-day run for ${expect}, freshness date ${date}`,
  "",
  "| Step | Kind | Time | Outcome |",
  "|---|---|---|---|",
  ...results.map((row) => `| ${row.name} | ${row.kind} | ${minutes(row.seconds)} | ${row.outcome} |`),
  `| Total | | ${minutes(total)} | ${stopped ? `stopped at "${stopped}"` : "complete"} |`
].join("\n");

console.log(`\n${table}`);
if (summaryPath) writeFileSync(summaryPath, `${table}\n`);
process.exit(stopped || results.some((row) => row.outcome === "fail") ? 1 : 0);
