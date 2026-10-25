import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import {
  getAreaCost, getAllAreaCosts, calculateAreaCost, AREA_COST_UK, AREA_COST_DATES,
  AREA_COST_SOURCES, ACCOMMODATED_ALLOWANCE_BASIS, NATIONAL_COST_COMPARISON,
  areaCostSummary, regionalCostSummary, roundTaxpayerCost
} from "../src/lib/area-cost";
import { COST_PER_NIGHT, SUPPORT_RATES, ASYLUM_DISPERSAL_GRANT } from "../src/lib/official-figures";
import { loadLocalRouteLatest } from "../src/lib/route-data";
import taxpayers from "../src/data/live/income-taxpayers-la.json";
import accounts from "../data/marts/home_office_ara/asylum-costs.json";
import { TOTAL_GBP_M, PER_TAXPAYER_GBP, UK_TAXPAYERS_SOURCE } from "../src/lib/true-cost";

const areas = loadLocalRouteLatest().areas;
const costs = getAllAreaCosts();
const sample = areas.find(a => a.areaCode === "E07000117")!;

describe("local support burden and cost basis", () => {
  it("joins every Home Office row and keeps explicitly unavailable taxpayer counts null", () => {
    expect(costs).toHaveLength(areas.length);
    expect(costs.filter(c => !c.inputs.taxpayers)).toEqual([]);
    expect(costs.filter(c => c.inputs.taxpayers?.taxpayers === null).map(c => c.sourceCode).sort())
      .toEqual([...taxpayers.coverage.missingTaxpayerCodes].sort());
    for (const c of costs.filter(c => c.inputs.taxpayers?.taxpayers === null)) {
      expect(c.m1.burdenShare).toBeNull();
      expect(c.m3.perTaxpayer).toBeNull();
      expect(c.inputs.taxpayers!.notes.length).toBeGreaterThan(0);
    }
    for (const c of costs.filter(c => c.inputs.taxpayers?.taxpayers !== null)) {
      const row = c.inputs.taxpayers!;
      expect(row.taxpayersLower95).toBeGreaterThan(0);
      expect(row.taxpayersLower95!).toBeLessThanOrEqual(row.taxpayers!);
      expect(row.taxpayersUpper95!).toBeGreaterThanOrEqual(row.taxpayers!);
    }
    expect(getAreaCost("E08000038").sourceCode).toBe("E08000016");
    expect(getAreaCost("E08000039").sourceCode).toBe("E08000019");
  });

  it("normalises shares on local rows and acknowledges incomplete taxpayer coverage", () => {
    expect(AREA_COST_UK.taxpayers).toBe(Object.values(taxpayers.areas).reduce((n, a) => n + (a.taxpayers ?? 0), 0));
    expect(AREA_COST_UK.supported).toBe(areas.reduce((n, a) => n + a.supportedAsylum, 0));
    const covered = costs.filter(c => c.m1.burdenShare !== null);
    const weighted = covered.reduce((n, c) => n + c.m1.burdenShare! * c.m1.taxpayerShare!, 0);
    expect(weighted).toBeCloseTo(covered.reduce((n, c) => n + c.m1.supportedShare, 0), 10);
    for (const c of covered) {
      expect(c.m1.burdenShare).toBeCloseTo(c.m1.per1000Taxpayers! / c.m1.ukPer1000Taxpayers, 10);
    }
  });

  it("prices the accommodation mix and never assigns a bed to subsistence only", () => {
    const baseline = calculateAreaCost(sample);
    const extra = 17;
    const moreCash = calculateAreaCost({ ...sample, supportedAsylum: sample.supportedAsylum + extra,
      subsistenceOnly: sample.subsistenceOnly + extra });
    expect(moreCash.m2.dispersal).toBe(baseline.m2.dispersal);
    expect(moreCash.m2.contingency).toBe(baseline.m2.contingency);
    expect(moreCash.m2.grantEquivalent).toBe(baseline.m2.grantEquivalent);
    expect(moreCash.m2.pricedSubtotal - baseline.m2.pricedSubtotal).toBeCloseTo(extra * SUPPORT_RATES.standard.value * 52);
    for (const a of areas.filter(a => a.supportedAsylum === a.subsistenceOnly)) {
      expect(getAreaCost(a.areaCode).m2.dispersal + getAreaCost(a.areaCode).m2.contingency).toBe(0);
    }
    const hotel = calculateAreaCost({ ...sample, dispersalAccommodation: sample.dispersalAccommodation - 1,
      contingencyAccommodation: sample.contingencyAccommodation + 1 });
    expect(hotel.m2.pricedSubtotal - baseline.m2.pricedSubtotal)
      .toBeCloseTo((COST_PER_NIGHT.hotel2026.value - COST_PER_NIGHT.dispersal2026.value) * 365);
  });

  it("keeps initial and other accommodation unpriced on both summary surfaces", () => {
    const flagged = costs.filter(c => c.m2.unpricedPeople > 0);
    expect(flagged.length).toBeGreaterThan(0);
    for (const c of flagged) {
      expect(c.m2.total).toBeNull();
      expect(c.m2.unpricedPeople).toBe(c.counts.initial + c.counts.other);
      expect(c.m3.perTaxpayer).toBeNull();
      expect(c.m3.perTaxpayer95).toBeNull();
      expect(c.m3.perDwelling).toBeNull();
      expect(c.m3.perResident).toBeNull();
      expect(areaCostSummary(c)).toContain("unpriced");
      expect(regionalCostSummary([c.areaCode])).toContain("unpriced");
    }
    const more = calculateAreaCost({ ...sample, otherAccommodation: sample.otherAccommodation + 10,
      supportedAsylum: sample.supportedAsylum + 10 });
    expect(more.m2.pricedSubtotal).toBe(getAreaCost(sample.areaCode).m2.pricedSubtotal);
    expect(more.m2.grantEquivalent).toBe(getAreaCost(sample.areaCode).m2.grantEquivalent);
  });

  it("does not turn allowance or grant scenarios into expenditure", () => {
    expect(ACCOMMODATED_ALLOWANCE_BASIS).toBe("unverified");
    for (const c of costs) {
      expect(c.m2.total).toBeNull();
      expect(c.m2.actualGrant).toBeNull();
      expect(c.m2.accommodatedAllowance).toBeNull();
      expect(c.m2.pricedSubtotal).toBe(c.m2.dispersal + c.m2.contingency + c.m2.subsistenceOnly);
      expect(c.m2.lowerRateSubtotal).toBeLessThanOrEqual(c.m2.pricedSubtotal);
      if (c.counts.contingency > 0) {
        expect(c.m2.contingencyNote).toContain("scenario");
        expect(areaCostSummary(c)).toContain("scenario");
        expect(regionalCostSummary([c.areaCode])).toContain("scenario");
      }
      if (c.areaCode.startsWith("N")) expect(c.m2.grantEquivalent).toBeNull();
      else expect(c.m2.grantEquivalent).toBe((c.counts.dispersal + c.counts.contingency) * ASYLUM_DISPERSAL_GRANT.value);
    }
  });

  it("withholds per taxpayer costs below the threshold and reverses the sample bounds", () => {
    const low = calculateAreaCost({ ...sample, supportedAsylum: 49, subsistenceOnly: 49,
      initialAccommodation: 0, otherAccommodation: 0, dispersalAccommodation: 0, contingencyAccommodation: 0 });
    expect(low.m3.perTaxpayer).toBeNull();
    expect(low.m3.perTaxpayer95).toBeNull();
    const at = calculateAreaCost({ ...sample, supportedAsylum: 50, subsistenceOnly: 50,
      initialAccommodation: 0, otherAccommodation: 0, dispersalAccommodation: 0, contingencyAccommodation: 0 });
    expect(at.m3.perTaxpayer).not.toBeNull();
    for (const c of costs.filter(c => c.m3.perTaxpayer95)) {
      const tax = c.inputs.taxpayers!;
      expect(c.m3.perTaxpayer).toBe(roundTaxpayerCost(c.m2.pricedSubtotal / tax.taxpayers!));
      expect(c.m3.perTaxpayer95).toEqual({ lower: roundTaxpayerCost(c.m2.pricedSubtotal / tax.taxpayersUpper95!),
        upper: roundTaxpayerCost(c.m2.pricedSubtotal / tax.taxpayersLower95!) });
      if (c.m3.perTaxpayer! >= 10) expect(c.m3.perTaxpayer! % 10).toBe(0);
    }
  });

  it("leaves denominator coverage gaps blank and attaches input dates and locators", () => {
    for (const c of costs) {
      expect(c.dates).toEqual(AREA_COST_DATES);
      if (!c.areaCode.startsWith("E")) expect(c.m3.perDwelling).toBeNull();
      if (/^[SN]/.test(c.areaCode)) expect(c.m3.perResident).toBeNull();
      if (c.m3.perDwelling !== null) expect(c.inputs.dwellings!.locator).toContain("row=");
      if (c.m3.perResident !== null) expect(c.inputs.population!.locators.population).toContain("MYE4");
    }
    expect(AREA_COST_SOURCES.counts.table).toBe("Reg_02");
  });

  it("keeps the national comparison on the accounts year and Table 2.1", () => {
    expect(NATIONAL_COST_COMPARISON.year).toBe(accounts._provenance.financialYear);
    expect(NATIONAL_COST_COMPARISON.source).toBe(UK_TAXPAYERS_SOURCE);
    expect(NATIONAL_COST_COMPARISON.perTaxpayer).toBe(PER_TAXPAYER_GBP.central);
    expect(NATIONAL_COST_COMPARISON.perTaxpayer)
      .toBe(Math.round(TOTAL_GBP_M.central * 1_000_000 / NATIONAL_COST_COMPARISON.taxpayers));
  });

  it("keeps the national priced subtotal below both audited account comparisons", () => {
    const total = costs.reduce((n, c) => n + c.m2.pricedSubtotal, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(accounts.directorates.asylumSupportResettlementAccommodation.resourceOutturn * 1000);
    expect(total).toBeLessThan(accounts.expenseTypes.asylumCostsExcludingGrants.value * 1000);
  });

  it("rejects missing count categories, inconsistent totals and mixed dates", () => {
    expect(() => calculateAreaCost({ ...sample, otherAccommodation: undefined as unknown as number })).toThrow();
    expect(() => calculateAreaCost({ ...sample, supportedAsylum: sample.supportedAsylum + 1 })).toThrow();
    expect(() => calculateAreaCost({ ...sample, snapshotDate: "1900-01-01" })).toThrow();
    expect(() => getAreaCost("UNKNOWN")).toThrow();
  });
});

const sourceRoot = join(process.cwd(), "src");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
}
function forbiddenProducts(text: string): string[] {
  const source = ts.createSourceFile("input.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AsteriskToken) {
      const expression = node.getText(source);
      if (/supportedAsylum|dispersalAccommodation|contingencyAccommodation|initialAccommodation|otherAccommodation|subsistenceOnly/.test(expression) &&
          /365|COST_PER_NIGHT|PER_PERSON_PER_DAY|dailyRate|nightlyRate/.test(expression)) found.push(expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
describe("one owner for local cost arithmetic", () => {
  it("detects multiplication in either order and ignores explanatory comments", () => {
    expect(forbiddenProducts("const cost = area.supportedAsylum * dailyRate * 365;").length).toBeGreaterThan(0);
    expect(forbiddenProducts("const cost = 365 * nightlyRate * area.dispersalAccommodation;").length).toBeGreaterThan(0);
    expect(forbiddenProducts("---\nconst cost = area.supportedAsylum * dailyRate;\n---\n<p>{cost}</p>").length).toBeGreaterThan(0);
    expect(forbiddenProducts("// area.supportedAsylum * dailyRate\nconst n = 2;")).toEqual([]);
  });
  it("forbids inline supported count pricing and obsolete helpers on local surfaces", () => {
    for (const path of files(sourceRoot).filter(p => /\.(ts|js|mjs|astro)$/.test(p))) {
      const name = relative(sourceRoot, path);
      if (name === "lib/area-cost.ts") continue;
      const text = readFileSync(path, "utf8");
      expect(forbiddenProducts(text), name).toEqual([]);
      if (/pages\/(places|regions|counties)|components\/Cost/.test(name)) {
        expect(text, name).not.toMatch(/ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY|accommodationCostForArea|COST_PER_NIGHT/);
      }
    }
  });
});
