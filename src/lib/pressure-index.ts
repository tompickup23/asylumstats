import { getEthnicProjection } from "./ethnic-projections";
import { getCrimeProfile, allCrimeRates } from "./crime-data";
import { getSendProfile, allSendGrowth } from "./send-data";
import { getAscProfile, allAscSpend } from "./asc-data";
import { allWhiteBritishChangeRates } from "./ethnic-projections";

export interface PressureScore {
  areaCode: string;
  areaName: string;
  compositeScore: number;
  rank: number;
  components: {
    asylumRate: number | null;
    demographicChangeRate: number | null;
    crimeRate: number | null;
    sendGrowth: number | null;
    ascSpend: number | null;
  };
  availableModules: number;
}

/**
 * The four comparison distributions used to be literal arrays of 25 numbers, transcribed
 * by hand from the April 2026 data. A percentile is only meaningful against the
 * distribution it was drawn from, and a hard-coded one silently stops matching its own
 * dataset the first time that dataset is refreshed: the number keeps rendering and
 * nothing fails. They are now derived from the same files the profiles come from.
 */
function percentileRank(values: number[], target: number): number {
  const below = values.filter((v) => v < target).length;
  return (below / values.length) * 100;
}

/**
 * Compute a composite pressure index for an area.
 * Uses percentile ranks across available domains, weighted equally.
 * Only domains with data contribute; the score adjusts for missing modules.
 */
export function computePressureScore(
  areaCode: string,
  areaName: string,
  asylumRate: number | null,
  allAsylumRates: number[]
): PressureScore {
  const components: Array<{ domain: string; percentile: number }> = [];

  if (asylumRate !== null && allAsylumRates.length > 0) {
    components.push({ domain: "asylum", percentile: percentileRank(allAsylumRates, asylumRate) });
  }

  const ethnic = getEthnicProjection(areaCode);
  if (ethnic) {
    const absChange = Math.abs(ethnic.annualChangePp.white_british);
    const allChanges = allWhiteBritishChangeRates();
    components.push({ domain: "demographic", percentile: percentileRank(allChanges, absChange) });
  }

  const crime = getCrimeProfile(areaCode);
  if (crime) {
    const allRates = allCrimeRates();
    components.push({ domain: "crime", percentile: percentileRank(allRates, crime.totalCrimeRate) });
  }

  const send = getSendProfile(areaCode);
  if (send) {
    const allGrowth = allSendGrowth();
    components.push({ domain: "send", percentile: percentileRank(allGrowth, send.fiveYearGrowthPct) });
  }

  const asc = getAscProfile(areaCode);
  if (asc) {
    const allSpend = allAscSpend();
    components.push({ domain: "asc", percentile: percentileRank(allSpend, asc.grossSpendPerCapita) });
  }

  const compositeScore = components.length > 0
    ? components.reduce((sum, c) => sum + c.percentile, 0) / components.length
    : 0;

  return {
    areaCode,
    areaName,
    compositeScore: Math.round(compositeScore * 10) / 10,
    rank: 0,
    components: {
      asylumRate: asylumRate,
      demographicChangeRate: ethnic ? Math.abs(ethnic.annualChangePp.white_british) : null,
      crimeRate: crime?.totalCrimeRate ?? null,
      sendGrowth: send?.fiveYearGrowthPct ?? null,
      ascSpend: asc?.grossSpendPerCapita ?? null
    },
    availableModules: components.length
  };
}
