import type { APIRoute, GetStaticPaths } from "astro";
import satori from "satori";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { getCollection } from "astro:content";
import { loadRouteDashboard } from "../../lib/route-data";

// Brand colors from brand_system.py
const COLORS = {
  bg: "#04070d",
  surface: "#0b1220",
  accent: "#06b6d4",
  accentLight: "#7dd3fc",
  text: "#f5f7fb",
  muted: "#91a7c4",
  alert: "#f59e0b",
  critical: "#ef4444",
  resolved: "#10b981"
};

const verdictColor: Record<string, string> = {
  alert: COLORS.alert,
  critical: COLORS.critical,
  resolved: COLORS.resolved,
  info: COLORS.accent
};

// Load TTF fonts (Satori requires TTF/OTF, not woff2)
let manropeBold: ArrayBuffer | null = null;
let soraBold: ArrayBuffer | null = null;

function loadFont(name: string): ArrayBuffer {
  const fontDir = new URL("../../assets/fonts/", import.meta.url);
  const target = name === "Manrope"
    ? new URL("Manrope-Bold.ttf", fontDir)
    : new URL("Sora-ExtraBold.ttf", fontDir);
  return readFileSync(target).buffer as ArrayBuffer;
}

function ensureFonts() {
  if (!manropeBold) manropeBold = loadFont("Manrope");
  if (!soraBold) soraBold = loadFont("Sora");
}

export const getStaticPaths: GetStaticPaths = async () => {
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

  return [
    {
      params: { slug: "home" },
      props: {
        title: "Follow YOUR money",
        stat: `${latestQuarter.supportedAsylum.toLocaleString()}`,
        statLabel: "On asylum support",
        verdict: "info"
      }
    },
    {
      params: { slug: "routes" },
      props: {
        title: "How they get here — route analysis",
        stat: `${(routeDashboard.nationalCards[0]?.value ?? 0).toLocaleString()}`,
        statLabel: "Small boat arrivals",
        verdict: "alert"
      }
    },
    ...findingPaths
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
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 70px",
          background: `linear-gradient(135deg, ${COLORS.bg} 0%, ${COLORS.surface} 100%)`,
          fontFamily: "Manrope"
        },
        children: [
          // Top: Logo area
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
                  type: "div",
                  props: {
                    style: {
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: COLORS.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: COLORS.bg,
                      fontFamily: "Sora",
                      fontWeight: 800,
                      fontSize: "18px"
                    },
                    children: "AS"
                  }
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
                            fontFamily: "Sora",
                            fontWeight: 700,
                            fontSize: "16px",
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
                          children: "Follow YOUR money"
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          // Middle: Content
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
                      fontFamily: "Sora",
                      fontSize: "56px",
                      fontWeight: 800,
                      color: statColor,
                      lineHeight: 1
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
                      fontFamily: "Sora",
                      fontSize: "32px",
                      fontWeight: 700,
                      color: COLORS.text,
                      lineHeight: 1.2,
                      maxWidth: "900px"
                    },
                    children: title
                  }
                }
              ]
            }
          },
          // Bottom: Accent bar
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
      width: 1200,
      height: 630,
      fonts: [
        { name: "Manrope", data: manropeBold!, weight: 700, style: "normal" },
        { name: "Sora", data: soraBold!, weight: 800, style: "normal" }
      ]
    }
  );

  const png = await sharp(Buffer.from(svg)).png({ quality: 90 }).toBuffer();

  return new Response(png as unknown as BodyInit, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400"
    }
  });
};
