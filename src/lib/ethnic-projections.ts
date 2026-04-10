import rawProjections from "../data/live/ethnic-projections.json";

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

export interface AreaEthnicProjection {
  areaName: string;
  baseline: EthnicSnapshot;
  current: EthnicSnapshot;
  annualChangePp: EthnicGroup;
  projections: Record<string, EthnicGroup>;
  thresholds: EthnicThreshold[];
  headlineStat: { value: string; trend: string } | null;
}

interface EthnicProjectionsData {
  source: string;
  methodology: string;
  lastUpdated: string;
  areas: Record<string, AreaEthnicProjection>;
}

const data = rawProjections as EthnicProjectionsData;

export function getEthnicProjection(areaCode: string): AreaEthnicProjection | null {
  return data.areas[areaCode] ?? null;
}

export function getEthnicProjectionSource(): string {
  return data.source;
}

export function getEthnicProjectionMethodology(): string {
  return data.methodology;
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
