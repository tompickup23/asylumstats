#!/usr/bin/env node
/**
 * Copy ethnic-projections.json from a named UK Demographics commit.
 *
 *   node scripts/sync/sync-from-ukd.mjs --commit <sha or ref>      # copy and record
 *   node scripts/sync/sync-from-ukd.mjs --check                    # verify only
 *
 * Options:
 *   --ukd-repo <path>   the UKD checkout to read from (default UKD_REPO, else ~/ukdemographics)
 *   --fetch             run `git fetch origin` in that checkout first
 *   --allow-unmerged    accept a commit that is not on UKD origin/main
 *
 * The bytes come from git's object store at that commit, never from the
 * checkout's working tree, so uncommitted edits in UKD cannot leak in. The file
 * is written unchanged, read back and hashed, and the commit, path, sha256 and
 * size go to data/sync/ukd-ethnic-projections.json. Nothing in the file is
 * edited here: a value Asylum Stats needs different from UKD has to be fixed in
 * UKD and synced, or handled in this site's code.
 *
 * --check exits 1 unless this site's file matches the record and the recorded
 * UKD commit holds the same bytes.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  PROJECTION_PATH, RECORD_PATH, UKD_REPOSITORY,
  checkAgainstRecord, checkRecordedCommit, defaultUkdRepo, isOnBranch,
  readBlobLocal, readRecord, resolveCommit, sha256
} from "./ukd-source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const target = join(ROOT, PROJECTION_PATH);

if (flag("--check")) {
  const record = readRecord(ROOT);
  const local = checkAgainstRecord(readFileSync(target), record);
  const upstream = record ? await checkRecordedCommit(record, { repo: value("--ukd-repo") ? resolve(value("--ukd-repo")) : defaultUkdRepo() }) : { problems: [] };
  const problems = [...local, ...upstream.problems];
  if (problems.length) {
    for (const p of problems) console.error(`FAIL ${p}`);
    process.exit(1);
  }
  console.log(`ok   ${PROJECTION_PATH} is UKD ${record.source.commit.slice(0, 12)} (sha256 ${record.sha256.slice(0, 12)}..., checked via ${upstream.via})`);
  process.exit(0);
}

const ref = value("--commit");
if (!ref) {
  console.error("Name the UKD commit: --commit <sha or ref>. There is no default, so a sync always says what it copied.");
  process.exit(2);
}
const repo = value("--ukd-repo") ? resolve(value("--ukd-repo")) : defaultUkdRepo();
if (!repo) {
  console.error("No UKD checkout: set UKD_REPO or pass --ukd-repo.");
  process.exit(2);
}
if (flag("--fetch")) execFileSync("git", ["-C", repo, "fetch", "origin", "--quiet"], { stdio: "inherit" });

const commit = resolveCommit(repo, ref);
if (!flag("--allow-unmerged") && !isOnBranch(repo, commit)) {
  console.error(`UKD ${commit} is not on origin/main. Sync from a merged commit, or pass --allow-unmerged.`);
  process.exit(1);
}

const buf = readBlobLocal(repo, commit);
const parsed = JSON.parse(buf.toString("utf8"));
const areaCount = Object.keys(parsed.areas ?? {}).length;
if (areaCount === 0) {
  console.error(`UKD ${commit}: ${PROJECTION_PATH} has no areas`);
  process.exit(1);
}
const hash = sha256(buf);

writeFileSync(target, buf);
const written = readFileSync(target);
if (sha256(written) !== hash || written.length !== buf.length) {
  console.error("The file read back does not match the bytes written.");
  process.exit(1);
}

const committedAt = execFileSync("git", ["-C", repo, "show", "-s", "--format=%cI", commit], { encoding: "utf8" }).trim();
const record = {
  description: "Provenance of src/data/live/ethnic-projections.json: a byte-for-byte copy of the UK Demographics file at the commit below. Written by scripts/sync/sync-from-ukd.mjs; checked by its --check mode, scripts/audit/projection-integrity.mjs and tests/ukd-sync.test.ts.",
  source: {
    repository: UKD_REPOSITORY,
    commit,
    committedAt,
    path: PROJECTION_PATH
  },
  sha256: hash,
  bytes: buf.length,
  areas: areaCount,
  syncedAt: new Date().toISOString().slice(0, 10)
};
mkdirSync(dirname(join(ROOT, RECORD_PATH)), { recursive: true });
writeFileSync(join(ROOT, RECORD_PATH), JSON.stringify(record, null, 2) + "\n");

const check = checkAgainstRecord(readFileSync(target), record);
if (check.length) {
  for (const p of check) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log(`Copied ${PROJECTION_PATH} from UKD ${commit.slice(0, 12)} (${committedAt}): ${areaCount} areas, ${buf.length} bytes, sha256 ${hash}`);
console.log(`Record: ${RECORD_PATH}`);
