import { loadLocalRouteLatest, type LocalRouteAreaSummary } from "./route-data";

export const SITE_NAME = "asylumstats";
export const SITE_URL = "https://asylumstats.co.uk";
export const DEFAULT_DESCRIPTION =
  "UK asylum accountability data on routes, hotels, public money, and local area pressure with source-linked evidence.";
export const DEFAULT_SOCIAL_IMAGE_PATH = "/og-card.png";

export type StructuredDataNode = Record<string, unknown>;

export interface ReleaseEntry {
  date: string;
  title: string;
  summary: string;
  sourceUrl: string;
}

const INDEXABLE_STATIC_PATHS = [
  "/",
  "/compare/",
  "/routes/",
  "/hotels/",
  "/spending/",
  "/releases/",
  "/sources/",
  "/methodology/"
] as const;

export function normalisePageTitle(title: string): string {
  return /asylumstats/i.test(title) ? title : `${title} | ${SITE_NAME}`;
}

export function buildAbsoluteUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalizedPath, SITE_URL).toString();
}

export function getPublicPlaceAreas(): LocalRouteAreaSummary[] {
  const localRouteLatest = loadLocalRouteLatest();
  const topCodes = new Set(localRouteLatest.topAreasByMetric.flatMap((group) => group.rows.map((row) => row.areaCode)));

  return localRouteLatest.areas.filter((area) => topCodes.has(area.areaCode) || area.supportedAsylum >= 200);
}

export function getIndexableSitePaths(): string[] {
  const paths = new Set<string>(INDEXABLE_STATIC_PATHS);

  for (const area of getPublicPlaceAreas()) {
    paths.add(`/places/${area.areaCode}/`);
  }

  return [...paths].sort((a, b) => a.localeCompare(b));
}

interface PlaceStructuredDataOptions {
  canonicalUrl: string;
  description: string;
  socialImageUrl: string;
  snapshotDate: string;
  areaRank: number;
  contingencyRank: number;
  namedSiteCount: number;
  unnamedSiteCount: number;
}

export function buildPlaceStructuredData(
  area: LocalRouteAreaSummary,
  options: PlaceStructuredDataOptions
): StructuredDataNode[] {
  const areaId = `${options.canonicalUrl}#area`;
  const datasetId = `${options.canonicalUrl}#dataset`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: SITE_URL
        },
        {
          "@type": "ListItem",
          position: 2,
          name: area.areaName,
          item: options.canonicalUrl
        }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "AdministrativeArea",
      "@id": areaId,
      name: area.areaName,
      identifier: area.areaCode,
      address: {
        "@type": "PostalAddress",
        addressRegion: area.regionName,
        addressCountry: area.countryName
      },
      containedInPlace: [
        {
          "@type": "AdministrativeArea",
          name: area.regionName
        },
        {
          "@type": "Country",
          name: area.countryName
        }
      ],
      subjectOf: {
        "@id": datasetId
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      "@id": datasetId,
      name: `${area.areaName} asylum profile`,
      description: options.description,
      url: options.canonicalUrl,
      image: options.socialImageUrl,
      isAccessibleForFree: true,
      dateModified: options.snapshotDate,
      temporalCoverage: `${options.snapshotDate}/${options.snapshotDate}`,
      spatialCoverage: {
        "@id": areaId
      },
      creator: {
        "@id": `${SITE_URL}/#organization`
      },
      publisher: {
        "@id": `${SITE_URL}/#organization`
      },
      keywords: [
        "asylum support",
        "contingency accommodation",
        "Homes for Ukraine",
        "Afghan programme",
        "local authority asylum data",
        area.areaName
      ],
      variableMeasured: [
        "Supported asylum",
        "Contingency accommodation",
        "Homes for Ukraine arrivals",
        "Afghan programme population",
        "Resettlement cumulative total"
      ],
      additionalProperty: [
        {
          "@type": "PropertyValue",
          name: "Supported asylum",
          value: area.supportedAsylum
        },
        {
          "@type": "PropertyValue",
          name: "Supported asylum rate per 10,000",
          value: area.supportedAsylumRate ?? "n/a"
        },
        {
          "@type": "PropertyValue",
          name: "Contingency accommodation",
          value: area.contingencyAccommodation
        },
        {
          "@type": "PropertyValue",
          name: "Area rank by supported asylum",
          value: options.areaRank
        },
        {
          "@type": "PropertyValue",
          name: "Area rank by contingency accommodation",
          value: options.contingencyRank
        },
        {
          "@type": "PropertyValue",
          name: "Current named hotel sites",
          value: options.namedSiteCount
        },
        {
          "@type": "PropertyValue",
          name: "Unnamed publicly acknowledged hotel sites",
          value: options.unnamedSiteCount
        }
      ]
    }
  ];
}

interface ReleaseCollectionStructuredDataOptions {
  canonicalUrl: string;
  description: string;
  socialImageUrl: string;
}

export function buildReleaseCollectionStructuredData(
  releases: ReleaseEntry[],
  options: ReleaseCollectionStructuredDataOptions
): StructuredDataNode[] {
  const listId = `${options.canonicalUrl}#release-list`;

  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: SITE_URL
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Releases",
          item: options.canonicalUrl
        }
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "asylumstats release diary",
      description: options.description,
      url: options.canonicalUrl,
      image: options.socialImageUrl,
      mainEntity: {
        "@id": listId
      },
      about: [
        "UK asylum statistics",
        "local authority asylum tables",
        "asylum accommodation hotels",
        "public accountability releases"
      ]
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": listId,
      name: "Release diary entries",
      numberOfItems: releases.length,
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      itemListElement: releases.map((release, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "CreativeWork",
          name: release.title,
          description: release.summary,
          url: release.sourceUrl,
          datePublished: release.date
        }
      }))
    }
  ];
}
