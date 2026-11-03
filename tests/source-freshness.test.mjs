import { readFileSync, readdirSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MANIFEST_DIR = join(process.cwd(), "data/raw/manifests");

const manifests = Object.fromEntries(
  readdirSync(MANIFEST_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => [name.replace(/\.json$/, ""), JSON.parse(readFileSync(join(MANIFEST_DIR, name), "utf8"))])
);

// Sources that publish on a schedule and must stay inside the freshness check. Anything
// here that loses its cycle stops being watched, and a source nobody watches is how the
// small boats series ended up seventeen days past its own limit.
const CYCLICAL = [
  "uk_routes",
  "moj_tribunals",
  "small_boats",
  "home_office_ara",
  "border_security",
  "asylum_finance",
  "mhclg_homelessness"
];

// The same rule scripts/audit/source-freshness.mjs applies: either a next-edition date, or
// a coverage end paired with a maximum age for series that never announce one.
const onACycle = (manifest) =>
  Boolean(manifest?.nextEdition || (manifest?.coverageEnd && manifest?.maxAgeDays));

describe("source freshness manifests", () => {
  // This is the check that was missing on 23 August, when the refresh cron completed for
  // the first time in weeks and fetch-tribunals.mjs overwrote a hand-built manifest with
  // one that spelled the field nextEditionDate. The audit reads nextEdition, so
  // moj_tribunals silently dropped to "no-cycle" and would have said nothing had the
  // 10 September release been missed.
  it.each(CYCLICAL)("keeps %s inside the freshness check", (dataset) => {
    expect(manifests[dataset], `${dataset}.json is missing entirely`).toBeDefined();
    expect(onACycle(manifests[dataset])).toBe(true);
  });

  it("dates the next edition of every scheduled release", () => {
    for (const dataset of CYCLICAL) {
      const manifest = manifests[dataset];
      if (!manifest.nextEdition) continue;
      expect(manifest.nextEdition, dataset).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // The Home Office quarterly is the one the site is built on, so it gets a named check
  // rather than only the generic one above.
  it("tracks the Home Office quarterly by release rather than by hand", () => {
    const routes = manifests.uk_routes;
    expect(routes.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(routes.release).toMatch(/^Immigration system statistics, year ending [A-Z]/);
    expect(routes.nextEdition > routes.releaseDate).toBe(true);
    for (const file of routes.files) {
      expect(file.releaseDate, file.fileName).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(file.periodSlug, file.fileName).toMatch(/^[a-z]+-\d{4}$/);
    }
  });
});


describe("housing release calendar", () => {
  const housing = manifests.mhclg_homelessness;
  it("records the publisher and access date for the next edition", () => {
    expect(new URL(housing.nextEditionSource).hostname).toBe("www.gov.uk");
    expect(housing.nextEditionSource).toContain("/statistics/announcements/");
    expect(housing.nextEditionCheckedAt <= housing.nextEdition).toBe(true);
    expect(housing.coverageEnd).toBe(housing.files.find((file) => file.releaseId === "hclic").stockDate);
  });

  it("uses the announced release and still reports an overdue edition afterwards", () => {
    const audit = (day) => spawnSync(process.execPath, ["scripts/audit/source-freshness.mjs", day], { encoding: "utf8" });
    const current = audit(housing.nextEditionCheckedAt);
    expect(current.status).toBe(0);
    expect(current.stdout).toMatch(/mhclg_homelessness\s+current/);
    const tomorrow = new Date(Date.parse(housing.nextEdition) + 86400000).toISOString().slice(0, 10);
    expect(audit(tomorrow).stdout).toMatch(/mhclg_homelessness\s+OVERDUE/);
  });

  it("passes the strict gate with the confirmed calendar and fails when that edition is overdue", () => {
    // Freeze the dates from the November failure, not a published figure. A later
    // release may be younger than the fallback limit and must not break this test.
    const fixture = {
      dataset: "mhclg_homelessness",
      coverageEnd: "2026-03-31",
      maxAgeDays: 200,
      nextEdition: "2026-11-26"
    };
    const checkedAt = "2026-11-02";
    // Isolate the CLI so other release cycles cannot mask this manifest's exit status.
    const root = mkdtempSync(join(tmpdir(), "asylumstats-freshness-"));
    try {
      mkdirSync(join(root, "scripts/audit"), { recursive: true });
      mkdirSync(join(root, "data/raw/manifests"), { recursive: true });
      const script = join(root, "scripts/audit/source-freshness.mjs");
      copyFileSync("scripts/audit/source-freshness.mjs", script);
      const manifest = join(root, "data/raw/manifests/mhclg_homelessness.json");
      const audit = (day, strict = true) => spawnSync(process.execPath,
        [script, day, ...(strict ? ["--strict"] : [])], { encoding: "utf8" });

      writeFileSync(manifest, JSON.stringify(fixture));
      expect(audit(checkedAt).status).toBe(0);
      const tomorrow = new Date(Date.parse(fixture.nextEdition) + 86400000).toISOString().slice(0, 10);
      const overdue = audit(tomorrow);
      expect(overdue.stdout).toMatch(/mhclg_homelessness\s+OVERDUE/);
      expect(overdue.status).toBe(1);
      expect(audit(tomorrow, false).status).toBe(0);

      // Reproduce the original failure without changing the coverage date or limit.
      const withoutCalendar = { ...fixture };
      delete withoutCalendar.nextEdition;
      writeFileSync(manifest, JSON.stringify(withoutCalendar));
      const fallback = audit(checkedAt);
      expect(fallback.stdout).toMatch(/mhclg_homelessness\s+OVERDUE/);
      expect(fallback.status).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
