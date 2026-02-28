import { getPublicPlaceAreas } from "./site";

export interface SiteSearchEntry {
  href: string;
  title: string;
  kind: "page" | "place";
  kicker: string;
  description: string;
  priority: number;
  searchText: string;
}

const STATIC_PAGE_ENTRIES: SiteSearchEntry[] = [
  {
    href: "/",
    title: "Home",
    kind: "page",
    kicker: "Overview",
    description: "Routes, hotels, money, and source rules on one accountability surface.",
    priority: 120,
    searchText: "home overview accountability routes hotels money methodology sources"
  },
  {
    href: "/compare/",
    title: "Compare",
    kind: "page",
    kicker: "Local pressure",
    description: "Compare local authorities by supported asylum, contingency use, route mix, and regional position.",
    priority: 118,
    searchText: "compare places local authorities pressure supported asylum contingency route mix regional"
  },
  {
    href: "/routes/",
    title: "Routes",
    kind: "page",
    kicker: "National chapters",
    description: "Official route families, trend charts, and place-level concentration built from the live marts.",
    priority: 116,
    searchText: "routes national route families small boats asylum trend charts regional concentration"
  },
  {
    href: "/hotels/",
    title: "Hotels",
    kind: "page",
    kicker: "Secrecy tracker",
    description: "Named hotel sites, unresolved ownership chains, and area-level visibility gaps.",
    priority: 117,
    searchText: "hotels secrecy named sites unresolved chains ownership operators accommodation"
  },
  {
    href: "/spending/",
    title: "Spending",
    kind: "page",
    kicker: "Money ledger",
    description: "Public contract scope, tariffs, scrutiny estimates, buyer control, and supplier exposure.",
    priority: 117,
    searchText: "spending money ledger contracts tariffs scrutiny buyers suppliers funding"
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
    description: "Source inventory showing what evidence is in scope and why some rows stay out.",
    priority: 108,
    searchText: "sources source ledger evidence scope source inventory"
  },
  {
    href: "/methodology/",
    title: "Methodology",
    kind: "page",
    kicker: "Scope rules",
    description: "Editorial and data rules for route specificity, local relevance, and publishability.",
    priority: 109,
    searchText: "methodology scope rules route specificity local relevance publishability"
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
  const placeEntries = getPublicPlaceAreas().map((area) => ({
    href: `/places/${area.areaCode}/`,
    title: area.areaName,
    kind: "place" as const,
    kicker: `${area.regionName} | ${area.countryName}`,
    description: buildPlaceDescription(
      area.supportedAsylum,
      area.supportedAsylumRate,
      area.contingencyAccommodation
    ),
    priority: Math.min(99, Math.max(20, Math.round(area.supportedAsylum / 40))),
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
  }));

  return [...STATIC_PAGE_ENTRIES, ...placeEntries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "page" ? -1 : 1;
    }

    return right.priority - left.priority || left.title.localeCompare(right.title);
  });
}
