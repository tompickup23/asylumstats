import { getPlaceDirectory } from "./place-directory";
import { getPublicPlaceAreas } from "./site";
import { getEthnicProjection } from "./ethnic-projections";
import { TOTAL_GBP_M } from "./true-cost";

export interface SiteSearchEntry {
  href: string;
  title: string;
  kind: "page" | "region" | "place";
  kicker: string;
  description: string;
  priority: number;
  // Area-specific fields for preview cards
  areaCode?: string;
  areaName?: string;
  regionName?: string;
  supportedAsylum?: number;
  supportedAsylumRate?: number | null;
  wbiNow?: number | null;
  wbi2051?: number | null;
  searchText: string;
}

const STATIC_PAGE_ENTRIES: SiteSearchEntry[] = [
  {
    href: "/",
    title: "Home",
    kind: "page",
    kicker: "Overview",
    description: "Place-led homepage with the regional map, featured local authorities, and system reading rules.",
    priority: 120,
    searchText: "home overview places regions local authorities map system methodology sources"
  },
  {
    href: "/places/",
    title: "Places",
    kind: "page",
    kicker: "Region and place directory",
    description: "Browse regions, open place pages, and carry hotel visibility inside the local reading.",
    priority: 119,
    searchText: "places regions map local authorities supported asylum contingency hotel visibility place directory"
  },
  {
    href: "/national/",
    title: "National",
    kind: "page",
    kicker: "UK-wide totals",
    description: "UK-level totals across supported asylum, contingency accommodation, routes, demographics, and the public money surface.",
    priority: 118,
    searchText: "national uk-wide totals supported asylum contingency routes demographics money headline figures national overview united kingdom england"
  },
  {
    href: "/regional/",
    title: "Regional",
    kind: "page",
    kicker: "Regions and nations",
    description: "Nine English regions plus Scotland, Wales, and Northern Ireland with comparable pressure, money, and demographic readings.",
    priority: 113,
    searchText: "regional regions english regions scotland wales northern ireland nations regional pressure comparable readings nine regions"
  },
  {
    href: "/councils/",
    title: "Councils",
    kind: "page",
    kicker: "By council",
    description: "Local authority view of supported asylum and contingency accommodation, with named-hotel evidence layered on each council page.",
    priority: 114,
    searchText: "councils local authorities council accommodation supported asylum contingency named hotels council pages by-council view"
  },
  {
    href: "/spending/",
    title: "Spending",
    kind: "page",
    kicker: "Money trail",
    description: `£${(TOTAL_GBP_M.central / 1000).toFixed(1)}B True Cost breakdown of UK asylum spend by department, supplier, and route, with every figure tied to a public money row.`,
    priority: 117,
    searchText: "spending true cost money asylum costs billion departments suppliers contracts routes money trail expenditure budget annual report accounts"
  },
  {
    href: "/entities/",
    title: "Entities",
    kind: "page",
    kicker: "Suppliers and contractors",
    description: "Profiles of the suppliers, contractors, and corporate vehicles attached to the public asylum money trail and the named hotel estate.",
    priority: 115,
    searchText: "entities suppliers contractors providers corporate vehicles serco mears clearsprings prime providers contractors profiles ownership"
  },
  {
    href: "/compare/",
    title: "Compare",
    kind: "page",
    kicker: "Advanced place explorer",
    description: "Advanced compare surface for filtered local-authority views once the map and region directory are clear.",
    priority: 111,
    searchText: "compare advanced places local authorities pressure supported asylum contingency explorer filters"
  },
  {
    href: "/routes/",
    title: "Routes",
    kind: "page",
    kicker: "National chapters",
    description: "Official route families, stock-flow logic, trend charts, and national system context.",
    priority: 116,
    searchText: "routes national route families small boats asylum trend charts backlog support appeals returns"
  },
  {
    href: "/findings/",
    title: "Findings",
    kind: "page",
    kicker: "Published investigations",
    description: "Every published investigation: data-backed findings with full source citations across spending, routes, demographics, backlog, accountability, crime, SEND, and social care.",
    priority: 115,
    searchText: "findings investigations research analysis published findings data-backed evidence citations spending routes demographics backlog accountability crime send social care pressure"
  },
  {
    href: "/releases/",
    title: "Releases",
    kind: "page",
    kicker: "Update diary",
    description: "Release log tracking when national tables, local authority data, and the site itself moved.",
    priority: 110,
    searchText: "releases update diary freshness chronology release log"
  },
  {
    href: "/sources/",
    title: "Sources",
    kind: "page",
    kicker: "Source ledger",
    description:
      "Source inventory showing what evidence is in scope, which regional feeds are worth mining, and where historic backfill and archive-only hotel leads live.",
    priority: 108,
    searchText:
      "sources source ledger evidence scope source inventory regional migration partnerships historic backfill archive nwrsmp workbooks dashboards migration observatory aida archived hotel map"
  },
  {
    href: "/methodology/",
    title: "Methodology",
    kind: "page",
    kicker: "Scope rules",
    description: "Editorial and data rules for route specificity, local relevance, and publishability.",
    priority: 109,
    searchText: "methodology scope rules route specificity local relevance publishability"
  },
  {
    href: "/glossary/",
    title: "Glossary",
    kind: "page",
    kicker: "Terms and definitions",
    description: "Definitions for every term, acronym, route family, and statutory framework used across the site.",
    priority: 105,
    searchText: "glossary terms definitions acronyms route families statutory frameworks asylum support contingency definitions"
  }
];

function buildPlaceDescription(
  supportedAsylum: number,
  supportedAsylumRate: number | null,
  contingencyAccommodation: number
): string {
  const rateLabel = supportedAsylumRate !== null ? `${supportedAsylumRate} per 10,000` : "rate not published";
  return `${supportedAsylum.toLocaleString()} on supported asylum, ${rateLabel}, ${contingencyAccommodation.toLocaleString()} in contingency accommodation.`;
}

export function getPublicSearchEntries(): SiteSearchEntry[] {
  const placeDirectory = getPlaceDirectory();
  const placeEntries = getPublicPlaceAreas().map((area) => {
    const ep = getEthnicProjection(area.areaCode);
    return {
    href: `/places/${area.areaName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}/`,
    title: area.areaName,
    kind: "place" as const,
    kicker: `${area.regionName} | ${area.countryName}`,
    description: buildPlaceDescription(
      area.supportedAsylum,
      area.supportedAsylumRate,
      area.contingencyAccommodation
    ),
    priority: Math.min(99, Math.max(20, Math.round(area.supportedAsylum / 40))),
    areaCode: area.areaCode,
    areaName: area.areaName,
    regionName: area.regionName,
    supportedAsylum: area.supportedAsylum,
    supportedAsylumRate: area.supportedAsylumRate,
    wbiNow: ep?.current?.groups?.white_british ?? null,
    wbi2051: ep?.projections?.["2051"]?.white_british ?? null,
    searchText: [
      area.areaName,
      area.areaCode,
      area.regionName,
      area.countryName,
      "place",
      "local authority",
      "supported asylum",
      "contingency accommodation",
      "homes for ukraine",
      "afghan programme"
    ]
      .join(" ")
      .toLowerCase()
  };
  });
  const regionEntries = placeDirectory.regions.map((region) => ({
    href: region.regionPath,
    title: region.regionName,
    kind: "region" as const,
    kicker: `${region.countryName} region`,
    description: `${region.supportedAsylum.toLocaleString()} on supported asylum across ${region.publicPlaceCount.toLocaleString()} public place pages, with ${region.hotelLinkedPlaceCount.toLocaleString()} place pages already carrying hotel evidence.`,
    priority: 112,
    searchText: [
      region.regionName,
      region.countryName,
      "region",
      "regional map",
      "regional pressure",
      "supported asylum",
      "contingency accommodation",
      "hotel visibility",
      "place directory"
    ]
      .join(" ")
      .toLowerCase()
  }));

  const kindOrder: Record<SiteSearchEntry["kind"], number> = { page: 0, region: 1, place: 2 };

  return [...STATIC_PAGE_ENTRIES, ...regionEntries, ...placeEntries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return kindOrder[left.kind] - kindOrder[right.kind];
    }

    return right.priority - left.priority || left.title.localeCompare(right.title);
  });
}
