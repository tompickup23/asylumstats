import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getHousingPressure, leavingAsylumSupport, HOUSING_ENGLAND, HOUSING_SOURCES,
  type HousingFigures, type SourceCell } from "../src/lib/housing-pressure";
import { loadLocalRouteLatest } from "../src/lib/route-data";
import manifest from "../data/raw/manifests/mhclg_homelessness.json";
import mart from "../data/marts/mhclg_homelessness/housing-pressure.json";

const english = loadLocalRouteLatest().areas.filter(a => a.countryName === "England");
const cells = (f: HousingFigures): Array<[string, SourceCell]> => [
  ...Object.entries(f.temporaryAccommodation), ...Object.entries(f.duties),
  ["roughSleeping", f.roughSleeping], ["homelessnessNetSpend", f.homelessnessNetSpend]
];

describe("housing pressure mart", () => {
  it("covers every English Home Office area and no other", () => {
    expect(Object.keys(mart.areas).sort()).toEqual(english.map(a => a.areaCode).sort());
    for (const a of loadLocalRouteLatest().areas.filter(a => a.countryName !== "England")) {
      expect(getHousingPressure(a.areaCode)).toBeNull();
    }
  });

  it("keeps a source cell for every value and never publishes a null or an unpublished number", () => {
    for (const f of [...english.map(a => getHousingPressure(a.areaCode)!), HOUSING_ENGLAND]) {
      for (const [key, c] of cells(f)) {
        expect(c.cell, key).toMatch(/^(TA1|A2P|A2R|Table_1_Total|RO4_LA_Data_202526)![A-Z]+\d+$/);
        if (c.status === "published") expect(typeof c.value, key).toBe("number");
        else expect(c.value, key).toBeNull();
      }
    }
  });

  it("reads each figure from its own sheet and column", () => {
    const f = getHousingPressure("E07000117")!;
    expect(f.temporaryAccommodation.households.cell).toMatch(/^TA1!C/);
    expect(f.temporaryAccommodation.children.cell).toMatch(/^TA1!G/);
    expect(f.duties.preventionLeavingAsylumSupport.cell).toMatch(/^A2P!AO/);
    expect(f.duties.reliefLeavingAsylumSupport.cell).toMatch(/^A2R!AO/);
    expect(f.roughSleeping.cell).toMatch(/^Table_1_Total!T/);
    expect(f.homelessnessNetSpend.cell).toMatch(/^RO4_LA_Data_202526!DO/);
  });

  it("banks the raw files with the hashes in the manifest and carries dated sources", () => {
    for (const file of manifest.files) {
      const bytes = readFileSync(join("data/raw/mhclg_homelessness", file.file));
      expect(createHash("sha256").update(bytes).digest("hex"), file.file).toBe(file.sha256);
    }
    for (const s of Object.values(HOUSING_SOURCES)) {
      expect(s.url).toMatch(/^https:\/\/assets\.publishing\.service\.gov\.uk\//);
      expect(s.released).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.periodLabel.length).toBeGreaterThan(0);
    }
    expect(HOUSING_SOURCES.hclic.stockDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("households leaving Home Office accommodation", () => {
  it("adds prevention and relief only when all four inputs are published", () => {
    for (const a of english) {
      const f = getHousingPressure(a.areaCode)!;
      const b = leavingAsylumSupport(f);
      const d = f.duties;
      const complete = [d.prevention, d.relief, d.preventionLeavingAsylumSupport, d.reliefLeavingAsylumSupport]
        .every(c => c.value !== null);
      expect(b === null, a.areaName).toBe(!complete);
      if (b) {
        expect(b.leaving).toBe(d.preventionLeavingAsylumSupport.value! + d.reliefLeavingAsylumSupport.value!);
        expect(b.leaving).toBeLessThanOrEqual(b.owed);
      }
    }
  });

  it("has an England share between zero and one", () => {
    const e = leavingAsylumSupport(HOUSING_ENGLAND)!;
    expect(e.share).toBeGreaterThan(0);
    expect(e.share).toBeLessThan(1);
  });
});
