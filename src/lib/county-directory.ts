/**
 * County-level aggregation for England, built from the published per-authority figures.
 *
 * Exists because "how many asylum seekers in Lancashire" is a real search and the site
 * had no page that answered it. Local authority pages and the twelve regions were the
 * only geographies; the county tier people actually name was missing.
 *
 * WHAT MAY AND MAY NOT BE ADDED UP. The Home Office table this comes from mixes two
 * kinds of measure, and the column headers say so:
 *
 *   "Supported Asylum (total) (population)"                 stock at 31 March 2026
 *   "Afghan Resettlement Programme (total) (population)"    stock at 31 March 2026
 *   "Homes for Ukraine - not including super sponsors (arrivals)"   cumulative arrivals
 *
 * A stock and a flow must not be summed into one "refugees and asylum seekers" figure.
 * This module therefore keeps the three separate and exposes no combined total. That
 * matches the rule already set in scripts/transform/transform-routes.mjs, which says of
 * the humanitarian route family: "Do not present as a refugee total."
 *
 * RECONCILIATION, checked 21 Aug 2026 against the source's own England totals in
 * Reg_01 of regional-and-local-authority-dataset-mar-2026.ods:
 *
 *   supported asylum   85,162 published, 85,162 summed here    exact
 *   Afghan programme   28,592 published, 28,592 summed here    exact
 *   Ukraine arrivals  137,386 published, 137,346 summed here   40 short
 *
 * The 40 are real and are not an error here: the source's local authority table carries
 * an "Unknown" row whose Ukraine figure is suppressed, so those arrivals are not
 * attributable to any authority and cannot be attributed to any county either. Any page
 * quoting the Ukraine figure must say it excludes unallocated arrivals.
 */

import { loadLocalRouteLatest, type LocalRouteAreaSummary } from "./route-data";
import {
  UNITARY_TO_CEREMONIAL_COUNTY,
  normaliseCountyName,
  countySlug
} from "./ceremonial-counties";
import ladToCounty from "../data/live/lad-to-county.json";

export interface CountyArea {
  areaCode: string;
  areaName: string;
  supportedAsylum: number;
  afghanProgrammePopulation: number;
  homesForUkraineArrivals: number;
  population: number;
}

export interface County {
  countyName: string;
  countySlug: string;
  countyPath: string;
  areaCount: number;
  /** Stock at the snapshot date. Safe to sum, reconciles exactly to the source. */
  supportedAsylum: number;
  /** Stock at the snapshot date. Safe to sum, reconciles exactly to the source. */
  afghanProgrammePopulation: number;
  /** Cumulative arrivals, excluding super sponsors and unallocated cases. Not a stock. */
  homesForUkraineArrivals: number;
  population: number;
  /** Per 10,000 residents, on the supported asylum stock only. */
  supportedAsylumRate: number | null;
  /** 1 is the highest supported-asylum count of all English counties. */
  nationalRank: number;
  /** How many counties there are, so a page can say "4th of 47" without hardcoding. */
  countyCount: number;
  areas: CountyArea[];
}

const ONS_LOOKUP = (ladToCounty as { lookup: Record<string, string> }).lookup;

/**
 * ONS codes the Home Office and the ONS lookup disagree about.
 *
 * Barnsley and Sheffield carry E08000016 and E08000019 in ONS LAD24_CTY24_EN_LU, and
 * the Home Office published them as E08000038 and E08000039 in the year ending June
 * 2026 release. They have flipped between the two before and will again, so this
 * translates at lookup time rather than editing either registry: correcting the code
 * in the source data is how the next flip becomes a silent wrong answer instead of a
 * loud missing one.
 *
 * Left unmapped, both authorities fall out of every county total. That cost South
 * Yorkshire 5,525 people on asylum support, and the county page said nothing was wrong.
 */
const AREA_CODE_ALIASES: Readonly<Record<string, string>> = {
  E08000038: "E08000016", // Barnsley
  E08000039: "E08000019"  // Sheffield
};

/** The ceremonial county an English authority belongs to, or null if not England. */
export function countyForAreaCode(areaCode: string): string | null {
  const code = AREA_CODE_ALIASES[areaCode] ?? areaCode;
  const fromOns = ONS_LOOKUP[code];
  if (fromOns) return normaliseCountyName(fromOns);
  const fromUnitary = UNITARY_TO_CEREMONIAL_COUNTY[code];
  return fromUnitary ?? null;
}

export function buildCountyPath(countyName: string): string {
  return `/places/counties/${countySlug(countyName)}/`;
}

export function getCounties(): County[] {
  const { areas } = loadLocalRouteLatest();
  const buckets = new Map<string, CountyArea[]>();

  for (const area of areas as LocalRouteAreaSummary[]) {
    const county = countyForAreaCode(area.areaCode);
    if (!county) continue; // Scotland, Wales and Northern Ireland have no county tier here
    const list = buckets.get(county) ?? [];
    list.push({
      areaCode: area.areaCode,
      areaName: area.areaName,
      supportedAsylum: area.supportedAsylum ?? 0,
      afghanProgrammePopulation: area.afghanProgrammePopulation ?? 0,
      homesForUkraineArrivals: area.homesForUkraineArrivals ?? 0,
      population: area.population ?? 0
    });
    buckets.set(county, list);
  }

  const counties: County[] = [];
  for (const [countyName, list] of buckets) {
    const sum = (pick: (a: CountyArea) => number) => list.reduce((t, a) => t + pick(a), 0);
    const population = sum((a) => a.population);
    const supportedAsylum = sum((a) => a.supportedAsylum);
    counties.push({
      countyName,
      countySlug: countySlug(countyName),
      countyPath: buildCountyPath(countyName),
      areaCount: list.length,
      supportedAsylum,
      afghanProgrammePopulation: sum((a) => a.afghanProgrammePopulation),
      homesForUkraineArrivals: sum((a) => a.homesForUkraineArrivals),
      population,
      supportedAsylumRate: population > 0
        ? Number(((supportedAsylum / population) * 10_000).toFixed(1))
        : null,
      nationalRank: 0, // assigned below, once every county is built and sorted
      countyCount: 0,
      areas: [...list].sort((a, b) => b.supportedAsylum - a.supportedAsylum)
    });
  }

  const sorted = counties.sort(
    (a, b) => b.supportedAsylum - a.supportedAsylum || a.countyName.localeCompare(b.countyName)
  );
  sorted.forEach((county, index) => {
    county.nationalRank = index + 1;
    county.countyCount = sorted.length;
  });
  return sorted;
}

export function getCountyBySlug(slug: string): County | null {
  return getCounties().find((county) => county.countySlug === slug) ?? null;
}
