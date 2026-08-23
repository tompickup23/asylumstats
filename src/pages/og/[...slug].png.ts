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
import { loadRouteDashboard, loadLocalRouteLatest } from "../../lib/route-data";
import { getPublicPlaceAreas, slugifyAreaName } from "../../lib/site";

const BUILD_OG = process.env.BUILD_OG === "1";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

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

  const findingPaths = findings.map((f) => ({
    params: { slug: `findings/${f.id.replace(/\.md$/, "")}` },
    props: {
      title: f.data.headline,
      stat: f.data.stat_value,
      statLabel: f.data.stat_label,
      verdict: f.data.verdict
    }
  }));

  const latestQuarter = routeDashboard.nationalSystemDynamics.latestQuarter;
  const localRouteLatest = loadLocalRouteLatest();

  // Rank all areas by supported asylum (descending) for rank labels
  const rankedAreas = [...localRouteLatest.areas].sort((a, b) => b.supportedAsylum - a.supportedAsylum);
  const rankMap = new Map(rankedAreas.map((a, i) => [a.areaCode, i + 1]));

  // Generate OG images for public place pages
  const publicAreas = getPublicPlaceAreas();
  const placePaths = publicAreas.map((area) => ({
    params: { slug: `places/${slugifyAreaName(area.areaName)}` },
    props: {
      title: area.areaName,
      stat: area.supportedAsylum.toLocaleString(),
      statLabel: `On asylum support. Rank ${rankMap.get(area.areaCode) ?? "?"} of ${localRouteLatest.areas.length}, ${area.supportedAsylumRate?.toFixed(1) ?? "?"} per 10,000`,
      verdict: (area.supportedAsylumRate ?? 0) > 30 ? "critical" : (area.supportedAsylumRate ?? 0) > 10 ? "alert" : "info"
    }
  }));

  return [
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
    ...placePaths
  ];
};

export const GET: APIRoute = async ({ props }) => {
  ensureFonts();

  const { title, stat, statLabel, verdict } = props as {
    title: string;
    stat: string;
    statLabel: string;
    verdict: string;
  };

  const statColor = verdictColor[verdict] ?? COLORS.accent;

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: `${OG_WIDTH}px`,
          height: `${OG_HEIGHT}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 70px",
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
                  props: { src: MARK_URI, width: 40, height: 40 }
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
                            fontSize: "18px",
                            color: COLORS.text
                          },
                          children: "asylumstats"
                        }
                      },
                      {
                        type: "span",
                        props: {
                          style: {
                            fontSize: "11px",
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
                gap: "20px",
                flex: 1,
                justifyContent: "center"
              },
              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      fontFamily: "Source Serif 4",
                      fontSize: "96px",
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
                      fontSize: "14px",
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
                      fontSize: "36px",
                      fontWeight: 600,
                      color: COLORS.text,
                      lineHeight: 1.15,
                      maxWidth: "900px"
                    },
                    children: title
                  }
                }
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
                      fontSize: "14px",
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
                      fontSize: "12px",
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
      width: OG_WIDTH,
      height: OG_HEIGHT,
      fonts: [
        { name: "Source Sans 3", data: sansRegular!, weight: 400, style: "normal" },
        { name: "Source Sans 3", data: sansSemiBold!, weight: 600, style: "normal" },
        { name: "Source Serif 4", data: displaySemiBold!, weight: 600, style: "normal" }
      ]
    }
  );

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: OG_WIDTH } });
  const png = Buffer.from(resvg.render().asPng());

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400"
    }
  });
};
