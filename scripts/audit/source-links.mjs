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
 *   node scripts/audit/source-links.mjs --self-test # prove the guards can fire
 *
 * HEAD first, then GET, because some hosts refuse HEAD. A 403 is reported separately
 * from a 404: parliament.uk and some analyst sites block automated requests, and that is
 * not the same as a dead link.
 *
 * Three registries below, and every entry has to earn its place.
 *
 *   BOT_BLOCKED  Hosts that answer 403 or 429 to an automated request and serve the page
 *                normally in a browser, checked by hand on the date recorded. These are
 *                STILL FETCHED. The allowlist only excuses 403 and 429. If one of them
 *                ever answers 404 it is reported dead exactly as before, and if one
 *                starts answering 200 the entry is reported as stale so it can be
 *                deleted. An allowlist that swallows a real death is worse than no
 *                allowlist, so this one is scoped to the status codes it was written for.
 *
 *   RETIRED      Sources the publisher took down with no successor, formally retired in
 *                the data file named against each entry. Not fetched, because the host
 *                does not answer at all and a network error every run trains everyone to
 *                ignore the report. Retiring a source is a decision recorded in the data;
 *                this list only stops the checker relitigating it.
 *
 *   Wayback captures are verified against the CDX index, not by fetching the replay.
 *   Replay 404s and 503s intermittently under load, which is why two consecutive runs of
 *   this script once reported 8 dead and then 9. CDX is authoritative about whether a
 *   capture exists at a given timestamp. A check that flaps is a check nobody believes,
 *   so the flaky signal is not the one we read.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const strict = process.argv.includes("--strict");
const selfTest = process.argv.includes("--self-test");

const SEARCH_DIRS = ["src/data/live", "data/marts", "src/content", "data/manual"];

/**
 * Answers 403 or 429 to automation, loads normally in a browser.
 * `checked` is the date someone last opened it in a real browser and saw the page.
 */
const BOT_BLOCKED = [
  {
    url: "https://publications.parliament.uk/pa/cm5901/cmselect/cmhaff/541/report.html",
    checked: "2026-08-29",
    note: "Home Affairs Committee report. parliament.uk blocks non-browser user agents."
  },
  {
    url: "https://questions-statements.parliament.uk/written-questions/detail/2026-02-05/28968",
    checked: "2026-08-29",
    note: "Written question 28968. Same parliament.uk bot policy."
  },
  {
    url: "https://www.whatdotheyknow.com/request/asylum_seekers_hotels_2",
    checked: "2026-08-29",
    note: "mySociety rate-limits automated requests across the whole site."
  },
  {
    url: "https://www.whatdotheyknow.com/request/asylum_seekers_housed_in_rushcli_2",
    checked: "2026-08-29",
    note: "mySociety rate-limits automated requests across the whole site."
  },
  {
    url: "https://www.e-lindsey.gov.uk/article/27439/Response-to-Home-Office-announcement-that-it-will-use-a-hotel-in-the-district-for-asylum-contingency-accommodation",
    checked: "2026-08-29",
    note: "East Lindsey statement. Council CDN serves 403 to unknown user agents."
  },
  {
    url: "https://www.hotelowner.co.uk/102005-splendid-hospitality-group-acquires-the-stanwell-hotel-near-heathrow/",
    checked: "2026-08-29",
    note: "Trade press behind a bot filter."
  },
  {
    url: "https://commonslibrary.parliament.uk/research-briefings/cdp-2025-0184/",
    checked: "2026-08-29",
    note: "Commons Library debate pack. Same parliament.uk bot policy."
  }
];

/**
 * Retired sources. The publisher took the source down and no successor exists.
 * `recordedIn` must be a file that carries the retirement note, so the decision is
 * auditable somewhere other than this list.
 */
const RETIRED = [
  {
    url: "https://www.wsmp.wales/home",
    retired: "2026-08-23",
    recordedIn: "data/manual/regional-source-watch.csv",
    note:
      "Wales Strategic Migration Partnership. DNS resolves to 94.126.209.190 and nothing " +
      "answers on 80 or 443. The WLGA successor path is a soft 404. Wales has no regional " +
      "partner source until one exists."
  }
];

const botBlockedByUrl = new Map(BOT_BLOCKED.map((entry) => [entry.url, entry]));
const retiredByUrl = new Map(RETIRED.map((entry) => [entry.url, entry]));

/** A fragment is a position in a page, not a different page. */
function normalise(url) {
  return url.split("#")[0];
}

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

const AGENT = { "user-agent": "asylumstats-link-check" };

async function checkHttp(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        headers: AGENT,
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

const WAYBACK = /^https?:\/\/web\.archive\.org\/web\/(\d{4,14})(?:id_|if_|js_|cs_|im_)?\/(https?:\/\/.+)$/;

/**
 * Ask the CDX index whether a capture exists at the pinned timestamp.
 *
 * Returns 200 when it does, a string describing the problem when it does not, and
 * "cdx unavailable" when the index itself could not be reached, which is inconclusive
 * rather than dead. Reporting an unreachable index as a dead link is how the flapping
 * started.
 */
async function checkWayback(timestamp, original) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const api = new URL("https://web.archive.org/cdx/search/cdx");
      api.searchParams.set("url", original);
      api.searchParams.set("matchType", "exact");
      api.searchParams.set("fl", "timestamp,statuscode");
      const response = await fetch(api, {
        headers: AGENT,
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`cdx ${response.status}`);

      const rows = (await response.text())
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((row) => row.split(/\s+/));

      if (!rows.length) return `no capture of ${original} exists in the Wayback index`;
      if (rows.some(([captured]) => captured === timestamp)) return 200;

      const held = rows.map(([captured]) => captured).join(", ");
      return `pinned ${timestamp}, but the index holds only ${held}`;
    } catch {
      if (attempt < 2) await new Promise((done) => setTimeout(done, 2_000 * (attempt + 1)));
    }
  }
  return "cdx unavailable";
}

async function check(url) {
  const wayback = WAYBACK.exec(url);
  if (wayback) return checkWayback(wayback[1], wayback[2]);
  return checkHttp(url);
}

const entries = [...urls.entries()].filter(([url]) => !retiredByUrl.has(normalise(url)));
const skipped = [...urls.entries()].filter(([url]) => retiredByUrl.has(normalise(url)));

console.log(`Checking ${entries.length} distinct source URLs (${skipped.length} retired, not fetched)\n`);

const results = [];
const CONCURRENCY = 8;

for (let index = 0; index < entries.length; index += CONCURRENCY) {
  const batch = entries.slice(index, index + CONCURRENCY);
  const statuses = await Promise.all(batch.map(([url]) => check(url)));
  batch.forEach(([url, files], offset) => {
    results.push({ url, status: statuses[offset], files: [...files] });
  });
  process.stdout.write(`  ${Math.min(index + CONCURRENCY, entries.length)}/${entries.length}\r`);
}

const allowed = (row) =>
  botBlockedByUrl.has(normalise(row.url)) && (row.status === 403 || row.status === 429);

// A bot-blocked entry that has started answering 200 no longer needs excusing.
const staleAllowance = results.filter(
  (row) => botBlockedByUrl.has(normalise(row.url)) && row.status === 200
);

const dead = results.filter(
  (row) => row.status === 404 || row.status === 410 || (typeof row.status === "string" && row.status.startsWith("pinned ")) || (typeof row.status === "string" && row.status.startsWith("no capture"))
);
const blocked = results.filter(allowed);
const unexplainedBlock = results.filter(
  (row) => (row.status === 403 || row.status === 429) && !allowed(row)
);
const inconclusive = results.filter((row) => row.status === "cdx unavailable");
const errored = results.filter(
  (row) => typeof row.status === "string" && row.status.startsWith("error:")
);
const other = results.filter(
  (row) =>
    typeof row.status === "number" &&
    row.status >= 400 &&
    ![404, 410, 403, 429].includes(row.status)
);

const accounted =
  dead.length + blocked.length + unexplainedBlock.length + inconclusive.length + errored.length + other.length;
console.log(`\n${results.length - accounted} OK\n`);

const report = (label, rows, extra = () => null) => {
  if (!rows.length) return;
  console.log(`${label} (${rows.length}):`);
  for (const row of rows) {
    console.log(`  ${row.status}  ${row.url}`);
    const detail = extra(row);
    if (detail) console.log(`         ${detail}`);
    for (const file of row.files.slice(0, 3)) console.log(`         ${file}`);
  }
  console.log("");
};

report("DEAD", dead);
report("Other 4xx/5xx", other);
report(
  "403 or 429, NOT allowlisted, check by hand and either fix or add to BOT_BLOCKED",
  unexplainedBlock
);
report("Allowlisted, blocked to bots, verified in a browser", blocked, (row) => {
  const entry = botBlockedByUrl.get(normalise(row.url));
  return `checked ${entry.checked}: ${entry.note}`;
});
report("Stale allowlist entry, now answers 200, delete it from BOT_BLOCKED", staleAllowance);
report("Inconclusive, the Wayback index could not be reached, not treated as dead", inconclusive);
report("Network error", errored);

if (skipped.length) {
  console.log(`Retired, not fetched (${skipped.length}):`);
  for (const [url, files] of skipped) {
    const entry = retiredByUrl.get(normalise(url));
    console.log(`  ${url}`);
    console.log(`         retired ${entry.retired}, recorded in ${entry.recordedIn}`);
    for (const file of [...files].slice(0, 3)) console.log(`         ${file}`);
  }
  console.log("");
}

/**
 * Prove the guards can fire.
 *
 * A registry that excuses everything is decoration. These fixtures fail by construction
 * if the allowlist ever widens into "never report this URL" or the Wayback check ever
 * degrades into "any answer is fine".
 */
if (selfTest) {
  const failures = [];

  const deadButAllowlisted = {
    url: BOT_BLOCKED[0].url,
    status: 404,
    files: ["fixture"]
  };
  if (allowed(deadButAllowlisted)) {
    failures.push("BOT_BLOCKED excused a 404. The allowlist must only excuse 403 and 429.");
  }

  const stillBlocked = { url: BOT_BLOCKED[0].url, status: 403, files: ["fixture"] };
  if (!allowed(stillBlocked)) {
    failures.push("BOT_BLOCKED failed to excuse a 403, which is the case it exists for.");
  }

  const notListed = { url: "https://example.invalid/blocked", status: 403, files: ["fixture"] };
  if (allowed(notListed)) {
    failures.push("An unlisted URL was excused a 403.");
  }

  const missing = await checkWayback(
    "19700101000000",
    "https://howfarfrommydoorstep.github.io/clive/hotels.json"
  );
  if (missing === 200) {
    failures.push("The Wayback check passed a timestamp that has no capture.");
  }
  if (missing === "cdx unavailable") {
    console.log("Self-test: Wayback index unreachable, that fixture could not run.\n");
  }

  if (failures.length) {
    console.error("Self-test FAILED:");
    for (const failure of failures) console.error(`  ${failure}`);
    process.exit(1);
  }
  console.log("Self-test passed: the allowlist rejects a 404 and the Wayback check rejects a missing capture.\n");
}

if (dead.length) {
  console.log(
    `${dead.length} dead source link(s). The site's claim is that every figure traces ` +
      `to its release, so a 404 here is a broken promise, not a broken link.`
  );
  if (strict) process.exit(1);
} else if (unexplainedBlock.length) {
  console.log(
    `No dead source links, but ${unexplainedBlock.length} URL(s) answered 403 or 429 ` +
      `without an allowlist entry. Open each in a browser before adding it.`
  );
  if (strict) process.exit(1);
} else {
  console.log("No dead source links.");
}
