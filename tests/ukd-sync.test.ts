import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROJECTION_PATH,
  checkAgainstRecord,
  defaultUkdRepo,
  readBlobLocal,
  readRecord,
  sha256
} from "../scripts/sync/ukd-source.mjs";

const ROOT = join(__dirname, "..");
const record = readRecord(ROOT);
const bytes = readFileSync(join(ROOT, PROJECTION_PATH));

describe("ethnic-projections.json is the recorded UK Demographics file", () => {
  it("has a sync record naming a full commit and a sha256", () => {
    expect(record, "data/sync/ukd-ethnic-projections.json missing: run scripts/sync/sync-from-ukd.mjs").toBeTruthy();
    expect(record.source.repository).toBe("tompickup23/ukdemographics");
    expect(record.source.path).toBe(PROJECTION_PATH);
    expect(record.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the record byte for byte", () => {
    expect(checkAgainstRecord(bytes, record)).toEqual([]);
    expect(Object.keys(JSON.parse(bytes.toString("utf8")).areas).length).toBe(record.areas);
  });

  it("catches a one-character edit", () => {
    // A hand edit is how the two files drifted 635 values apart.
    const planted = Buffer.from(bytes.toString("utf8").replace('"Burnley"', '"Burnlee"'), "utf8");
    expect(planted.equals(bytes)).toBe(false);
    expect(checkAgainstRecord(planted, record).length).toBeGreaterThan(0);
  });

  it("rejects a record without a commit", () => {
    const { source, ...rest } = record;
    expect(checkAgainstRecord(bytes, { ...rest, source: { ...source, commit: "main" } })).toContain(
      "record has no full UKD commit hash"
    );
  });

  // Needs a UK Demographics checkout (UKD_REPO or ~/ukdemographics) holding the
  // commit; CI has none, and the audit (scripts/audit/projection-integrity.mjs)
  // reads the commit from GitHub instead.
  const repo = defaultUkdRepo();
  let upstream: Buffer | null = null;
  if (repo && record) {
    try {
      upstream = readBlobLocal(repo, record.source.commit);
    } catch {
      upstream = null;
    }
  }
  it.skipIf(!upstream)("is what the recorded UKD commit holds", () => {
    expect(sha256(upstream!)).toBe(record.sha256);
  });
});

import { SYNCED_FILES } from "../scripts/sync/ukd-source.mjs";

// The crime, SEND and adult social care files and the district lookup are copied
// from UK Demographics the same way since 12 October 2026. Before that this site
// held its own 25-area versions, added by hand in April 2026 with no raw file or
// script; they gave SEND and social care figures for district councils and filed
// Preston under E06000011 (East Riding of Yorkshire).
describe.each(SYNCED_FILES.filter((f) => f.key !== "ethnic-projections"))("$path is the recorded UK Demographics file", (file) => {
  const rec = readRecord(ROOT, file.record);
  const buf = readFileSync(join(ROOT, file.path));

  it("has a record naming a full commit and a sha256, and matches it byte for byte", () => {
    expect(rec, `${file.record} missing: run scripts/sync/sync-from-ukd.mjs`).toBeTruthy();
    expect(rec.source.repository).toBe("tompickup23/ukdemographics");
    expect(rec.source.path).toBe(file.path);
    expect(checkAgainstRecord(buf, rec)).toEqual([]);
    expect(file.count(JSON.parse(buf.toString("utf8")))).toBe(rec[file.unit]);
  });

  it("catches a one-character edit", () => {
    const text = buf.toString("utf8");
    const planted = Buffer.from(text.replace(/"(\w)/, '"X$1'), "utf8");
    expect(planted.equals(buf)).toBe(false);
    expect(checkAgainstRecord(planted, rec).length).toBeGreaterThan(0);
  });

  const repo = defaultUkdRepo();
  let upstream: Buffer | null = null;
  if (repo && rec) {
    try {
      upstream = readBlobLocal(repo, rec.source.commit, file.path);
    } catch {
      upstream = null;
    }
  }
  it.skipIf(!upstream)("is what the recorded UKD commit holds", () => {
    expect(sha256(upstream!)).toBe(rec.sha256);
  });
});

describe("the service files hold councils that run the service, on real codes", () => {
  const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
  const projectionCodes = new Set(Object.keys(JSON.parse(bytes.toString("utf8")).areas));
  const lookup = read("src/data/lookups/district-to-utla.json").districts as Record<string, { countyCode: string }>;

  it.each(["src/data/live/send-dashboard.json", "src/data/live/asc-dashboard.json"])("%s has no district rows", (p) => {
    const codes = Object.keys(read(p).areas);
    expect(codes.filter((c) => c.startsWith("E07"))).toEqual([]);
    // Every county a district falls back to is in the file.
    const missing = [...new Set(Object.values(lookup).map((d) => d.countyCode))].filter((c) => !codes.includes(c));
    expect(missing).toEqual([]);
  });

  it("names areas only by codes the projection file or the county lookup knows", () => {
    const counties = new Set(Object.values(lookup).map((d) => d.countyCode));
    for (const p of ["src/data/live/crime-dashboard.json", "src/data/live/send-dashboard.json", "src/data/live/asc-dashboard.json"]) {
      const stray = Object.keys(read(p).areas).filter((c) => !projectionCodes.has(c) && !counties.has(c));
      expect(stray, p).toEqual([]);
    }
  });
});
