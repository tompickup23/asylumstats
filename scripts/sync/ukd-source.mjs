/**
 * Where this site's copy of the UK Demographics projection file comes from, and
 * how to check that it is still that file.
 *
 * Asylum Stats publishes the same Hamilton-Perry run as ukdemographics.co.uk.
 * It used to receive the file by hand (commit ecfbb43, 14 August 2026), with
 * nothing to say which UKD version it was, and by October the two had drifted
 * apart in 635 values. Now the file is copied byte for byte from a named UKD
 * commit by scripts/sync/sync-from-ukd.mjs, which writes the commit and the
 * file's sha256 to RECORD_PATH. The audit and the tests read that record.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const UKD_REPOSITORY = "tompickup23/ukdemographics";
/** The file's path in both repositories. */
export const PROJECTION_PATH = "src/data/live/ethnic-projections.json";
/** The sync record, relative to the Asylum Stats root. */
export const RECORD_PATH = "data/sync/ukd-ethnic-projections.json";

/**
 * Every file this site copies from UK Demographics. Each is copied byte for byte
 * from a named UKD commit and has its own record. The SEND and social care files
 * were added on 12 October 2026, replacing 25-area files that this site had held
 * since April 2026 with no raw file or script behind them, which matched no
 * published table. Crime is deliberately not synced: this site does not set
 * recorded crime beside asylum support. The district lookup lets a two-tier
 * district read its county's SEND and social care figures, as UKD's place pages
 * do.
 *
 * `count` says what the file holds, for the record and for a sanity check that a
 * sync did not copy an empty or truncated file.
 */
export const SYNCED_FILES = [
  { key: "income-taxpayers-la", path: "src/data/live/income-taxpayers-la.json", record: "data/sync/ukd-income-taxpayers-la.json",
    count: (d) => Object.keys(d.areas ?? {}).length, unit: "areas" },
  { key: "population-estimates", path: "src/data/live/population-estimates.json", record: "data/sync/ukd-population-estimates.json",
    count: (d) => Object.keys(d.areas ?? {}).length, unit: "areas" },
  { key: "council-tax-spd", path: "src/data/live/council-tax-spd.json", record: "data/sync/ukd-council-tax-spd.json",
    count: (d) => Object.keys(d.areas ?? {}).length, unit: "areas" },
  { key: "ethnic-projections", path: PROJECTION_PATH, record: RECORD_PATH,
    count: (d) => Object.keys(d.areas ?? {}).length, unit: "areas" },
  { key: "send-dashboard", path: "src/data/live/send-dashboard.json", record: "data/sync/ukd-send-dashboard.json",
    count: (d) => Object.keys(d.areas ?? {}).length, unit: "areas" },
  { key: "asc-dashboard", path: "src/data/live/asc-dashboard.json", record: "data/sync/ukd-asc-dashboard.json",
    count: (d) => Object.keys(d.areas ?? {}).length, unit: "areas" },
  { key: "district-to-utla", path: "src/data/lookups/district-to-utla.json", record: "data/sync/ukd-district-to-utla.json",
    count: (d) => Object.keys(d.districts ?? {}).length, unit: "districts" }
];

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** A local UK Demographics checkout: UKD_REPO, else ~/ukdemographics. Null if absent. */
export function defaultUkdRepo() {
  const candidate = process.env.UKD_REPO ? resolve(process.env.UKD_REPO) : join(homedir(), "ukdemographics");
  return existsSync(join(candidate, ".git")) ? candidate : null;
}

function git(repo, args, opts = {}) {
  return execFileSync("git", ["-C", repo, ...args], { maxBuffer: 256 * 1024 * 1024, ...opts });
}

/** Resolve a ref or abbreviated hash to a full commit hash; throws if unknown. */
export function resolveCommit(repo, ref) {
  return git(repo, ["rev-parse", "--verify", `${ref}^{commit}`], { encoding: "utf8" }).trim();
}

/** True if `commit` is on the given branch (default origin/main) of the checkout. */
export function isOnBranch(repo, commit, branch = "origin/main") {
  try {
    git(repo, ["merge-base", "--is-ancestor", commit, branch], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** The file's bytes at `commit`, read from git's object store, not the working tree. */
export function readBlobLocal(repo, commit, path = PROJECTION_PATH) {
  return git(repo, ["show", `${commit}:${path}`]);
}

/** The file's bytes at `commit`, from GitHub (the repository is public). */
export async function readBlobRemote(commit, path = PROJECTION_PATH) {
  const url = `https://raw.githubusercontent.com/${UKD_REPOSITORY}/${commit}/${path}`;
  const res = await fetch(url, { headers: { "user-agent": "asylumstats-data-fetch" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function readRecord(root, recordPath = RECORD_PATH) {
  const p = join(root, recordPath);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

/**
 * Compare bytes against a sync record. Returns a list of problems, empty if the
 * bytes are the recorded file.
 */
export function checkAgainstRecord(buf, record) {
  const problems = [];
  if (!record) return ["no sync record"];
  if (!/^[0-9a-f]{40}$/.test(record.source?.commit ?? "")) problems.push("record has no full UKD commit hash");
  if (!/^[0-9a-f]{64}$/.test(record.sha256 ?? "")) problems.push("record has no sha256");
  const actual = sha256(buf);
  if (actual !== record.sha256) problems.push(`sha256 ${actual.slice(0, 12)}... is not the recorded ${String(record.sha256).slice(0, 12)}...`);
  if (buf.length !== record.bytes) problems.push(`${buf.length} bytes, record says ${record.bytes}`);
  return problems;
}

/**
 * Check that the recorded UKD commit really holds the recorded bytes: from a
 * local checkout when it has the commit, otherwise from GitHub unless offline.
 * Returns { checked: boolean, via, problems }.
 */
export async function checkRecordedCommit(record, { repo = defaultUkdRepo(), offline = false } = {}) {
  const commit = record?.source?.commit;
  if (!commit) return { checked: false, via: null, problems: ["record has no UKD commit"] };
  let buf = null;
  let via = null;
  if (repo) {
    try {
      buf = readBlobLocal(repo, commit, record.source.path ?? PROJECTION_PATH);
      via = `git ${repo}`;
    } catch {
      buf = null;
    }
  }
  if (!buf && !offline) {
    try {
      buf = await readBlobRemote(commit, record.source.path ?? PROJECTION_PATH);
      via = "github";
    } catch (e) {
      return { checked: false, via: null, problems: [`UKD ${commit.slice(0, 12)} not readable: ${e.message}`] };
    }
  }
  if (!buf) return { checked: false, via: null, problems: [`UKD ${commit.slice(0, 12)} not checked: no checkout holds it and --offline was given`] };
  const actual = sha256(buf);
  return {
    checked: true,
    via,
    problems: actual === record.sha256 ? [] : [`UKD ${commit.slice(0, 12)} holds sha256 ${actual.slice(0, 12)}..., not the recorded ${record.sha256.slice(0, 12)}...`]
  };
}
