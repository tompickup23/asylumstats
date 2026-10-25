import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { getAllAreaCosts, areaCostCard, calculateAreaCost, AREA_COST_SOURCES } from "../src/lib/area-cost";
import { areaCostExportRows, buildAreaCostCsv, buildAreaCostDataset } from "../src/lib/area-cost-dataset";
import { loadLocalRouteLatest } from "../src/lib/route-data";
import { parseCsvGrid } from "../scripts/lib/csv-parser.mjs";
import { formatAreaCostChanges } from "../scripts/audit/area-cost-changes.mjs";
const costs = getAllAreaCosts();

describe("cost table, card and export contracts", () => {
  it("exports every model input and result without turning a null into zero", () => {
    const [headers, ...rows] = parseCsvGrid(buildAreaCostCsv());
    expect(rows).toHaveLength(costs.length);
    const exported = areaCostExportRows();
    for (const [i, row] of rows.entries()) {
      expect(row).toHaveLength(headers.length);
      for (const [key, value] of Object.entries(exported[i])) {
        expect(row[headers.indexOf(key)], key).toBe(value === null ? "" : String(value));
      }
      expect(row[headers.indexOf("m2.total")]).toBe("");
      expect(row[headers.indexOf("inputRates.initialPerNight")]).toBe("");
      expect(row[headers.indexOf("inputRates.otherPerNight")]).toBe("");
      expect(row[headers.indexOf("m2.actualGrant")]).toBe("");
      expect(row[headers.indexOf("m2.accommodatedAllowance")]).toBe("");
      expect(row[headers.indexOf("accommodatedAllowanceBasis")]).toBe("unverified");
    }
    expect(headers).toContain("inputs.taxpayers.taxpayersLower95");
    expect(headers).toContain("sources.rates.dispersal2026.url");
    expect(headers).toContain("sources.counts.table");
    expect(headers).toContain("periods.nights");
    expect(buildAreaCostCsv()).not.toMatch(/[—–]| - /);
    const row = exported.find(r => r["inputs.population.locators.population"]);
    const source = costs.find(c => c.areaCode === row!.areaCode)?.inputs.population;
    expect(decodeURI(String(row!["inputs.population.locators.population"]))).toBe(source!.locators.population);
  });
  it("distinguishes incomplete coverage and scenarios independently", () => {
    for (const c of costs) {
      expect(c.m2.allPeoplePriced).toBe(c.m2.unpricedPeople === 0);
      expect(c.m2.includesHotelRateScenario).toBe(c.counts.contingency > 0);
      expect(c.m2.status.includes("Incomplete:")).toBe(c.m2.unpricedPeople > 0);
      expect(c.m2.status.includes("scenario")).toBe(c.counts.contingency > 0);
      expect(c.m2.status.includes("Complete rate coverage")).toBe(c.m2.unpricedPeople === 0);
      if (c.m2.pricedSubtotal === 0) expect(c.m2.hotelRateSharePct).toBeNull();
      else expect(c.m2.hotelRateSharePct).toBeCloseTo(c.m2.contingency / c.m2.pricedSubtotal * 100);
    }
    const a = loadLocalRouteLatest().areas[0];
    const both = calculateAreaCost({ ...a, supportedAsylum: 2, dispersalAccommodation: 0,
      contingencyAccommodation: 1, initialAccommodation: 1, otherAccommodation: 0, subsistenceOnly: 0 });
    expect(both.m2.status).toMatch(/Incomplete:.*Includes a hotel-rate scenario/);
  });
  it("carries dates, coverage and the comparison caveat onto every card", () => {
    for (const c of costs) {
      const card = areaCostCard(c);
      const text = JSON.stringify(card);
      expect(text).toContain(c.dates.rate);
      expect(text).toContain(c.dates.taxpayers);
      expect(text).toContain(c.m2.status);
      expect(text).toContain("Not recorded expenditure");
      expect(text).not.toMatch(/[—–]| - /);
      expect(text).not.toContain("At least");
      if (c.m1.burdenShare === null) expect(text).toContain(c.m1.note);
    }
  });
  it("publishes a downloadable, sourced Dataset", () => {
    const dataset = buildAreaCostDataset("Priced components, not expenditure.");
    expect(dataset.distribution[0].contentUrl).toBe("https://asylumstats.co.uk/data/area-cost.csv");
    expect(dataset.isBasedOn[1].url).toBe(AREA_COST_SOURCES.taxpayers.landingPage);
    expect(dataset.license).toMatch(/open-government-licence/);
  });
  it("reports zero and null transitions and coverage changes below the percentage threshold", () => {
    const original = { code: "TEST", name: "Test area", dates: costs[0].dates, pricedSubtotal: 0,
      unpricedPeople: 1, hotelScenario: false, burdenShare: null };
    const changed = { ...original, pricedSubtotal: 10, unpricedPeople: 0, hotelScenario: true, burdenShare: 0 };
    const report = formatAreaCostChanges([original], [changed], 15);
    expect(report).toContain("Priced subtotal only, GBP | 0 | 10");
    expect(report).toContain("burdenShare | Unavailable | 0");
    expect(report).toContain("unpricedPeople | 1 | 0");
    expect(report).toContain("hotelScenario | false | true");
  });
  it.runIf(existsSync("dist/cost/index.html"))("builds all rows, the Dataset, download and safe labels", () => {
    const html = readFileSync("dist/cost/index.html", "utf8");
    expect((html.match(/<tr data-cost-row/g) ?? []).length).toBe(costs.length);
    expect(html).toContain('"@type":"Dataset"');
    expect(html).toContain("/data/area-cost.csv");
    expect(readFileSync("dist/data/area-cost.csv", "utf8")).toBe(buildAreaCostCsv());
    for (const c of costs) expect(html).toContain(c.m2.status);
  });
});
