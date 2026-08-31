import rawProjections from "../data/live/ethnic-projections.json";
import { plausibleThrough } from "./projection-plausibility";

export interface EthnicGroup {
  white_british: number;
  white_other: number;
  asian: number;
  black: number;
  mixed: number;
  other: number;
}

export interface EthnicSnapshot {
  year: number;
  total_population: number;
  groups: EthnicGroup;
  groups_absolute?: Record<string, number>;
}

export interface EthnicThreshold {
  label: string;
  year: number;
  confidence: "high" | "medium" | "low";
}

export interface ReligionData {
  [key: string]: number;
}

export interface NativityData {
  ukBornPct: number;
  foreignBornPct: number;
}

export interface StochasticBand {
  wbi: { p2_5: number; p10: number; median: number; p90: number; p97_5: number };
}

export interface ShiftShareData {
  totalChangePp: number;
  nationalEffectPp: number;
  structuralEffectPp: number;
  localEffectPp: number;
  dominantDriver: string;
}

export interface EthGroupMetric {
  [ethnicity: string]: Record<string, number>;
}

export interface AreaEthnicProjection {
  areaName: string;
  baseline: EthnicSnapshot;
  current: EthnicSnapshot;
  annualChangePp: EthnicGroup;
  projections: Record<string, EthnicGroup>;
  thresholds: EthnicThreshold[];
  headlineStat: { value: string; trend: string } | null;
  // v6 additions
  religion?: Record<string, ReligionData>;
  nativity?: Record<string, NativityData>;
  stochastic?: Record<string, StochasticBand>;
  confidenceBand2051?: { median: number; ci80: [number, number]; ci95: [number, number] };
  shiftShare?: ShiftShareData;
  diversityIndex?: { entropy: number; diversityLevel: string; dissimilarity: number };
  englishProficiency?: { mainLanguageEnglishPct: number; cannotSpeakEnglishPct: number };
  migrationProfile?: { foreignBornPct: number; maturityLevel: string; implication: string };
  economicActivity?: EthGroupMetric;
  housingTenure?: EthGroupMetric;
  qualifications?: EthGroupMetric;
  health?: EthGroupMetric;
  smoothedProjections?: Record<string, EthnicGroup>;
  schoolEthnicity?: {
    year: string;
    totalPupils: number;
    groups: Record<string, number>;
    wbiGap: number;
    insight: string;
  };
  impactProjections?: {
    schoolDiversity: { currentMinorityPupilsPct: number; projectedMinorityPupils2041Pct: number; ealDemandGrowthPp: number; implication: string };
    housingDemand: { foreignBornGrowthPp: number; implication: string };
    interpreterDemand: { currentNonEnglishPct: number; implication: string };
  };
}

interface EthnicProjectionsData {
  source: string;
  methodology: string;
  lastUpdated: string;
  areas: Record<string, AreaEthnicProjection>;
}

const data = rawProjections as unknown as EthnicProjectionsData;

export function getEthnicProjection(areaCode: string): AreaEthnicProjection | null {
  return data.areas[areaCode] ?? null;
}

export function getEthnicProjectionSource(): string {
  return data.source;
}

export function getEthnicProjectionMethodology(): string {
  return data.methodology;
}

export function getReligionData(areaCode: string) {
  return data.areas[areaCode]?.religion ?? null;
}

export function getNativityData(areaCode: string) {
  return data.areas[areaCode]?.nativity ?? null;
}

export function getStochasticData(areaCode: string) {
  return data.areas[areaCode]?.stochastic ?? null;
}

export function getShiftShareData(areaCode: string) {
  return data.areas[areaCode]?.shiftShare ?? null;
}

export function getDiversityIndex(areaCode: string) {
  return data.areas[areaCode]?.diversityIndex ?? null;
}

export function getEnglishProficiency(areaCode: string) {
  return data.areas[areaCode]?.englishProficiency ?? null;
}

export function getMigrationProfile(areaCode: string) {
  return data.areas[areaCode]?.migrationProfile ?? null;
}

export function getSocioeconomicData(areaCode: string) {
  const area = data.areas[areaCode];
  if (!area) return null;
  return {
    economicActivity: area.economicActivity ?? null,
    housingTenure: area.housingTenure ?? null,
    qualifications: area.qualifications ?? null,
    health: area.health ?? null
  };
}

/**
 * Returns areas sorted by the earliest "White British <50%" threshold year.
 * Only includes areas with medium+ confidence thresholds before the cutoff year.
 */
export function getSignificantDemographicShifts(cutoffYear = 2070): Array<{
  areaCode: string;
  areaName: string;
  thresholdYear: number;
  currentWbPct: number;
  baselineWbPct: number;
  annualDeclinePp: number;
  confidence: string;
}> {
  return Object.entries(data.areas)
    .map(([areaCode, area]) => {
      const wbThreshold = area.thresholds.find((t) => t.label === "White British <50%");
      if (!wbThreshold || wbThreshold.year > cutoffYear) return null;
      return {
        areaCode,
        areaName: area.areaName,
        thresholdYear: wbThreshold.year,
        currentWbPct: area.current.groups.white_british,
        baselineWbPct: area.baseline.groups.white_british,
        annualDeclinePp: Math.abs(area.annualChangePp.white_british),
        confidence: wbThreshold.confidence
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.thresholdYear - b.thresholdYear);
}

/**
 * Format projection data for a simple bar chart display.
 */
export function getEthnicCompositionTimeline(areaCode: string): Array<{
  year: string;
  groups: EthnicGroup;
  isProjection: boolean;
}> | null {
  const area = data.areas[areaCode];
  if (!area) return null;

  const timeline = [
    { year: String(area.baseline.year), groups: area.baseline.groups, isProjection: false },
    { year: String(area.current.year), groups: area.current.groups, isProjection: false }
  ];

  for (const [year, groups] of Object.entries(area.projections)) {
    timeline.push({ year, groups, isProjection: true });
  }

  return timeline.sort((a, b) => Number(a.year) - Number(b.year));
}

/**
 * Barnsley and Sheffield each appear twice in the projection file, once under a
 * retired local authority code and once under the current one, so the raw key
 * count is 320 where the model covers 318 distinct authorities. Counting the raw
 * keys double-counts about 801,000 people and, on the 2051 threshold, counts
 * Sheffield twice: it is the whole of the difference between the 87 an
 * undeduplicated count returns and the 86 this site publishes.
 */
export const RETIRED_AREA_CODES = new Set(["E08000016", "E08000019"]);

/** The distinct authorities the model covers, retired duplicate codes removed. */
export function distinctAreaCodes(): string[] {
  return Object.keys(data.areas).filter((code) => !RETIRED_AREA_CODES.has(code));
}

/**
 * White British share across the distinct authorities, weighted by their 2021
 * populations. 2021 reads the Census observation; earlier and later years read
 * the modelled series. Returns null when no area can supply the year.
 *
 * This reads the modelled series WITHOUT the plausibility guard, which is the
 * opposite of areasBelowFiftyBy below and is deliberate. The areas the guard
 * withholds are the fastest-diversifying ones, so dropping them from a national
 * aggregate biases it upward: 55.06% becomes 56.21% at 2051. A count of areas
 * must not name an area on a withheld projection; a national total needs full
 * coverage. Say which is which wherever both appear.
 *
 * Note the denominator: 49 areas have no 2061 projection, and they are not a
 * random 49, so a 2061 figure from this function is not comparable with the
 * earlier years and should be reported with its area count or not at all.
 */
export function nationalWhiteBritishShare(
  year: number
): { pct: number; areas: number } | null {
  let weighted = 0;
  let population = 0;
  let areas = 0;

  for (const code of distinctAreaCodes()) {
    const area = data.areas[code];
    const pop = area?.current?.total_population ?? 0;
    if (!pop) continue;

    // An observed year is weighted by its OWN population, not by 2021's. Applying 2021
    // weights to the 2011 Census returns 80.0% where the observed share across these areas
    // is 80.2%, and the homepage labels that row "2011 Census". A projected year has no
    // population of its own, so it uses 2021 weights, which is the method the findings state.
    if (year === 2011 || year === 2021) {
      const absolute =
        year === 2011 ? area.baseline?.groups_absolute : area.current?.groups_absolute;
      if (!absolute) continue;
      const total = Object.values(absolute).reduce((sum, n) => sum + n, 0);
      if (!total) continue;
      weighted += absolute.white_british;
      population += total;
      areas += 1;
      continue;
    }

    const share = area.projections?.[String(year)]?.white_british;
    if (share == null) continue;

    weighted += share * pop;
    population += pop;
    areas += 1;
  }

  if (!population) return null;
  // Observed years accumulate people over people and need the percentage conversion;
  // projected years accumulate percent-points over people and are already scaled.
  const isObserved = year === 2011 || year === 2021;
  return { pct: isObserved ? (weighted / population) * 100 : weighted / population, areas };
}

/**
 * Authorities the model puts below a 50% White British share at `year`, read off
 * the decadal projection and with the plausibility guard applied.
 *
 * The guard is not optional here. Six London boroughs (Enfield, Barnet,
 * Haringey, Lambeth, Islington and Hackney) have a 2051 projection that
 * plausibleThrough withholds, and their place pages do not show it. Counting
 * them anyway gives 92 where this site publishes 86, and would put a number on
 * the homepage that no place page will confirm.
 *
 * This also deliberately does not read `thresholds[]`. That array carries an
 * interpolated crossing year which can name a decade at which the decadal
 * projection is still above 50%: West Northamptonshire is listed as crossing in
 * 2051 and projected at 50.28% in 2051, and Bedford and Welwyn Hatfield do the
 * same at 2041. Counting off the thresholds made the homepage say 60 where the
 * finding said 59, for one area that has not actually crossed.
 */
export function areasBelowFiftyBy(year: number): {
  total: number;
  majorityToday: number;
} {
  let total = 0;
  let majorityToday = 0;

  for (const code of distinctAreaCodes()) {
    const area = data.areas[code];
    const share = area.projections?.[String(year)]?.white_british;
    if (share == null || share >= 50) continue;

    const through = plausibleThrough(area as unknown as Parameters<typeof plausibleThrough>[0]);
    if (through === null || through < year) continue;

    total += 1;
    if ((area.current?.groups?.white_british ?? 0) >= 50) majorityToday += 1;
  }

  return { total, majorityToday };
}

/**
 * Every area's absolute annual White British percentage-point change.
 *
 * The pressure index compares one area's rate of demographic change against the others,
 * and it used a hand-transcribed list of 25 values to do it. This derives the same
 * comparison from the projection file, over every area the file holds rather than the
 * subset that happened to be typed out.
 */
export function allWhiteBritishChangeRates(): number[] {
  return Object.values(data.areas)
    .map((a) => Math.abs(a.annualChangePp?.white_british ?? NaN))
    .filter((v) => Number.isFinite(v));
}
