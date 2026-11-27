/**
 * Regional totals of people on asylum support, edition by edition.
 *
 * Read from data/marts/uk_routes/regional-support-history.json, which
 * scripts/transform/transform-regional-history.mjs builds from table Reg_01 of each
 * edition of the Home Office regional and local authority dataset. Every figure is a
 * quarter-end stock on one basis (published statistics), so editions are compared and
 * never added.
 *
 * A finding that says a region rose or fell must take both ends from here, so that
 * tests/regional-history.test.ts can read the sentence against the table.
 */
import historyFile from "../data/live/regional-support-history.json";

export interface RegionalAreaFigures {
  supportedAsylum: number;
  /** Mostly hotels. Null in the editions that published no accommodation breakdown. */
  contingencyAccommodation: number | null;
  dispersalAccommodation: number | null;
  population: number | null;
}

export interface RegionalEdition {
  snapshotDate: string;
  table: string;
  fileName: string;
  sourceUrl: string;
  sha256: string;
  areas: Record<string, RegionalAreaFigures>;
}

/** The twelve regions and nations that partition the UK in Reg_01. */
export const REGIONS = [
  "North West",
  "North East",
  "Yorkshire and The Humber",
  "West Midlands",
  "East Midlands",
  "East of England",
  "London",
  "South East",
  "South West",
  "Scotland",
  "Wales",
  "Northern Ireland"
] as const;

export type RegionName = (typeof REGIONS)[number];

const history = historyFile as unknown as { latestSnapshotDate: string; editions: RegionalEdition[] };

export function regionalEditions(): RegionalEdition[] {
  return history.editions;
}

export function regionalEdition(snapshotDate: string): RegionalEdition | null {
  return history.editions.find((edition) => edition.snapshotDate === snapshotDate) ?? null;
}

export function latestRegionalEdition(): RegionalEdition {
  return history.editions[history.editions.length - 1];
}

/**
 * People the Home Office counts in the UK total but assigns to no region. Zero from
 * June 2025; 84 at 30 September 2023 and several thousand at some quarter ends between.
 * A regional share for an edition where this is large understates every region.
 */
export function unallocated(edition: RegionalEdition): number {
  const allocated = REGIONS.reduce((total, region) => total + edition.areas[region].supportedAsylum, 0);
  return edition.areas["United Kingdom"].supportedAsylum - allocated;
}

/** A region's share of the UK total in one edition, as a percentage to one decimal place. */
export function regionalSharePct(edition: RegionalEdition, regions: readonly string[]): number {
  const held = regions.reduce((total, region) => total + edition.areas[region].supportedAsylum, 0);
  return Math.round((held / edition.areas["United Kingdom"].supportedAsylum) * 1000) / 10;
}

/** People on asylum support per 10,000 residents, on the population Reg_01 itself prints. */
export function regionalRate(edition: RegionalEdition, region: string): number | null {
  const area = edition.areas[region];
  return area.population ? Math.round((area.supportedAsylum / area.population) * 100000) / 10 : null;
}

export interface RegionalChange {
  region: string;
  from: number;
  to: number;
  change: number;
  /** Whole per cent, half away from zero, as the findings print it. */
  changePct: number;
}

export function regionalChange(from: RegionalEdition, to: RegionalEdition, region: string): RegionalChange {
  const a = from.areas[region].supportedAsylum;
  const b = to.areas[region].supportedAsylum;
  const pct = ((b - a) / a) * 100;
  return { region, from: a, to: b, change: b - a, changePct: Math.sign(pct) * Math.round(Math.abs(pct)) };
}
