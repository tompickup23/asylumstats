/**
 * /og/[...slug].png, dynamic per-page Open Graph card endpoint.
 *
 * Each path enumerated in getStaticPaths emits a 1200×630 PNG rendered
 * by Satori (text + flex layout → SVG) and @resvg/resvg-js (SVG → PNG).
 *
 * Gated behind BUILD_OG=1. When unset, getStaticPaths returns [], * iteration builds skip the OG pass. CI sets BUILD_OG=1 explicitly.
 *
 * Standard layout (shared with ukdemographics.co.uk + ukelections.co.uk):
 *   Brand row (40×40 mark + name + tagline)
 *   Hero block (site-specific, AS uses stat + uppercase label + title)
 *   Single-line footer (site URL · brand sourced-tagline)
 */
import type { APIRoute, GetStaticPaths } from "astro";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getCollection } from "astro:content";
import { loadRouteDashboard, loadLocalRouteLatest } from "../route-data";
import { getPublicPlaceAreas, slugifyAreaName } from "../site";
import { loadAsylumCostReconciliation } from "../ho-spend";
import { getExplainers } from "../explainers";

import { getAllAreaCosts, getAreaCost, areaCostCard, AREA_COST_DATES, formatCostDate } from "../area-cost";

const BUILD_OG = process.env.BUILD_OG === "1";

/**
 * Two surfaces, one layout. The landscape card is what a link preview shows on X,
 * Facebook, LinkedIn and Slack. The square is what a person posts as an image, and it is
 * also the card offered on the finding page itself for right-click-and-save. They are
 * generated from the same tree so the two can never drift apart: only the type scale and
 * the padding differ, because a 96px numeral that anchors a 1200x630 looks lost in a
 * 1080 square.
 */
const SIZES = {
  og:     { width: 1200, height: 630,  pad: "60px 70px", mark: 40, brand: 18, tag: 11, stat: 96,  label: 14, title: 36, titleMax: "900px", url: 14, note: 12 },
  square: { width: 1080, height: 1080, pad: "80px",      mark: 52, brand: 24, tag: 14, stat: 150, label: 18, title: 52, titleMax: "920px", url: 18, note: 15 },
  story:  { width: 1080, height: 1920, pad: "110px 80px", mark: 56, brand: 26, tag: 15, stat: 168, label: 20, title: 58, titleMax: "920px", url: 19, note: 16 }
} as const;

type SizeName = keyof typeof SIZES;

// The estate ground. Every social and Open Graph surface across the five sites uses the
// same dark ground and the site's own accent-bright on top of it; only the accent varies.
// Values from briefings/uk-network-brand/BRAND-SYSTEM-2026-08-23.md.
const COLORS = {
  ground: "#0f1317",
  accent: "#82abcb",
  text: "#f4f6f7",
  muted: "#98a3ac",
  alert: "#e8b661",
  critical: "#e8897c",
  resolved: "#7fc9a8"
};

// The mark, as a data URI because Satori takes SVG through an img rather than as elements.
// Same two columns as the site header and the favicon, drawn on the same 64 unit grid.
const MARK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">' +
  '<rect x="17" y="14" width="13" height="36" rx="2" fill="#82abcb"/>' +
  '<rect x="34" y="27" width="13" height="23" rx="2" fill="#5b86a6"/></svg>';
const MARK_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

const verdictColor: Record<string, string> = {
  alert: COLORS.alert,
  critical: COLORS.critical,
  resolved: COLORS.resolved,
  info: COLORS.accent
};

// Source Serif 4 for display, Source Sans 3 for everything else, matching the site.
// woff rather than woff2: Satori reads ttf, otf and woff, and silently falls back on
// woff2, which would render these cards in a font nobody chose.
let displaySemiBold: ArrayBuffer | null = null;
let sansRegular: ArrayBuffer | null = null;
let sansSemiBold: ArrayBuffer | null = null;

function loadFont(fontFile: string): ArrayBuffer {
  const fontPath = join(process.cwd(), "src", "assets", "fonts", fontFile);
  return readFileSync(fontPath).buffer as ArrayBuffer;
}

function ensureFonts() {
  if (!displaySemiBold) displaySemiBold = loadFont("SourceSerif4-SemiBold.woff");
  if (!sansRegular) sansRegular = loadFont("SourceSans3-Regular.woff");
  if (!sansSemiBold) sansSemiBold = loadFont("SourceSans3-SemiBold.woff");
}

export const getStaticPaths: GetStaticPaths = async () => {
  if (!BUILD_OG) return [];

  const findings = await getCollection("findings");
  const routeDashboard = loadRouteDashboard();

  const findingProps = (f: (typeof findings)[number]) => ({
    title: f.data.headline,
    stat: f.data.stat_value,
    statLabel: f.data.stat_label,
    verdict: f.data.verdict
  });

  const findingPaths = findings.flatMap((f) => {
    const slug = f.id.replace(/\.md$/, "");
    return [
      { params: { slug: `findings/${slug}` }, props: { ...findingProps(f), size: "og" } },
      { params: { slug: `square/findings/${slug}` }, props: { ...findingProps(f), size: "square" } },
      { params: { slug: `story/findings/${slug}` }, props: { ...findingProps(f), size: "story" } }
    ];
  });

  const latestQuarter = routeDashboard.nationalSystemDynamics.latestQuarter;
  const localRouteLatest = loadLocalRouteLatest();

  // Existing place links and explicit cost downloads use the same dated card.
  const placePaths = getPublicPlaceAreas().map(area => ({
    params: { slug: `places/${slugifyAreaName(area.areaName)}` },
    props: areaCostCard(getAreaCost(area.areaCode))
  }));

  const supported = latestQuarter.supportedAsylum;
  const areaCount = localRouteLatest.areas.length;
  const regionShares = new Map<string, number>();
  for (const a of localRouteLatest.areas) {
    if (!a.regionName) continue;
    regionShares.set(a.regionName, (regionShares.get(a.regionName) ?? 0) + a.supportedAsylum);
  }
  const topRegion = [...regionShares.entries()].sort((x, y) => y[1] - x[1])[0];

  // The figures come from the mart rather than being typed in, so the card cannot drift
  // from the page it advertises when the monthly refresh moves the numbers.
  const recon = loadAsylumCostReconciliation();
  const capture = recon.headline.capture;

  const sectionPaths = [
    {
      slug: "what-the-home-office-publishes",
      title: "The Home Office publishes a fraction of what it spends on asylum",
      stat: capture ? `£${capture.perHundredPounds} in £100` : "11 in 100",
      statLabel: `Asylum spending itemised, ${recon.fy}`,
      verdict: "alert"
    },
    {
      slug: "national",
      title: "The national picture, quarter by quarter",
      stat: latestQuarter.awaitingInitialDecision.toLocaleString(),
      statLabel: `Awaiting an initial decision, ${latestQuarter.stockPeriodLabel}`,
      verdict: "alert"
    },
    {
      slug: "regional",
      title: `The ${topRegion[0]} carries more than any other region`,
      stat: `${((topRegion[1] / supported) * 100).toFixed(1)}%`,
      statLabel: `${topRegion[0]} share of the supported population`,
      verdict: "alert"
    },
    {
      slug: "places",
      title: "Every UK local authority, on one page",
      stat: areaCount.toLocaleString(),
      statLabel: "Local authorities with asylum support data",
      verdict: "info"
    },
    {
      slug: "compare",
      title: "Put two places side by side",
      stat: areaCount.toLocaleString(),
      statLabel: "Areas you can compare, on the same measures",
      verdict: "info"
    },
    {
      slug: "spending",
      title: "Follow the asylum money",
      stat: supported.toLocaleString(),
      statLabel: "People on asylum support, and what they cost",
      verdict: "critical"
    },
    {
      slug: "entities",
      title: "Three companies hold every prime accommodation contract",
      stat: "3",
      statLabel: "Prime providers: Serco, Mears, Clearsprings",
      verdict: "critical"
    },
    {
      slug: "explained",
      title: "UK asylum questions, answered with the latest figures",
      stat: getExplainers().length.toLocaleString(),
      statLabel: "Questions answered, each updated with the official data",
      verdict: "info"
    },
    {
      slug: "findings",
      title: "Findings, each one checked against source",
      stat: findings.filter((f) => !f.data.superseded_by).length.toLocaleString(),
      statLabel: "Published findings and articles",
      verdict: "info"
    }
  ].map((p) => ({
    params: { slug: p.slug },
    props: { title: p.title, stat: p.stat, statLabel: p.statLabel, verdict: p.verdict }
  }));

  // One card per explainer, carrying the same live figure the page leads with.
  const explainerPaths = getExplainers().flatMap((explainer) => {
    const props = { title: explainer.question, stat: explainer.figure, statLabel: explainer.figureLabel, verdict: "info" };
    return [
      { params: { slug: `explained/${explainer.slug}` }, props: { ...props, size: "og" } },
      { params: { slug: `square/explained/${explainer.slug}` }, props: { ...props, size: "square" } }
    ];
  });

  return [
    ...sectionPaths,
    ...explainerPaths,
    {
      params: { slug: "home" },
      props: {
        title: "Follow the money",
        stat: `${latestQuarter.supportedAsylum.toLocaleString()}`,
        statLabel: "On asylum support",
        verdict: "info"
      }
    },
    {
      params: { slug: "routes" },
      props: {
        title: "The routes into Britain",
        stat: `${(routeDashboard.nationalCards[0]?.value ?? 0).toLocaleString()}`,
        statLabel: "Small boat arrivals",
        verdict: "alert"
      }
    },
    ...findingPaths,
    ...placePaths,
    ...getAllAreaCosts().map(cost => ({ params: { slug: `cost/${slugifyAreaName(cost.areaName)}` }, props: areaCostCard(cost) })),
    { params: { slug: "cost" }, props: {
      title: "Asylum costs by town", stat: `${areaCount} areas`, statLabel: "Priced components and relative burden", verdict: "info",
      details: ["Annualised subtotals, not recorded expenditure. Paid by the Home Office.",
        "Unpriced accommodation and hotel-rate scenarios labelled in every row.",
        "Excludes grants and separate accommodated allowances.",
        `Home Office Reg_02 count: ${formatCostDate(AREA_COST_DATES.count)}. Rates: ${AREA_COST_DATES.rate}.`,
        `HMRC Tables 3.14 and 3.14a: ${AREA_COST_DATES.taxpayers}.`]
    } }
  ];
};

const renderedCards = new Map<string, Uint8Array>();
const imageResponse = (png: Uint8Array) => new Response(png as Uint8Array<ArrayBuffer>, {
  headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" }
});
export const GET: APIRoute = async ({ props }) => {
  const cacheKey = JSON.stringify(props);
  const cached = renderedCards.get(cacheKey);
  if (cached) return imageResponse(cached);
  ensureFonts();

  const { title, stat, statLabel, verdict, size, details } = props as {
    title: string;
    stat: string;
    statLabel: string;
    verdict: string;
    size?: SizeName;
    details?: string[];
  };

  const S = SIZES[size ?? "og"];

  const statColor = verdictColor[verdict] ?? COLORS.accent;

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: `${S.width}px`,
          height: `${S.height}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: S.pad,
          background: COLORS.ground,
          fontFamily: "Source Sans 3"
        },
        children: [
          // Brand row, shared standard across UKD / UKE / AS.
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "12px"
              },
              children: [
                {
                  type: "img",
                  props: { src: MARK_URI, width: S.mark, height: S.mark }
                },
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexDirection: "column"
                    },
                    children: [
                      {
                        type: "span",
                        props: {
                          style: {
                            fontFamily: "Source Serif 4",
                            fontWeight: 600,
                            fontSize: `${S.brand}px`,
                            color: COLORS.text
                          },
                          children: "asylumstats"
                        }
                      },
                      {
                        type: "span",
                        props: {
                          style: {
                            fontSize: `${S.tag}px`,
                            color: COLORS.muted,
                            letterSpacing: "0.05em"
                          },
                          children: "Follow the money"
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          // Hero block, stat (display 96, accent) + label + title.
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                gap: details ? "10px" : "20px",
                flex: 1,
                justifyContent: "center"
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      fontFamily: "Source Serif 4",
                      fontSize: `${details ? 60 : S.stat}px`,
                      fontWeight: 600,
                      color: statColor,
                      lineHeight: 1,
                      letterSpacing: "-0.03em"
                    },
                    children: stat
                  }
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontSize: `${S.label}px`,
                      color: COLORS.muted,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em"
                    },
                    children: statLabel
                  }
                },
                {
                  type: "div",
                  props: {
                    style: {
                      fontFamily: "Source Serif 4",
                      fontSize: `${S.title}px`,
                      fontWeight: 600,
                      color: COLORS.text,
                      lineHeight: 1.15,
                      maxWidth: S.titleMax
                    },
                    children: title
                  }
                },
                ...(details ?? []).map(line => ({ type: "div", props: {
                  style: { fontSize: "19px", color: COLORS.muted, lineHeight: 1.2 }, children: line
                } }))
              ]
            }
          },
          // Single-line footer, URL (brand colour) + tagline (muted).
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: `2px solid ${COLORS.accent}`,
                paddingTop: "16px"
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: `${S.url}px`,
                      color: COLORS.accent,
                      fontWeight: 600
                    },
                    children: "asylumstats.co.uk"
                  }
                },
                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: `${S.note}px`,
                      color: COLORS.muted
                    },
                    children: "Every number sourced."
                  }
                }
              ]
            }
          }
        ]
      }
    },
    {
      width: S.width,
      height: S.height,
      fonts: [
        { name: "Source Sans 3", data: sansRegular!, weight: 400, style: "normal" },
        { name: "Source Sans 3", data: sansSemiBold!, weight: 600, style: "normal" },
        { name: "Source Serif 4", data: displaySemiBold!, weight: 600, style: "normal" }
      ]
    }
  );

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: S.width } });
  const png = Buffer.from(resvg.render().asPng());

  const bytes = new Uint8Array(png);
  renderedCards.set(cacheKey, bytes);
  return imageResponse(bytes);
};
