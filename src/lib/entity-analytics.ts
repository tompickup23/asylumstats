import type { EntityProfile, EntityProfileArea } from "./entities";

export interface EntityExposureCoverageRow {
  key: "unresolved" | "partial" | "resolved";
  label: string;
  tone: "accent" | "warm" | "teal";
  count: number;
  sharePct: number;
}

export interface EntityExposureSummary {
  currentSiteCount: number;
  nonResolvedCurrentSiteCount: number;
  unresolvedCurrentSiteCount: number;
  partialCurrentSiteCount: number;
  resolvedCurrentSiteCount: number;
  nonResolvedSharePct: number;
  linkedAreaCount: number;
  totalSupportedAsylumAcrossLinkedAreas: number | null;
  totalContingencyAcrossLinkedAreas: number | null;
  leadArea: EntityProfileArea | null;
  coverageRows: EntityExposureCoverageRow[];
}

export interface EntityRegionSpreadRow {
  regionName: string;
  countryName: string;
  currentSiteCount: number;
  historicalSiteCount: number;
  linkedAreaCount: number;
  nonResolvedCurrentSiteCount: number;
  supportedAsylumTotal: number | null;
  contingencyAccommodationTotal: number | null;
  areaNames: string[];
  siteNames: string[];
}

export interface EntityLinkedPlaceRankingRow extends EntityProfileArea {
  rank: number;
  siteLabel: string;
}

function toSharePct(count: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Number(((count / total) * 100).toFixed(1));
}

function sumNumbers(values: Array<number | null | undefined>): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");

  if (numbers.length === 0) {
    return null;
  }

  return numbers.reduce((total, value) => total + value, 0);
}

function compareAreas(left: EntityProfileArea, right: EntityProfileArea): number {
  return (
    (right.supportedAsylum ?? -1) - (left.supportedAsylum ?? -1) ||
    (right.contingencyAccommodation ?? -1) - (left.contingencyAccommodation ?? -1) ||
    right.currentSiteCount - left.currentSiteCount ||
    left.areaName.localeCompare(right.areaName)
  );
}

export function getEntityExposureSummary(profile: EntityProfile): EntityExposureSummary {
  const currentSiteCount = profile.currentSites.length;
  const unresolvedCurrentSiteCount = profile.currentSites.filter((site) => site.entityCoverage === "unresolved").length;
  const partialCurrentSiteCount = profile.currentSites.filter((site) => site.entityCoverage === "partial").length;
  const resolvedCurrentSiteCount = profile.currentSites.filter((site) => site.entityCoverage === "resolved").length;
  const nonResolvedCurrentSiteCount = unresolvedCurrentSiteCount + partialCurrentSiteCount;
  const leadArea = [...profile.linkedAreas].sort(compareAreas)[0] ?? null;

  return {
    currentSiteCount,
    nonResolvedCurrentSiteCount,
    unresolvedCurrentSiteCount,
    partialCurrentSiteCount,
    resolvedCurrentSiteCount,
    nonResolvedSharePct: toSharePct(nonResolvedCurrentSiteCount, currentSiteCount),
    linkedAreaCount: profile.linkedAreas.length,
    totalSupportedAsylumAcrossLinkedAreas: sumNumbers(profile.linkedAreas.map((area) => area.supportedAsylum)),
    totalContingencyAcrossLinkedAreas: sumNumbers(profile.linkedAreas.map((area) => area.contingencyAccommodation)),
    leadArea,
    coverageRows: [
      {
        key: "unresolved",
        label: "Unresolved",
        tone: "accent",
        count: unresolvedCurrentSiteCount,
        sharePct: toSharePct(unresolvedCurrentSiteCount, currentSiteCount)
      },
      {
        key: "partial",
        label: "Partial",
        tone: "warm",
        count: partialCurrentSiteCount,
        sharePct: toSharePct(partialCurrentSiteCount, currentSiteCount)
      },
      {
        key: "resolved",
        label: "Resolved",
        tone: "teal",
        count: resolvedCurrentSiteCount,
        sharePct: toSharePct(resolvedCurrentSiteCount, currentSiteCount)
      }
    ]
  };
}

export function getEntityRegionSpread(profile: EntityProfile): EntityRegionSpreadRow[] {
  const rows = new Map<string, EntityRegionSpreadRow>();

  for (const site of profile.currentSites) {
    const key = `${site.regionName}|${site.countryName}`;
    const existing = rows.get(key);

    if (existing) {
      existing.currentSiteCount += 1;
      if (site.entityCoverage !== "resolved") {
        existing.nonResolvedCurrentSiteCount += 1;
      }
      existing.siteNames.push(site.siteName);
      continue;
    }

    rows.set(key, {
      regionName: site.regionName,
      countryName: site.countryName,
      currentSiteCount: 1,
      historicalSiteCount: 0,
      linkedAreaCount: 0,
      nonResolvedCurrentSiteCount: site.entityCoverage !== "resolved" ? 1 : 0,
      supportedAsylumTotal: null,
      contingencyAccommodationTotal: null,
      areaNames: [],
      siteNames: [site.siteName]
    });
  }

  for (const site of profile.historicalSites) {
    const key = `${site.regionName}|${site.countryName}`;
    const existing = rows.get(key);

    if (existing) {
      existing.historicalSiteCount += 1;
      existing.siteNames.push(site.siteName);
      continue;
    }

    rows.set(key, {
      regionName: site.regionName,
      countryName: site.countryName,
      currentSiteCount: 0,
      historicalSiteCount: 1,
      linkedAreaCount: 0,
      nonResolvedCurrentSiteCount: 0,
      supportedAsylumTotal: null,
      contingencyAccommodationTotal: null,
      areaNames: [],
      siteNames: [site.siteName]
    });
  }

  for (const area of profile.linkedAreas) {
    const key = `${area.regionName}|${area.countryName}`;
    const existing = rows.get(key);

    if (existing) {
      existing.linkedAreaCount += 1;
      existing.areaNames.push(area.areaName);
      existing.supportedAsylumTotal =
        existing.supportedAsylumTotal === null || area.supportedAsylum === null
          ? sumNumbers([existing.supportedAsylumTotal, area.supportedAsylum])
          : existing.supportedAsylumTotal + area.supportedAsylum;
      existing.contingencyAccommodationTotal =
        existing.contingencyAccommodationTotal === null || area.contingencyAccommodation === null
          ? sumNumbers([existing.contingencyAccommodationTotal, area.contingencyAccommodation])
          : existing.contingencyAccommodationTotal + area.contingencyAccommodation;
      continue;
    }

    rows.set(key, {
      regionName: area.regionName,
      countryName: area.countryName,
      currentSiteCount: 0,
      historicalSiteCount: 0,
      linkedAreaCount: 1,
      nonResolvedCurrentSiteCount: 0,
      supportedAsylumTotal: area.supportedAsylum,
      contingencyAccommodationTotal: area.contingencyAccommodation,
      areaNames: [area.areaName],
      siteNames: []
    });
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      areaNames: [...new Set(row.areaNames)].sort((left, right) => left.localeCompare(right)),
      siteNames: [...new Set(row.siteNames)].sort((left, right) => left.localeCompare(right))
    }))
    .sort(
      (left, right) =>
        right.currentSiteCount - left.currentSiteCount ||
        right.nonResolvedCurrentSiteCount - left.nonResolvedCurrentSiteCount ||
        (right.supportedAsylumTotal ?? -1) - (left.supportedAsylumTotal ?? -1) ||
        left.regionName.localeCompare(right.regionName)
    );
}

export function getEntityLinkedPlaceRankings(
  profile: EntityProfile,
  limit = 5
): EntityLinkedPlaceRankingRow[] {
  return [...profile.linkedAreas]
    .sort(compareAreas)
    .slice(0, limit)
    .map((area, index) => ({
      ...area,
      rank: index + 1,
      siteLabel:
        area.currentSiteCount > 0
          ? `${area.currentSiteCount} current site${area.currentSiteCount === 1 ? "" : "s"}`
          : `${area.historicalSiteCount} historical site${area.historicalSiteCount === 1 ? "" : "s"}`
    }));
}
