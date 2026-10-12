import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crime from "../src/data/live/crime-dashboard.json";
import asc from "../src/data/live/asc-dashboard.json";
import send from "../src/data/live/send-dashboard.json";
import localRouteLatest from "../src/data/live/local-route-latest.json";
import { computePressureScore } from "../src/lib/pressure-index";

/**
 * The Blackpool finding's table against the synced crime, social care and SEND files
 * and the Home Office local authority data. Each figure and rank is read out of the
 * table row and recomputed, so a refresh fails here, naming the row, until the prose
 * moves with it. No release figure is typed in this file.
 */

const md = readFileSync(join(process.cwd(), "src/content/findings/blackpool-worst-every-metric.md"), "utf8");
const BLACKPOOL = "E06000009";

const row = (label: string): string[] => {
  const line = md.split("\n").find((l) => l.startsWith(`| ${label}`));
  if (!line) throw new Error(`row "${label}" not found in the Blackpool table`);
  return line.split("|").slice(1, -1).map((c) => c.trim());
};

const ordinalNumber = (s: string) => Number(/^(\d+)(st|nd|rd|th) of ([\d,]+)/.exec(s)![1]);
const ofCount = (s: string) => Number(/ of ([\d,]+)/.exec(s)![1].replace(/,/g, ""));

/** Rank (1 = highest) of `code` among non-null values, and the count of values. */
function rankOf(values: Record<string, number | null | undefined>, code: string) {
  const own = values[code]!;
  const all = Object.values(values).filter((v): v is number => v != null);
  return { rank: all.filter((v) => v > own).length + 1, of: all.length };
}

const pick = <T,>(areas: Record<string, T>, f: (a: T) => number | null) =>
  Object.fromEntries(Object.entries(areas).map(([k, a]) => [k, f(a)]));

describe("Blackpool finding", () => {
  it("quotes recorded crime and its rank from the crime file", () => {
    const [, value, rank] = row("Police recorded crime");
    const areas = (crime as any).areas as Record<string, any>;
    expect(value).toBe(areas[BLACKPOOL].totalCrimeRate.toFixed(1));
    const r = rankOf(pick(areas, (a) => a.totalCrimeRate), BLACKPOOL);
    expect([ordinalNumber(rank), ofCount(rank)]).toEqual([r.rank, r.of]);
  });

  it("quotes social care spend per adult, its rank and England from the social care file", () => {
    const [, value, rank, england] = row("Adult social care");
    const areas = (asc as any).areas as Record<string, any>;
    expect(value).toBe(`£${areas[BLACKPOOL].grossSpendPerCapita}`);
    expect(england).toBe(`£${(asc as any).england.grossSpendPerCapita}`);
    const r = rankOf(pick(areas, (a) => a.grossSpendPerCapita), BLACKPOOL);
    expect([ordinalNumber(rank), ofCount(rank)]).toEqual([r.rank, r.of]);
  });

  it("quotes SEND growth, its rank and England from the SEND file", () => {
    const [, value, rank, england] = row("Growth in pupils with an EHC plan");
    const areas = (send as any).areas as Record<string, any>;
    expect(value).toBe(`+${areas[BLACKPOOL].fiveYearGrowthPct.toFixed(1)}%`);
    expect(england).toBe(`+${(send as any).england.fiveYearGrowthPct.toFixed(1)}%`);
    const r = rankOf(pick(areas, (a) => a.fiveYearGrowthPct), BLACKPOOL);
    expect([ordinalNumber(rank), ofCount(rank)]).toEqual([r.rank, r.of]);
  });

  it("quotes the asylum support rate and rank from the Home Office data", () => {
    const [, value, rank] = row("People on asylum support");
    const areas = (localRouteLatest as any).areas as Array<{ areaCode: string; supportedAsylumRate: number | null }>;
    const rates = Object.fromEntries(areas.map((a) => [a.areaCode, a.supportedAsylumRate ?? 0]));
    // Half-up to one decimal, as the place pages print it (16.45 reads 16.5).
    expect(Number(value)).toBe(Math.round(rates[BLACKPOOL] * 10) / 10);
    const r = rankOf(rates, BLACKPOOL);
    expect([ordinalNumber(rank), ofCount(rank)]).toEqual([r.rank, r.of]);
  });

  it("quotes the composite score and rank from the pressure index", () => {
    const m = /Blackpool scores ([\d.]+) and ranks (\d+)(?:st|nd|rd|th) of the ([\d,]+) English authorities/.exec(md.replace(/\s+/g, " "));
    expect(m).not.toBeNull();
    const areas = (localRouteLatest as any).areas as Array<{ areaCode: string; areaName: string; supportedAsylumRate: number | null }>;
    const all = areas.map((a) => a.supportedAsylumRate ?? 0);
    const ranked = areas
      .map((a) => computePressureScore(a.areaCode, a.areaName, a.supportedAsylumRate, all))
      .filter((s) => s.availableModules === 5)
      .sort((a, b) => b.compositeScore - a.compositeScore || a.areaName.localeCompare(b.areaName));
    const i = ranked.findIndex((s) => s.areaCode === BLACKPOOL);
    expect(Number(m![1])).toBe(ranked[i].compositeScore);
    expect(Number(m![2])).toBe(i + 1);
    expect(Number(m![3])).toBe(ranked.length);
  });
});
