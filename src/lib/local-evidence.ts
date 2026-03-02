import { loadHotelEntityLedger } from "./hotel-data";
import { loadLocalRouteLatest } from "./route-data";
import { buildPublicPlaceRegionPath } from "./site";

export interface LocalEvidencePoint {
  siteId: string;
  siteName: string;
  areaName: string;
  areaCode: string | null;
  regionName: string;
  countryName: string;
  lastPublicDate: string;
  sourceTitle: string;
  sourceUrl: string;
  entityCoverage: string;
  ownerName: string | null;
  operatorName: string | null;
  primeProviderName: string | null;
  supportedAsylum: number | null;
  supportedAsylumRate: number | null;
  contingencyAccommodation: number | null;
  placeHref: string | null;
  regionHref: string;
  chainLabel: string;
  chainSummary: string;
}

export interface RegionLocalEvidenceLayer {
  regionName: string;
  countryName: string;
  currentNamedSiteCount: number;
  partiallyResolvedSiteCount: number;
  unresolvedSiteCount: number;
  uniqueAreaCount: number;
  points: LocalEvidencePoint[];
}

function buildChainLabel(entityCoverage: string): string {
  return entityCoverage === "partial" ? "Partial chain" : "Unresolved chain";
}

function buildChainSummary(
  entityCoverage: string,
  ownerName: string | null,
  operatorName: string | null,
  primeProviderName: string | null
): string {
  if (entityCoverage === "partial") {
    return `${ownerName ? `Owner: ${ownerName}. ` : ""}${operatorName ? `Operator: ${operatorName}. ` : ""}${primeProviderName ? `Regional provider: ${primeProviderName}.` : "Some of the public chain is visible, but not all of it."}`.trim();
  }

  return primeProviderName
    ? `The site is public, but the local owner or operator chain still breaks. Regional provider: ${primeProviderName}.`
    : "The site is public, but the local owner or operator chain still breaks in the live ledger.";
}

export function getCurrentLocalEvidencePoints(): LocalEvidencePoint[] {
  const hotelLedger = loadHotelEntityLedger();
  const localRouteLatest = loadLocalRouteLatest();
  const areaByCode = new Map(localRouteLatest.areas.map((area) => [area.areaCode, area]));
  const areaByName = new Map(localRouteLatest.areas.map((area) => [area.areaName, area]));

  return hotelLedger.sites
    .filter((site) => site.status === "current")
    .map((site) => {
      const area =
        (site.areaCode ? areaByCode.get(site.areaCode) : null) ??
        areaByName.get(site.areaName) ??
        null;

      return {
        siteId: site.siteId,
        siteName: site.siteName,
        areaName: site.areaName,
        areaCode: site.areaCode,
        regionName: site.regionName,
        countryName: site.countryName,
        lastPublicDate: site.lastPublicDate,
        sourceTitle: site.sourceTitle,
        sourceUrl: site.sourceUrl,
        entityCoverage: site.entityCoverage,
        ownerName: site.ownerName,
        operatorName: site.operatorName,
        primeProviderName: site.primeProvider?.provider ?? null,
        supportedAsylum: area?.supportedAsylum ?? null,
        supportedAsylumRate: area?.supportedAsylumRate ?? null,
        contingencyAccommodation: area?.contingencyAccommodation ?? null,
        placeHref: site.areaCode ? `/places/${site.areaCode}/` : null,
        regionHref: buildPublicPlaceRegionPath(site.regionName),
        chainLabel: buildChainLabel(site.entityCoverage),
        chainSummary: buildChainSummary(
          site.entityCoverage,
          site.ownerName,
          site.operatorName,
          site.primeProvider?.provider ?? null
        )
      } satisfies LocalEvidencePoint;
    })
    .sort((left, right) => {
      return (
        (right.supportedAsylum ?? -1) - (left.supportedAsylum ?? -1) ||
        left.areaName.localeCompare(right.areaName) ||
        left.siteName.localeCompare(right.siteName)
      );
    });
}

export function getRegionLocalEvidenceLayers(): RegionLocalEvidenceLayer[] {
  const buckets = new Map<string, RegionLocalEvidenceLayer>();

  for (const point of getCurrentLocalEvidencePoints()) {
    const existing =
      buckets.get(point.regionName) ??
      ({
        regionName: point.regionName,
        countryName: point.countryName,
        currentNamedSiteCount: 0,
        partiallyResolvedSiteCount: 0,
        unresolvedSiteCount: 0,
        uniqueAreaCount: 0,
        points: []
      } satisfies RegionLocalEvidenceLayer);

    existing.currentNamedSiteCount += 1;
    existing.points.push(point);

    if (point.entityCoverage === "partial") {
      existing.partiallyResolvedSiteCount += 1;
    } else {
      existing.unresolvedSiteCount += 1;
    }

    existing.uniqueAreaCount = new Set(existing.points.map((candidate) => candidate.areaCode ?? candidate.areaName)).size;
    buckets.set(point.regionName, existing);
  }

  return [...buckets.values()].sort(
    (left, right) =>
      right.currentNamedSiteCount - left.currentNamedSiteCount || left.regionName.localeCompare(right.regionName)
  );
}

export function getFeaturedLocalEvidencePoints(limit = 4): LocalEvidencePoint[] {
  const regionLeads = new Map<string, LocalEvidencePoint>();

  for (const point of getCurrentLocalEvidencePoints()) {
    if (!regionLeads.has(point.regionName)) {
      regionLeads.set(point.regionName, point);
    }
  }

  return [...regionLeads.values()]
    .sort((left, right) => {
      return (
        (right.supportedAsylum ?? -1) - (left.supportedAsylum ?? -1) ||
        left.regionName.localeCompare(right.regionName) ||
        left.siteName.localeCompare(right.siteName)
      );
    })
    .slice(0, limit);
}
