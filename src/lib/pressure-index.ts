import { getEthnicProjection } from "./ethnic-projections";
import { getSendForArea, allSendGrowth } from "./send-data";
import { getAscForArea, allAscSpend } from "./asc-data";
import { allWhiteBritishChangeRates } from "./ethnic-projections";

export interface PressureScore {
  areaCode: string;
  areaName: string;
  compositeScore: number;
  rank: number;
  components: {
    asylumRate: number | null;
    demographicChangeRate: number | null;
    sendGrowth: number | null;
    ascSpend: number | null;
  };
  availableModules: number;
  /** Each domain's percentile rank (0 to 100, unrounded), for the domains the area has. */
  percentiles: Partial<Record<"asylum" | "demographic" | "send" | "asc", number>>;
}

/**
 * Four domains since 12 October 2026, each weighted equally: asylum support from
 * the Home Office local authority data; demographic change from Census 2011 and
 * 2021 via the projection file; five-year growth in pupils with an EHC plan, DfE;
 * adult social care spend per adult, DHSC. The last two are synced from UK
 * Demographics. SEND and adult social care are run by upper-tier councils, so a
 * two-tier district takes its county's figure and percentile, and each
 * distribution holds one figure per council that runs the service.
 *
 * Police recorded crime was a fifth domain until 12 October 2026. It was removed
 * because this site does not set recorded crime beside asylum support; UK
 * Demographics publishes crime in its own context. The remaining domains keep
 * equal weights, so each now counts for a quarter instead of a fifth. Until the
 * same date the SEND and social care domains read 25-area files that matched no
 * published table.
 *
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

  const send = getSendForArea(areaCode)?.profile ?? null;
  if (send && send.fiveYearGrowthPct != null) {
    const allGrowth = allSendGrowth();
    components.push({ domain: "send", percentile: percentileRank(allGrowth, send.fiveYearGrowthPct) });
  }

  const asc = getAscForArea(areaCode)?.profile ?? null;
  if (asc && asc.grossSpendPerCapita != null) {
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
      sendGrowth: send?.fiveYearGrowthPct ?? null,
      ascSpend: asc?.grossSpendPerCapita ?? null
    },
    availableModules: components.length,
    percentiles: Object.fromEntries(components.map((c) => [c.domain, c.percentile]))
  };
}
