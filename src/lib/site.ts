import { loadLocalRouteLatest, type LocalRouteAreaSummary } from "./route-data";
import { getEntityProfiles, type EntityProfile } from "./entities";
import { buildCountyPath, countyForAreaCode, getCounties, type County } from "./county-directory";
import { HOME_OFFICE_LOCAL_AUTHORITY_SOURCE, LOCAL_AUTHORITY_DATASET_ID, OGL_V3, SITE_ORGANIZATION } from "./datasets";
import { ROUTES_RELEASE_DATE } from "./data-releases";
import { SITE_NAME, SITE_URL, buildPlacePath, slugifyAreaName } from "./site-identity";
import { citationSubjectOf } from "./citations";

export { SITE_NAME, SITE_URL, buildPlacePath, slugifyAreaName };
export const DEFAULT_DESCRIPTION =
  "Follow YOUR money. UK asylum costs, routes, and demographic impact. Every figure sourced, every claim checked.";
export const DEFAULT_SOCIAL_IMAGE_PATH = "/og-card.png";

/**
 * The accounts that are this site.
 *
 * Listed in the footer for readers and emitted as schema.org sameAs for search engines,
 * which is how an entity gets connected to its own profiles rather than treated as
 * unrelated things with similar names. Facebook is a numeric Page id because the Page has
 * no vanity URL; it is stable and it resolves.
 */
export const SOCIAL_PROFILES = {
  facebook: "https://www.facebook.com/1191879377352149",
  youtube: "https://www.youtube.com/@asylumstats"
} as const;

export type StructuredDataNode = Record<string, unknown>;

/**
 * The homepage Organization node. alternateName holds the spellings other publications
 * use for the site ("Asylumstats" in the Daily Express), so a search engine joins those
 * mentions to this entity; subjectOf lists the articles that cite it
 * (src/data/site/citations.json, shown on /cited-by/).
 */
export function organizationNode(siteOrigin: URL | string = SITE_URL): StructuredDataNode {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    alternateName: ["Asylumstats", "Asylum Stats", "asylumstats.co.uk"],
    url: SITE_URL,
    // Raster, not the SVG favicon. Google's Organization logo has to be a
    // PNG, JPG or GIF and is ignored as an SVG, so the logo this site declared
    // was never eligible for the rich result it was there to earn.
    logo: {
      "@type": "ImageObject",
      url: new URL("/apple-touch-icon.png", siteOrigin).toString(),
      width: 180,
      height: 180
    },
    sameAs: Object.values(SOCIAL_PROFILES),
    subjectOf: citationSubjectOf(SITE_URL)
  };
}

export interface ReleaseEntry {
  date: string;
  title: string;
  summary: string;
  sourceUrl: string;
}

const INDEXABLE_STATIC_PATHS = [
  "/",
  "/places/",
  "/places/counties/",
  "/national/",
  "/regional/",
  // /councils/ is deliberately absent. Its own page calls itself "context infrastructure,
  // context only", it holds a single body, and its headline figure is Lancashire County
  // Council's whole £3.6bn spend corpus, which is explicitly NOT asylum spend. It keeps
  // its noIndex, so listing it here would ask search engines to index a page that tells
  // them not to. Individual /councils/<body>/ pages are noIndex for the same reason.
  "/spending/",
  "/cost/",
  "/what-the-home-office-publishes/",
  "/entities/",
  "/compare/",
  "/routes/",
  "/findings/",
  "/releases/",
  "/corrections/",
  "/cited-by/",
  "/sources/",
  "/methodology/",
  "/glossary/"
] as const;

/**
 * Regions whose name takes "the" in a sentence.
 *
 * Listed rather than guessed. A heuristic on the name gets "the London" or "North West"
 * wrong depending on which way it leans, and these strings go straight into page titles,
 * so the article is part of the published copy.
 */
const REGIONS_TAKING_THE = new Set([
  "East Midlands",
  "East of England",
  "North East",
  "North West",
  "South East",
  "South West",
  "West Midlands"
  // Not "Yorkshire and The Humber": the name already carries its own article, and
  // "the Yorkshire and The Humber" is not English.
]);

/** "the North West", but "London". For use inside a sentence or a page title. */
export function regionNameInSentence(regionName: string): string {
  return REGIONS_TAKING_THE.has(regionName) ? `the ${regionName}` : regionName;
}

function slugifyRegionName(regionName: string): string {
  return regionName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}


/**
 * The page that should stand for a county. A county made of a single authority (Cornwall,
 * Rutland, Herefordshire and the rest) has a county page that repeats a subset of that
 * authority's place page under the same question, which Search Console reads as two pages
 * competing for one query. For those the place page is canonical, the county page points
 * at it, and only the place page goes in the sitemap.
 */
export function countyCanonicalPath(county: County): string {
  return county.areaCount === 1 && county.areas[0] ? buildPlacePath(county.areas[0]) : county.countyPath;
}

export function normalisePageTitle(title: string): string {
  return /asylumstats/i.test(title) ? title : `${title} | ${SITE_NAME}`;
}

export function buildAbsoluteUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalizedPath, SITE_URL).toString();
}

export function buildPublicPlaceRegionSlug(regionName: string): string {
  return slugifyRegionName(regionName);
}

export function buildPublicPlaceRegionPath(regionName: string): string {
  return `/places/regions/${buildPublicPlaceRegionSlug(regionName)}/`;
}

/**
 * Every local authority in the routes dataset gets a page.
 *
 * This used to filter on `supportedAsylum >= 200` (plus league-table and hotel
 * membership), which built 152 of 361 pages while the homepage advertised 361 and the
 * directory advertised 307. Areas that fell under the line 404'd with no explanation:
 * Brighton and Hove at 179 had no page, an area at 201 did. The excluded 209 held
 * 9,871 people on asylum support, 10.1% of the national total, and only 17 of them had
 * none at all.
 *
 * The data exists for all 361, so the threshold was a rendering choice rather than a
 * data gap. Sections whose datasets do not reach an area already gate themselves on a
 * null profile, so a sparse page degrades to what is genuinely known about that area.
 */
export function getPublicPlaceAreas(): LocalRouteAreaSummary[] {
  return loadLocalRouteLatest().areas;
}

export function getPublicPlaceRegions(): Array<{ regionName: string; countryName: string; publicPlaceCount: number }> {
  const regionMap = new Map<string, { regionName: string; countryName: string; publicPlaceCount: number }>();

  for (const area of getPublicPlaceAreas()) {
    const existing =
      regionMap.get(area.regionName) ??
      {
        regionName: area.regionName,
        countryName: area.countryName,
        publicPlaceCount: 0
      };

    existing.publicPlaceCount += 1;
    regionMap.set(area.regionName, existing);
  }

  return [...regionMap.values()].sort((left, right) => left.regionName.localeCompare(right.regionName));
}

export function getIndexableSitePaths(): string[] {
  const paths = new Set<string>(INDEXABLE_STATIC_PATHS);

  for (const region of getPublicPlaceRegions()) {
    paths.add(buildPublicPlaceRegionPath(region.regionName));
  }

  for (const area of getPublicPlaceAreas()) {
    paths.add(buildPlacePath(area));
  }

  // Counties are produced by getStaticPaths, which this function cannot see. They have to
  // be added here by hand or they build fine and never reach the sitemap.
  // Single-authority counties are left out: their place page is the canonical one.
  for (const county of getCounties()) {
    if (countyCanonicalPath(county) === county.countyPath) paths.add(county.countyPath);
  }

  return [...paths].sort((a, b) => a.localeCompare(b));
}

export function getPublicEntityProfiles(): EntityProfile[] {
  return getEntityProfiles();
}

/** One step of a page's trail, as the visible Breadcrumbs component takes it. */
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * The BreadcrumbList for a page, built from the same items as its visible trail
 * (src/components/Breadcrumbs.astro), so the path a search engine prints is the path a
 * reader sees. Home is implied, as it is in the component. The last item is the page
 * itself and takes its URL; every earlier item must link somewhere, because Google
 * rejects a ListItem with no item unless it is the last one.
 *
 * Until November 2026 only place pages, the release diary and the entity profiles
 * declared a trail, each with its own copy of this block, and the place page's copy
 * skipped the region and county its visible trail shows. tests/structured-data.test.ts
 * reads every built page and fails where the two trails differ.
 */
export function breadcrumbListNode(items: BreadcrumbItem[], pageUrl: string): StructuredDataNode {
  const trail: BreadcrumbItem[] = [{ label: "Home", href: "/" }, ...items];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, index) => {
      const last = index === trail.length - 1;
      if (!last && !step.href) {
        throw new Error(`Breadcrumb "${step.label}" links nowhere. Only the last step may.`);
      }
      return {
        "@type": "ListItem",
        position: index + 1,
        name: step.label,
        item: last ? pageUrl : step.href === "/" ? SITE_URL : buildAbsoluteUrl(step.href!)
      };
    })
  };
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

/**
 * A place page's trail: Places, its region, its county where it has one, then the place.
 * The county step is left out outside England, where the site has no county tier, and
 * for a county that is this authority alone, whose page defers to this one (see
 * countyCanonicalPath), so the step would only lead back here.
 */
export function placeBreadcrumbs(area: LocalRouteAreaSummary): BreadcrumbItem[] {
  const countyName = countyForAreaCode(area.areaCode);
  const countyHasOwnPage =
    countyName !== null && getCounties().find((county) => county.countyName === countyName)?.areaCount !== 1;
  return [
    { label: "Places", href: "/places/" },
    { label: area.regionName, href: buildPublicPlaceRegionPath(area.regionName) },
    ...(countyName && countyHasOwnPage ? [{ label: countyName, href: buildCountyPath(countyName) }] : []),
    { label: area.areaName }
  ];
}

export function buildPlaceStructuredData(
  area: LocalRouteAreaSummary,
  options: PlaceStructuredDataOptions
): StructuredDataNode[] {
  const areaId = `${options.canonicalUrl}#area`;
  const datasetId = `${options.canonicalUrl}#dataset`;

  return [
    breadcrumbListNode(placeBreadcrumbs(area), options.canonicalUrl),
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
      license: OGL_V3,
      // The day the Home Office published the figures, not the date they describe; that
      // is temporalCoverage.
      ...(ROUTES_RELEASE_DATE ? { dateModified: ROUTES_RELEASE_DATE } : {}),
      temporalCoverage: options.snapshotDate,
      spatialCoverage: {
        "@id": areaId
      },
      creator: SITE_ORGANIZATION,
      publisher: SITE_ORGANIZATION,
      isBasedOn: HOME_OFFICE_LOCAL_AUTHORITY_SOURCE,
      // This area's row of the national table, which is where the download lives.
      isPartOf: { "@id": LOCAL_AUTHORITY_DATASET_ID },
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

interface EntityStructuredDataOptions {
  canonicalUrl: string;
  description: string;
  socialImageUrl: string;
  snapshotDate: string;
}

export function buildReleaseCollectionStructuredData(
  releases: ReleaseEntry[],
  options: ReleaseCollectionStructuredDataOptions
): StructuredDataNode[] {
  const listId = `${options.canonicalUrl}#release-list`;

  return [
    breadcrumbListNode([{ label: "Releases" }], options.canonicalUrl),
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

export function buildEntityStructuredData(
  profile: EntityProfile,
  options: EntityStructuredDataOptions
): StructuredDataNode[] {
  const profileId = `${options.canonicalUrl}#profile`;
  const organizationId = `${options.canonicalUrl}#organization`;

  return [
    breadcrumbListNode([{ label: "Entities", href: "/entities/" }, { label: profile.entityName }], options.canonicalUrl),
    {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "@id": profileId,
      name: `${profile.entityName} profile`,
      description: options.description,
      url: options.canonicalUrl,
      image: options.socialImageUrl,
      dateModified: options.snapshotDate,
      mainEntity: {
        "@id": organizationId
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": organizationId,
      name: profile.entityName,
      identifier: profile.companyNumber ?? profile.entityId,
      description: options.description,
      url: options.canonicalUrl,
      knowsAbout: [
        profile.primaryRoleLabel,
        ...profile.routeFamilies.map((routeFamily) => routeFamily.replaceAll("_", " ")),
        "asylum accommodation",
        "public money"
      ],
      address: profile.linkedAreas[0]
        ? {
            "@type": "PostalAddress",
            addressRegion: profile.linkedAreas[0].regionName,
            addressCountry: profile.linkedAreas[0].countryName
          }
        : undefined
    }
  ];
}
