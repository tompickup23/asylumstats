/**
 * The site's downloadable datasets, and the schema.org Dataset markup that describes them.
 *
 * Google Dataset Search reads Dataset markup and lists a dataset only when it can say who
 * made it, under what licence, and where to get it. Until October 2026 the place pages
 * declared a Dataset with no licence, no source and no download, and named its creator
 * by an @id that only the homepage defined, so on every place page the creator had no
 * name. This module is the one place those facts live.
 *
 * WHAT THE CSV MAY CONTAIN. Only columns that come from the Home Office regional and
 * local authority table, plus one rate derived from two of them. The combined
 * "all three pathways" total is left out on purpose: it adds a stock (people on asylum
 * support) to a flow (Homes for Ukraine arrivals), which county-directory.ts and
 * transform-routes.mjs both forbid. A download is the easiest place for that sum to
 * escape into someone else's chart.
 */
import ukRoutes from "../../data/raw/manifests/uk_routes.json";
import { ROUTES_RELEASE_DATE } from "./data-releases";
import { formatFindingDate } from "./finding-dates";
import { loadLocalRouteLatest } from "./route-data";
import { SITE_NAME, SITE_URL } from "./site-identity";

export const OGL_V3 = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

/** The site as a named organisation, inline, so a Dataset's creator always has a name. */
export const SITE_ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL
} as const;

const HOME_OFFICE = {
  "@type": "Organization",
  name: "Home Office",
  url: "https://www.gov.uk/government/organisations/home-office"
} as const;

const localAuthorityFile = ukRoutes.files.find((file) => file.sourceId === "local_immigration_groups");

/** The Home Office release every local authority figure on the site comes from. */
export const HOME_OFFICE_LOCAL_AUTHORITY_SOURCE = {
  "@type": "Dataset",
  name: `${ukRoutes.release}: regional and local authority data`,
  url: ukRoutes.releasePage,
  ...(localAuthorityFile ? { sameAs: localAuthorityFile.sourceUrl } : {}),
  creator: HOME_OFFICE,
  publisher: HOME_OFFICE,
  license: OGL_V3,
  ...(ROUTES_RELEASE_DATE ? { datePublished: ROUTES_RELEASE_DATE } : {})
};

export const LOCAL_AUTHORITY_CSV_PATH = "/data/local-authority-asylum-support.csv";
export const LOCAL_AUTHORITY_DATASET_ID = `${SITE_URL}/places/#dataset`;

const CSV_COLUMNS = [
  ["area_code", (a) => a.areaCode],
  ["area_name", (a) => a.areaName],
  ["region", (a) => a.regionName],
  ["country", (a) => a.countryName],
  ["snapshot_date", (a) => a.snapshotDate],
  ["supported_asylum", (a) => a.supportedAsylum],
  ["initial_accommodation", (a) => a.initialAccommodation],
  ["dispersal_accommodation", (a) => a.dispersalAccommodation],
  ["contingency_accommodation", (a) => a.contingencyAccommodation],
  ["other_accommodation", (a) => a.otherAccommodation ?? null],
  ["subsistence_only", (a) => a.subsistenceOnly],
  ["population", (a) => a.population],
  ["supported_asylum_per_10000", (a) => a.supportedAsylumRate]
] as const satisfies ReadonlyArray<readonly [string, (area: CsvArea) => string | number | null]>;

type CsvArea = ReturnType<typeof loadLocalRouteLatest>["areas"][number] & { otherAccommodation?: number };

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One row per local authority, in area code order, so diffs between releases are readable. */
export function buildLocalAuthorityCsv(): string {
  const areas = [...(loadLocalRouteLatest().areas as CsvArea[])].sort((a, b) => a.areaCode.localeCompare(b.areaCode));
  const lines = [CSV_COLUMNS.map(([name]) => name).join(",")];
  for (const area of areas) {
    lines.push(CSV_COLUMNS.map(([, pick]) => csvCell(pick(area))).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** The national dataset, described once and declared on /places/. */
export function buildLocalAuthorityDataset(description: string) {
  const { snapshotDate } = loadLocalRouteLatest();
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": LOCAL_AUTHORITY_DATASET_ID,
    name: `People on asylum support by UK local authority, ${formatFindingDate(snapshotDate)}`,
    description,
    url: `${SITE_URL}/places/`,
    isAccessibleForFree: true,
    license: OGL_V3,
    creator: SITE_ORGANIZATION,
    publisher: SITE_ORGANIZATION,
    isBasedOn: HOME_OFFICE_LOCAL_AUTHORITY_SOURCE,
    ...(ROUTES_RELEASE_DATE ? { dateModified: ROUTES_RELEASE_DATE } : {}),
    temporalCoverage: snapshotDate,
    spatialCoverage: { "@type": "Country", name: "United Kingdom" },
    keywords: ["asylum support", "contingency accommodation", "dispersal accommodation", "local authority"],
    variableMeasured: [
      "People on asylum support",
      "People in initial accommodation",
      "People in dispersal accommodation",
      "People in contingency accommodation (hotels and other sites)",
      "People receiving subsistence only",
      "Population",
      "People on asylum support per 10,000 population"
    ],
    measurementTechnique: "Count of people in receipt of support under sections 4, 95 and 98, as at the snapshot date",
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "text/csv",
        contentUrl: `${SITE_URL}${LOCAL_AUTHORITY_CSV_PATH}`
      }
    ]
  };
}
