import { readFileSync, readdirSync } from "node:fs";
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
  "asylum_finance"
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
