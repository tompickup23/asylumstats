import rawAsc from "../data/live/asc-dashboard.json";
import { getParentUtla } from "./area-hierarchy";

/**
 * Adult social care, DHSC finance and activity reports,
 * on the UK Demographics schema. The data file is a byte-for-byte copy of UK
 * Demographics' file at a recorded commit (scripts/sync/sync-from-ukd.mjs,
 * record in data/sync/). Until 12 October 2026 this site held its own 25-area file,
 * added by hand in April 2026 with no raw file or script, which matched no
 * published table; see /corrections/.
 */

/**
 * Adult social care, by council with adult social services responsibilities (upper tier).
 * Built by scripts/transform/transform_asc.py from the DHSC finance and activity reports.
 * The two reports are published separately, so each measure carries its own period.
 */
export interface AreaAscProfile {
  areaName: string;
  /** Gross current expenditure per resident aged 18 and over, GBP. */
  grossSpendPerCapita: number | null;
  /** Residents aged 65 and over in residential long term support during the year, per 10,000 aged 65 and over. */
  residentialRatePer10k65: number | null;
  qualityOfLifeScore: number | null;
  dtocDaysAnnual: number | null;
  period: string;
  grossSpendPeriod: string;
  residentialPeriod: string;
}

export interface AscMeasure {
  label: string;
  counts: string;
  period: string;
  edition: string;
  publisher: string;
  landingPage: string | null;
  revisionNotice?: { note: string; date: string } | null;
}

interface AscDashboard {
  source: string;
  methodology: string;
  populationSource: string;
  lastUpdated: string;
  caveat: string;
  measures: Record<"grossSpendPerCapita" | "residentialRatePer10k65", AscMeasure>;
  areas: Record<string, AreaAscProfile>;
}

const data = rawAsc as unknown as AscDashboard;

export function getAscProfile(areaCode: string): AreaAscProfile | null {
  return data.areas[areaCode] ?? null;
}

export function getAscSource(): string {
  return data.source;
}

export function getAscCaveat(): string {
  return data.caveat;
}

export function getAscMeasure(key: keyof AscDashboard["measures"]): AscMeasure {
  return data.measures[key];
}

/** Share of councils with lower spend per adult, as a whole percentage; null when there is no figure. */
export function getAscSpendPercentile(areaCode: string): number | null {
  const own = data.areas[areaCode]?.grossSpendPerCapita;
  if (own == null) return null;
  const spends = Object.values(data.areas)
    .map((a) => a.grossSpendPerCapita)
    .filter((s): s is number => s != null);
  const below = spends.filter((s) => s < own).length;
  return Math.round((below / spends.length) * 100);
}

/** Every council's spend per adult, one figure per council with social services responsibilities. */
export function allAscSpend(): number[] {
  return Object.values(data.areas)
    .map((a) => a.grossSpendPerCapita)
    .filter((s): s is number => s != null);
}

/**
 * The adult social care figures that apply to an area. A two-tier district (E07)
 * runs no adult social care and shows its county's figures, labelled.
 */
export function getAscForArea(areaCode: string): {
  profile: AreaAscProfile;
  councilCode: string;
  viaCounty: { countyCode: string; countyName: string } | null;
} | null {
  const own = getAscProfile(areaCode);
  if (own) return { profile: own, councilCode: areaCode, viaCounty: null };
  const parent = getParentUtla(areaCode);
  const county = parent ? getAscProfile(parent.countyCode) : null;
  return county && parent ? { profile: county, councilCode: parent.countyCode, viaCounty: parent } : null;
}
