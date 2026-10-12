#!/usr/bin/env node
/**
 * Copy the UK Demographics files this site publishes from a named UKD commit.
 *
 *   node scripts/sync/sync-from-ukd.mjs --commit <sha or ref>      # copy and record every file
 *   node scripts/sync/sync-from-ukd.mjs --commit <sha> --only send-dashboard,asc-dashboard
 *   node scripts/sync/sync-from-ukd.mjs --check                    # verify only
 *
 * Options:
 *   --ukd-repo <path>   the UKD checkout to read from (default UKD_REPO, else ~/ukdemographics)
 *   --fetch             run `git fetch origin` in that checkout first
 *   --allow-unmerged    accept a commit that is not on UKD origin/main
 *   --only <keys>       comma-separated keys from SYNCED_FILES (default: all)
 *
 * The files are listed in SYNCED_FILES (scripts/sync/ukd-source.mjs): the
 * projection file, the SEND and adult social care dashboards, and the district
 * to county lookup. The bytes come from git's object store at that
 * commit, never from the checkout's working tree, so uncommitted edits in UKD
 * cannot leak in. Each file is written unchanged, read back and hashed, and its
 * commit, path, sha256 and size go to its own record under data/sync/. Nothing in
 * a file is edited here: a value Asylum Stats needs different from UKD has to be
 * fixed in UKD and synced, or handled in this site's code.
 *
 * --check exits 1 unless every file matches its record and each recorded UKD
 * commit holds the same bytes.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  SYNCED_FILES, UKD_REPOSITORY,
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

const only = value("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
const unknown = (only ?? []).filter((k) => !SYNCED_FILES.some((f) => f.key === k));
if (unknown.length) {
  console.error(`Unknown --only key: ${unknown.join(", ")}. Known: ${SYNCED_FILES.map((f) => f.key).join(", ")}`);
  process.exit(2);
}
const files = only ? SYNCED_FILES.filter((f) => only.includes(f.key)) : SYNCED_FILES;
const repoArg = value("--ukd-repo") ? resolve(value("--ukd-repo")) : defaultUkdRepo();

if (flag("--check")) {
  let failed = false;
  for (const file of files) {
    const record = readRecord(ROOT, file.record);
    const local = checkAgainstRecord(readFileSync(join(ROOT, file.path)), record);
    const upstream = record ? await checkRecordedCommit(record, { repo: repoArg }) : { problems: [] };
    const problems = [...local, ...upstream.problems];
    if (problems.length) {
      failed = true;
      for (const p of problems) console.error(`FAIL ${file.path}: ${p}`);
    } else {
      console.log(`ok   ${file.path} is UKD ${record.source.commit.slice(0, 12)} (sha256 ${record.sha256.slice(0, 12)}..., checked via ${upstream.via})`);
    }
  }
  process.exit(failed ? 1 : 0);
}

const ref = value("--commit");
if (!ref) {
  console.error("Name the UKD commit: --commit <sha or ref>. There is no default, so a sync always says what it copied.");
  process.exit(2);
}
if (!repoArg) {
  console.error("No UKD checkout: set UKD_REPO or pass --ukd-repo.");
  process.exit(2);
}
if (flag("--fetch")) execFileSync("git", ["-C", repoArg, "fetch", "origin", "--quiet"], { stdio: "inherit" });

const commit = resolveCommit(repoArg, ref);
if (!flag("--allow-unmerged") && !isOnBranch(repoArg, commit)) {
  console.error(`UKD ${commit} is not on origin/main. Sync from a merged commit, or pass --allow-unmerged.`);
  process.exit(1);
}
const committedAt = execFileSync("git", ["-C", repoArg, "show", "-s", "--format=%cI", commit], { encoding: "utf8" }).trim();

for (const file of files) {
  const buf = readBlobLocal(repoArg, commit, file.path);
  const count = file.count(JSON.parse(buf.toString("utf8")));
  if (!count) {
    console.error(`UKD ${commit}: ${file.path} holds no ${file.unit}`);
    process.exit(1);
  }
  const hash = sha256(buf);
  const target = join(ROOT, file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buf);
  const written = readFileSync(target);
  if (sha256(written) !== hash || written.length !== buf.length) {
    console.error(`${file.path}: the file read back does not match the bytes written.`);
    process.exit(1);
  }

  const record = {
    description: `Provenance of ${file.path}: a byte-for-byte copy of the UK Demographics file at the commit below. Written by scripts/sync/sync-from-ukd.mjs; checked by its --check mode and tests/ukd-sync.test.ts.`,
    source: { repository: UKD_REPOSITORY, commit, committedAt, path: file.path },
    sha256: hash,
    bytes: buf.length,
    [file.unit]: count,
    syncedAt: new Date().toISOString().slice(0, 10)
  };
  mkdirSync(dirname(join(ROOT, file.record)), { recursive: true });
  writeFileSync(join(ROOT, file.record), JSON.stringify(record, null, 2) + "\n");

  const check = checkAgainstRecord(readFileSync(target), record);
  if (check.length) {
    for (const p of check) console.error(`FAIL ${file.path}: ${p}`);
    process.exit(1);
  }
  console.log(`Copied ${file.path} from UKD ${commit.slice(0, 12)} (${committedAt}): ${count} ${file.unit}, ${buf.length} bytes, sha256 ${hash}`);
}
