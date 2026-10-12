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
