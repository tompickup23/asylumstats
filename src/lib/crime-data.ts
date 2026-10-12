import rawCrime from "../data/live/crime-dashboard.json";

/**
 * Police recorded crime by local authority, ONS Police Force Area data tables,
 * on the UK Demographics schema. The data file is a byte-for-byte copy of UK
 * Demographics' file at a recorded commit (scripts/sync/sync-from-ukd.mjs,
 * record in data/sync/). Until 12 October 2026 this site held its own 25-area file,
 * added by hand in April 2026 with no raw file or script, which matched no
 * published table; see /corrections/.
 */

export interface CrimeBreakdown {
  type: string;
  rate: number;
}

/**
 * How an area's figure relates to the Community Safety Partnerships (CSPs) ONS publishes.
 * local_authority: one CSP, one authority. sum_of_csps and sum_of_former_districts: counts
 * summed into the authority. csp_shared: one CSP covering several authorities, the same
 * rate shown on each. csp_group: CSPs that do not follow authority boundaries, one
 * combined figure for the authorities they cover together.
 */
export type CrimeBasis = "local_authority" | "sum_of_csps" | "sum_of_former_districts" | "csp_shared" | "csp_group";

export interface AreaCrimeProfile {
  areaName: string;
  snapshotDate: string;
  totalCrimeRate: number | null;
  violentCrimeRate: number | null;
  theftRate: number | null;
  asbRate: number | null;
  drugRate: number | null;
  hateCrimeCount: number | null;
  yearOnYearChange: number | null;
  breakdown: CrimeBreakdown[];
  period: string;
  basis: CrimeBasis;
  basisNote: string | null;
  suppressed: boolean;
  suppressionNote: string | null;
  yearOnYearNote: string | null;
  policeForce: { code: string; name: string; unassignedSharePct: number | null };
}

interface CrimeDashboard {
  source: string;
  methodology: string;
  lastUpdated: string;
  caveat: string;
  areas: Record<string, AreaCrimeProfile>;
}

const data = rawCrime as unknown as CrimeDashboard;

export function getCrimeProfile(areaCode: string): AreaCrimeProfile | null {
  return data.areas[areaCode] ?? null;
}

export function getCrimeSource(): string {
  return data.source;
}

export function getCrimeCaveat(): string {
  return data.caveat;
}

/** Percentile among areas with a published rate; null where this area has none. */
export function getCrimeRatePercentile(areaCode: string): number | null {
  const area = data.areas[areaCode];
  if (!area || area.totalCrimeRate == null) return null;
  const rates = Object.values(data.areas)
    .map((a) => a.totalCrimeRate)
    .filter((r): r is number => r != null);
  const below = rates.filter((r) => r < area.totalCrimeRate!).length;
  return Math.round((below / rates.length) * 100);
}

/** Every published total crime rate, for percentiles against the national spread. */
export function allCrimeRates(): number[] {
  return Object.values(data.areas)
    .map((a) => a.totalCrimeRate)
    .filter((r): r is number => r != null);
}
