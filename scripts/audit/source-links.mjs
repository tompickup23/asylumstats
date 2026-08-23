#!/usr/bin/env node
/**
 * Check that every source link the site publishes still resolves.
 *
 * The site's whole proposition is that any figure can be traced back to the government
 * release it came from. On 13 Aug 2026 the most prominent figure on the homepage, the
 * £5.77M a day hotel cost, linked to a Home Office media factsheet that had been taken
 * down and returned 404. Nothing noticed, because nothing checked.
 *
 * Government URLs rot in a specific way that makes this worth automating: media blog
 * posts get pulled, statistical-data-set URLs get retired (the small boats one has been
 * dead since February 2023), and assets move to new media hashes at every release.
 *
 *   node scripts/audit/source-links.mjs            # report
 *   node scripts/audit/source-links.mjs --strict   # exit 1 on any dead link
 *
 * HEAD first, then GET, because some hosts refuse HEAD. A 403 is reported separately
 * from a 404: parliament.uk and some analyst sites block automated requests, and that is
 * not the same as a dead link.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const strict = process.argv.includes("--strict");

const SEARCH_DIRS = ["src/data/live", "data/marts", "src/content", "data/manual"];

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(json|md|csv)$/.test(entry)) out.push(full);
  }
  return out;
}

/** url -> the files that publish it. */
const urls = new Map();
const URL_PATTERN = /https?:\/\/[^\s"'<>)\\,]+/g;

for (const dir of SEARCH_DIRS) {
  for (const file of walk(resolve(ROOT, dir))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(URL_PATTERN)) {
      const url = match[0].replace(/[.,;:]+$/, "");
      // Only external sources; skip our own site and schema/namespace URLs.
      if (/asylumstats\.co\.uk|schema\.org|www\.w3\.org|localhost/.test(url)) continue;
      if (!urls.has(url)) urls.set(url, new Set());
      urls.get(url).add(file.replace(`${ROOT}/`, ""));
    }
  }
}

console.log(`Checking ${urls.size} distinct source URLs\n`);

async function check(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        headers: { "user-agent": "asylumstats-link-check" },
        signal: AbortSignal.timeout(20_000)
      });
      if (response.ok || method === "GET") return response.status;
      if (response.status === 405 || response.status === 501) continue;
      return response.status;
    } catch (cause) {
      if (method === "GET") return `error: ${cause.message}`;
    }
  }
  return "unknown";
}

const entries = [...urls.entries()];
const results = [];
const CONCURRENCY = 8;

for (let i = 0; i < entries.length; i += CONCURRENCY) {
  const batch = entries.slice(i, i + CONCURRENCY);
  const statuses = await Promise.all(batch.map(([url]) => check(url)));
  batch.forEach(([url, files], index) => {
    results.push({ url, status: statuses[index], files: [...files] });
  });
  process.stdout.write(`  ${Math.min(i + CONCURRENCY, entries.length)}/${entries.length}\r`);
}

const dead = results.filter((row) => row.status === 404 || row.status === 410);
const blocked = results.filter((row) => row.status === 403 || row.status === 429);
const errored = results.filter((row) => typeof row.status === "string");
const other = results.filter(
  (row) => typeof row.status === "number" && row.status >= 400 && ![404, 410, 403, 429].includes(row.status)
);

console.log(`\n${results.length - dead.length - blocked.length - errored.length - other.length} OK\n`);

const report = (label, rows) => {
  if (!rows.length) return;
  console.log(`${label} (${rows.length}):`);
  for (const row of rows) {
    console.log(`  ${row.status}  ${row.url}`);
    for (const file of row.files.slice(0, 3)) console.log(`         ${file}`);
  }
  console.log("");
};

report("DEAD", dead);
report("Other 4xx/5xx", other);
report("Blocked to bots, not necessarily dead", blocked);
report("Network error", errored);

if (dead.length) {
  console.log(
    `${dead.length} dead source link(s). The site's claim is that every figure traces ` +
      `to its release, so a 404 here is a broken promise, not a broken link.`
  );
  if (strict) process.exit(1);
} else {
  console.log("No dead source links.");
}
