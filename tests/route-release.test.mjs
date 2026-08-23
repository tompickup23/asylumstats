import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newestMatching, periodParts } from "../scripts/lib/govuk-discover.mjs";
import { nextEditionFrom, releaseSectionUrl, resolveSource } from "../scripts/lib/route-release.mjs";

const read = (file) => JSON.parse(readFileSync(join(process.cwd(), file), "utf8"));
const dashboard = read("src/data/live/route-dashboard.json");
const routesAstro = readFileSync(join(process.cwd(), "src/pages/routes.astro"), "utf8");

// The Home Office publishes the asylum corpus quarterly and every part of a citation moves
// at once. These tests exist because the last release moved the filenames while the
// transform still opened the previous quarter by name, and because the chart source lines
// were keyed on an id that carried the period and would have gone missing without a word.

describe("period parsing", () => {
  it("reads the period GOV.UK stamps into a filename", () => {
    expect(periodParts("asylum-claims-datasets-mar-2026.xlsx")).toMatchObject({
      key: 202603,
      slug: "march-2026",
      label: "Year ending March 2026"
    });
  });

  it("handles the two-digit year GOV.UK used for one quarter", () => {
    expect(periodParts("regional-and-local-authority-dataset-jun-24.ods")).toMatchObject({
      key: 202406,
      slug: "june-2024"
    });
  });

  it("returns null rather than guessing at an unknown convention", () => {
    expect(periodParts("regional-and-local-authority-dataset-latest.ods")).toBeNull();
  });

  // June sorts before March alphabetically, so a naive sort would keep serving the older
  // quarter on the day the newer one lands, which is exactly the failure this guards.
  it("prefers June 2026 over March 2026 despite the alphabet", () => {
    const files = [
      { fileName: "asylum-claims-datasets-mar-2026.xlsx", url: "https://example.invalid/mar" },
      { fileName: "asylum-claims-datasets-jun-2026.xlsx", url: "https://example.invalid/jun" },
      { fileName: "asylum-claims-datasets-dec-2025.xlsx", url: "https://example.invalid/dec" }
    ];
    expect(newestMatching(files, "asylum-claims-datasets").fileName).toBe(
      "asylum-claims-datasets-jun-2026.xlsx"
    );
  });
});

describe("next edition", () => {
  // A quarter publishes about two months after the period it covers, so the following one
  // is due around five months after that period end. Late by a few days on purpose: an
  // on-time release must never trip the alarm.
  it("falls after the calendared release and before the month is out", () => {
    expect(nextEditionFrom({ year: 2026, month: 3 })).toBe("2026-08-31");
    expect(nextEditionFrom({ year: 2026, month: 6 })).toBe("2026-11-30");
    expect(nextEditionFrom({ year: 2026, month: 12 })).toBe("2027-05-31");
  });
});

describe("resolving a source against the release it came from", () => {
  const juneManifest = {
    dataset: "uk_routes",
    files: [
      {
        sourceId: "asylum_claims",
        fileName: "asylum-claims-datasets-jun-2026.xlsx",
        sourceUrl: "https://assets.publishing.service.gov.uk/media/abc123/asylum-claims-datasets-jun-2026.xlsx",
        releaseDate: "2026-08-27"
      }
    ]
  };

  it("cites the quarter that was actually fetched", () => {
    const resolved = resolveSource(juneManifest, "asylum_claims");
    expect(resolved.fileName).toBe("asylum-claims-datasets-jun-2026.xlsx");
    expect(resolved.releaseDate).toBe("2026-08-27");
    expect(releaseSectionUrl(resolved.period.slug, "how-many-people-claim-asylum-in-the-uk")).toBe(
      "https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-june-2026/how-many-people-claim-asylum-in-the-uk"
    );
  });

  it("passes an absolute URL through for datasets that live on a standing page", () => {
    const standing =
      "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-regional-and-local-authority-data";
    expect(releaseSectionUrl("june-2026", standing)).toBe(standing);
  });

  it("refuses a manifest that predates release provenance", () => {
    const old = { files: [{ sourceId: "asylum_claims", fileName: "asylum-claims-datasets-jun-2026.xlsx" }] };
    expect(() => resolveSource(old, "asylum_claims")).toThrow(/releaseDate/);
  });

  it("names what it has when asked for a source that was not fetched", () => {
    expect(() => resolveSource(juneManifest, "returns")).toThrow(/asylum_claims/);
  });
});

describe("the published source registry", () => {
  // Source ids identify a dataset, not an edition. They used to read `asylum_claims_mar_2026`
  // and every quarterly release silently invalidated them.
  it("carries no release period in any source id", () => {
    const dated = dashboard.sources
      .map((source) => source.source_id)
      .filter((id) => /_(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)_\d{4}$/.test(id));
    expect(dated).toEqual([]);
  });

  it("dates every source from the release it came from", () => {
    for (const source of dashboard.sources) {
      expect(source.release_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  // The chart source lines are looked up by id at build time and a miss returns nothing at
  // all, so a broken id removes the attribution from a public chart without failing
  // anything. This is the check that would have caught that.
  it("resolves every id the route charts ask for", () => {
    // The Home Office stopped publishing asylum appeals lodged after 2023 Q1 and the
    // transform deliberately drops it from the registry, so these two charts carry no
    // source line. Listed rather than filtered out, so it stays a known gap.
    const discontinued = new Set(["asylum_appeals_mar_2023"]);
    const known = new Set(dashboard.sources.map((source) => source.source_id));
    const asked = [...routesAstro.matchAll(/chartSource\("([^"]+)"\)/g)].map((match) => match[1]);

    expect(asked.length).toBeGreaterThan(0);
    const missing = [...new Set(asked)].filter((id) => !known.has(id) && !discontinued.has(id));
    expect(missing).toEqual([]);
  });

  it("names every chart dataset it labels", () => {
    const labelled = [...routesAstro.matchAll(/^\s{2}([a-z0-9_]+):\s"/gm)].map((match) => match[1]);
    const asked = new Set([...routesAstro.matchAll(/chartSource\("([^"]+)"\)/g)].map((m) => m[1]));
    for (const id of asked) {
      expect(labelled).toContain(id);
    }
  });
});
