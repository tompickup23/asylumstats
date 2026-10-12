import rawSend from "../data/live/send-dashboard.json";
import { getParentUtla } from "./area-hierarchy";

/**
 * Pupils with an EHC plan, DfE Special educational needs in England,
 * on the UK Demographics schema. The data file is a byte-for-byte copy of UK
 * Demographics' file at a recorded commit (scripts/sync/sync-from-ukd.mjs,
 * record in data/sync/). Until 12 October 2026 this site held its own 25-area file,
 * added by hand in April 2026 with no raw file or script, which matched no
 * published table; see /corrections/.
 */

export interface PrimaryNeed {
  need: string;
  pct: number;
}

export interface AreaSendProfile {
  areaName: string;
  /** Pupils with an EHC plan on the January school census, all schools. */
  ehcpPupils: number;
  /** DfE's own percentage: pupils with an EHC plan as a share of pupils on roll. */
  ehcpPctOfPupils: number | null;
  pupilsOnRoll: number | null;
  /** Autism as the primary need, as a share of pupils with an EHC plan. */
  asdPrevalencePct: number | null;
  fiveYearGrowthPct: number | null;
  ehcpPupilsFiveYearsEarlier: number | null;
  primaryNeeds: PrimaryNeed[];
  primaryNeedBase: number | null;
  period: string;
}

interface SendDashboard {
  source: string;
  sourceUrl: string;
  methodology: string;
  lastUpdated: string;
  edition: string;
  growthBasePeriod: string;
  caveat: string;
  england: AreaSendProfile | null;
  areas: Record<string, AreaSendProfile>;
}

const data = rawSend as unknown as SendDashboard;

export function getSendProfile(areaCode: string): AreaSendProfile | null {
  return data.areas[areaCode] ?? null;
}

export function getSendSource(): string {
  return data.source;
}

export function getSendCaveat(): string {
  return data.caveat;
}

export function getSendGrowthPercentile(areaCode: string): number | null {
  const area = data.areas[areaCode];
  if (!area || area.fiveYearGrowthPct == null) return null;
  const growth = area.fiveYearGrowthPct;
  const rates = Object.values(data.areas)
    .map((a) => a.fiveYearGrowthPct)
    .filter((r): r is number => r != null);
  const below = rates.filter((r) => r < growth).length;
  return Math.round((below / rates.length) * 100);
}

/** Every council's five-year growth, one figure per council that runs SEND. */
export function allSendGrowth(): number[] {
  return Object.values(data.areas)
    .map((a) => a.fiveYearGrowthPct)
    .filter((r): r is number => r != null);
}

export function getSendEngland(): AreaSendProfile | null {
  return data.england ?? null;
}

export function getSendPeriods(): { edition: string; growthBasePeriod: string } {
  return { edition: data.edition, growthBasePeriod: data.growthBasePeriod };
}

/**
 * The SEND figures that apply to an area. SEND is run by upper-tier councils, so a
 * two-tier district (E07) has no figure of its own and shows its county's, labelled.
 */
export function getSendForArea(areaCode: string): {
  profile: AreaSendProfile;
  councilCode: string;
  viaCounty: { countyCode: string; countyName: string } | null;
} | null {
  const own = getSendProfile(areaCode);
  if (own) return { profile: own, councilCode: areaCode, viaCounty: null };
  const parent = getParentUtla(areaCode);
  const county = parent ? getSendProfile(parent.countyCode) : null;
  return county && parent ? { profile: county, councilCode: parent.countyCode, viaCounty: parent } : null;
}
