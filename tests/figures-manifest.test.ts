import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectFigures, extractFigures, figureConflicts } from "../scripts/lib/rendered-figures.mjs";
import { loadLocalRouteLatest } from "../src/lib/route-data";
import { buildPlacePath } from "../src/lib/site-identity";

const dist = join(process.cwd(), "dist");
const built = existsSync(join(dist, "index.html"));
const sample = { page: "/one/", metricKey: "example", value: 12, basis: "published_transaction", sourceUrl: "https://www.gov.uk/example" };

describe("figure agreement guard", () => {
  it("rejects two values for one key across pages", () => {
    expect(figureConflicts([sample, { ...sample, page: "/two/", value: 13 }])).toHaveLength(1);
    expect(figureConflicts([sample, { ...sample, page: "/two/" }])).toEqual([]);
  });
  it("rejects two bases for one key even when the values agree", () => {
    expect(figureConflicts([sample, { ...sample, page: "/two/", basis: "audited_account" }])).toHaveLength(1);
  });
  it("rejects different displays at the same precision without confusing different precisions", () => {
    const row = { ...sample, value: 18.15, displayValue: 18.1, displayDecimals: 1 };
    expect(figureConflicts([row, { ...row, page: "/two/", displayValue: 18.2 }])).toHaveLength(1);
    expect(figureConflicts([row, { ...row, page: "/two/", displayValue: 18, displayDecimals: 0 }])).toEqual([]);
  });
  it("rejects metadata that disagrees with the displayed figure", () => {
    const html = '<span data-figure-key="example" data-figure-value="12" data-figure-decimals="0" data-figure-basis="derived" data-figure-source="https://www.gov.uk/example">13</span>';
    expect(() => extractFigures(html, "/")).toThrow(/renders 13, expected 12/);
  });
  it("keeps null distinct from zero and permits stated display precision", () => {
    const marker = (value: string, text: string, digits = 0) => `<strong data-figure-key="example" data-figure-value="${value}" data-figure-decimals="${digits}" data-figure-basis="derived" data-figure-source="https://www.gov.uk/example">${text}</strong>`;
    expect(extractFigures(marker("null", "n/a"), "/")[0].value).toBeNull();
    expect(extractFigures(marker("12.34", "12.3", 1), "/")[0].value).toBe(12.34);
    expect(() => extractFigures(marker("null", "0"), "/")).toThrow();
  });
});

describe.skipIf(!built)("built figure manifest", () => {
  it("is generated from the figures on the built pages", () => {
    expect(existsSync(join(dist, "figures.json"))).toBe(true);
    const rows = JSON.parse(readFileSync(join(dist, "figures.json"), "utf8"));
    expect(rows).toEqual(collectFigures(dist));
    for (const row of rows) {
      expect(row.page).toMatch(/^\//);
      expect(row.metricKey).toBeTruthy();
      expect(row.basis).toMatch(/^(published_statistic|derived): /);
      expect(new URL(row.sourceUrl).protocol).toBe("https:");
      expect(row.value === null || Number.isFinite(row.value)).toBe(true);
    }
  });
  it("uses one value and basis per metric across pages", () => {
    expect(figureConflicts(collectFigures(dist))).toEqual([]);
  });
  it("covers the shared national headlines and every place headline", () => {
    const rows = collectFigures(dist);
    for (const metric of ["initial-grant-rate", "supported-asylum", "people-in-hotels", "small-boats-ytd"]) {
      expect(new Set(rows.filter((row) => row.metricKey === metric).map((row) => row.page)).size, metric).toBeGreaterThan(1);
    }
    for (const area of loadLocalRouteLatest().areas) {
      for (const metric of ["place-supported", "place-rate"]) {
        const row = rows.find((row) => row.page === buildPlacePath(area) && row.metricKey === `${metric}:${area.areaCode}`);
        expect(row, `${metric} ${area.areaCode}`).toBeDefined();
      }
    }
  });
});
