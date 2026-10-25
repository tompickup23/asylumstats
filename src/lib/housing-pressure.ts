/** Council homelessness figures beside the Home Office asylum figures. England only. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type CellStatus = "published" | "suppressed" | "not_submitted" | "not_applicable";
export interface SourceCell { value: number | null; status: CellStatus; cell: string }
export interface HousingFigures {
  temporaryAccommodation: { households: SourceCell; householdsWithChildren: SourceCell; children: SourceCell };
  duties: {
    prevention: SourceCell; relief: SourceCell;
    preventionLeavingAsylumSupport: SourceCell; reliefLeavingAsylumSupport: SourceCell;
  };
  roughSleeping: SourceCell;
  homelessnessNetSpend: SourceCell;
}
export interface HousingSource {
  title: string; url: string; landing: string; released: string; period: string; periodLabel: string;
  stockDate: string | null; status: string; file: string; sha256: string;
}
interface HousingPressureMart {
  sources: { hclic: HousingSource; roughSleeping: HousingSource; ro4: HousingSource };
  england: HousingFigures;
  areas: Record<string, HousingFigures & { areaName: string }>;
}

const mart = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/live/housing-pressure.json"), "utf8")
) as HousingPressureMart;

export const HOUSING_SOURCES = mart.sources;
export const HOUSING_ENGLAND = mart.england;
export const getHousingPressure = (code: string) => mart.areas[code] ?? null;

export const STATUS_NOTE: Record<Exclude<CellStatus, "published">, string> = {
  suppressed: "suppressed by MHCLG (fewer than 5)",
  not_submitted: "not submitted by the council",
  not_applicable: "not applicable"
};

/**
 * Households owed a prevention or relief duty after having to leave Home Office asylum
 * accommodation, and their share of all households owed either duty in the same quarter.
 * H-CLIC splits initial assessments between the two duties, so the sums are households
 * assessed in the quarter. Null when any input is unpublished: nothing is estimated.
 */
export function leavingAsylumSupport(f: HousingFigures) {
  const d = f.duties;
  const parts = [d.preventionLeavingAsylumSupport, d.reliefLeavingAsylumSupport, d.prevention, d.relief];
  if (parts.some(p => p.value === null)) return null;
  const leaving = d.preventionLeavingAsylumSupport.value! + d.reliefLeavingAsylumSupport.value!;
  const owed = d.prevention.value! + d.relief.value!;
  return {
    prevention: d.preventionLeavingAsylumSupport.value!, relief: d.reliefLeavingAsylumSupport.value!,
    leaving, owed, share: owed > 0 ? leaving / owed : null
  };
}
