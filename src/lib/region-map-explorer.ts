import type { PlaceDirectory } from "./place-directory";
import type { RegionPressureSummary } from "./route-analytics";

export interface RegionMapValue {
  regionName: string;
  value: number;
  note?: string;
}

export interface RegionMapSummary {
  title: string;
  body: string;
  href?: string;
  cta?: string;
  chips?: string[];
}

export interface RegionMapView {
  id: string;
  label: string;
  title: string;
  description?: string;
  valueLabel: string;
  tone?: "accent" | "teal" | "warm";
  items: RegionMapValue[];
  highlightRegion?: string;
  highlightRegions?: string[];
  summaries?: Record<string, RegionMapSummary>;
  legendTitle: string;
  legendBody: string;
}

function getHotelVisibilityLeader(placeDirectory: PlaceDirectory) {
  return [...placeDirectory.regions].sort(
    (left, right) =>
      right.hotelLinkedPlaceCount - left.hotelLinkedPlaceCount ||
      right.namedCurrentSiteCount - left.namedCurrentSiteCount ||
      right.supportedAsylum - left.supportedAsylum
  )[0];
}

function buildTotalSummaries(placeDirectory: PlaceDirectory): Record<string, RegionMapSummary> {
  return Object.fromEntries(
    placeDirectory.regions.map((region) => [
      region.regionName,
      {
        title: `${region.regionName} region`,
        body: `${region.supportedAsylum.toLocaleString()} people are on supported asylum across ${region.publicPlaceCount.toLocaleString()} public place pages in this regional slice. ${region.leadArea ? `${region.leadArea.area.areaName} is the first authority to open from here.` : "No lead authority is currently attached to this regional page set."}`,
        href: region.regionPath,
        cta: `Open ${region.regionName}`,
        chips: [
          `${region.supportedAsylum.toLocaleString()} supported asylum`,
          `${region.supportedAsylumRate} per 10,000`,
          `${region.publicPlaceCount.toLocaleString()} place pages`
        ]
      }
    ])
  );
}

function buildRateSummaries(placeDirectory: PlaceDirectory): Record<string, RegionMapSummary> {
  return Object.fromEntries(
    placeDirectory.regions.map((region) => [
      region.regionName,
      {
        title: `${region.regionName} rate frame`,
        body: `${region.supportedAsylumRate} people per 10,000 residents are on supported asylum in this weighted regional view. Use this mode to separate intensity from the bigger raw totals elsewhere.`,
        href: region.regionPath,
        cta: `Open ${region.regionName}`,
        chips: [
          `${region.supportedAsylumRate} per 10,000`,
          `${region.supportedAsylum.toLocaleString()} supported asylum`,
          `${region.contingencyAccommodation.toLocaleString()} contingency`
        ]
      }
    ])
  );
}

function buildHotelSummaries(placeDirectory: PlaceDirectory): Record<string, RegionMapSummary> {
  return Object.fromEntries(
    placeDirectory.regions.map((region) => [
      region.regionName,
      {
        title: `${region.regionName} hotel visibility`,
        body: `${region.hotelLinkedPlaceCount.toLocaleString()} public place pages in this region already carry hotel evidence. ${region.namedCurrentSiteCount > 0 ? `${region.namedCurrentSiteCount.toLocaleString()} named current hotel site${region.namedCurrentSiteCount === 1 ? "" : "s"} are visible through the place layer.` : "The visible hotel signal here still stops at unnamed acknowledged use or no named current sites."}`,
        href: region.regionPath,
        cta: `Open ${region.regionName}`,
        chips: [
          `${region.hotelLinkedPlaceCount.toLocaleString()} place pages with hotel evidence`,
          `${region.namedCurrentSiteCount.toLocaleString()} named current sites`,
          `${region.unnamedOnlyPlaceCount.toLocaleString()} unnamed-only place pages`
        ]
      }
    ])
  );
}

export function buildPlaceRegionMapViews(
  placeDirectory: PlaceDirectory,
  regionalPressure: RegionPressureSummary[]
): RegionMapView[] {
  const fallbackRegion = placeDirectory.regions[0];

  if (!fallbackRegion) {
    return [];
  }

  const totalLeaderName = regionalPressure[0]?.regionName ?? fallbackRegion.regionName;
  const rateLeaderName =
    [...regionalPressure].sort((left, right) => right.supportedAsylumRate - left.supportedAsylumRate)[0]?.regionName ??
    fallbackRegion.regionName;
  const hotelLeaderName = getHotelVisibilityLeader(placeDirectory)?.regionName ?? fallbackRegion.regionName;

  return [
    {
      id: "supported_total",
      label: "Total",
      title: "Supported asylum by region",
      description: `${totalLeaderName} currently has the largest regional supported-asylum total in the live local-authority snapshot.`,
      valueLabel: "supported asylum total",
      tone: "accent",
      items: regionalPressure.map((region) => ({
        regionName: region.regionName,
        value: region.supportedAsylum
      })),
      highlightRegion: totalLeaderName,
      summaries: buildTotalSummaries(placeDirectory),
      legendTitle: "Scale first",
      legendBody:
        "Use total to see where the largest supported-asylum stock sits before you narrow into one authority."
    },
    {
      id: "supported_rate",
      label: "Rate",
      title: "Supported asylum rate by region",
      description: `${rateLeaderName} currently has the highest weighted regional rate per 10,000 residents.`,
      valueLabel: "rate per 10,000",
      tone: "teal",
      items: regionalPressure.map((region) => ({
        regionName: region.regionName,
        value: region.supportedAsylumRate
      })),
      highlightRegion: rateLeaderName,
      summaries: buildRateSummaries(placeDirectory),
      legendTitle: "Intensity second",
      legendBody:
        "Use rate to see where pressure is sharper relative to population. The busiest region is not always the most intense."
    },
    {
      id: "hotel_visibility",
      label: "Hotel visibility",
      title: "Place pages with hotel evidence by region",
      description: `${hotelLeaderName} currently has the widest visible hotel footprint inside the published place layer.`,
      valueLabel: "place pages with hotel evidence",
      tone: "warm",
      items: placeDirectory.regions.map((region) => ({
        regionName: region.regionName,
        value: region.hotelLinkedPlaceCount
      })),
      highlightRegion: hotelLeaderName,
      summaries: buildHotelSummaries(placeDirectory),
      legendTitle: "Visibility third",
      legendBody:
        "Use hotel visibility to see where the place layer already carries named or unnamed hotel evidence. This is a publication footprint, not a complete map of all hotels."
    }
  ];
}
