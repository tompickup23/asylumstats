import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computePressureScore } from "../src/lib/pressure-index";
import { SYNCED_FILES } from "../scripts/sync/ukd-source.mjs";
import localRouteLatest from "../src/data/live/local-route-latest.json";

/**
 * Asylum Stats does not set police recorded crime beside asylum support (decision
 * of 12 October 2026, under the house rule against immigration-to-crime claims).
 * UK Demographics keeps crime in its own context. These checks fail if crime comes
 * back into the pressure index, the place pages, the sync, or the prose of the two
 * findings that used it as a pressure domain.
 */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Prose outside dated correction notices, which record what was published. */
const prose = (p: string) =>
  read(p).split("\n").filter((l) => !l.trimStart().startsWith(">")).join("\n");

describe("no crime domain beside asylum support", () => {
  it("leaves crime out of the pressure index", () => {
    const areas = (localRouteLatest as any).areas as Array<{ areaCode: string; areaName: string; supportedAsylumRate: number | null }>;
    const all = areas.map((a) => a.supportedAsylumRate ?? 0);
    for (const a of areas) {
      const s = computePressureScore(a.areaCode, a.areaName, a.supportedAsylumRate, all);
      expect(Object.keys(s.percentiles)).not.toContain("crime");
      expect(Object.keys(s.components)).not.toContain("crimeRate");
      expect(s.availableModules).toBeLessThanOrEqual(4);
    }
  });

  it("does not sync or hold a crime file", () => {
    expect(SYNCED_FILES.map((f: { key: string }) => f.key)).not.toContain("crime-dashboard");
    expect(existsSync(join(ROOT, "src/data/live/crime-dashboard.json"))).toBe(false);
    expect(existsSync(join(ROOT, "data/sync/ukd-crime-dashboard.json"))).toBe(false);
  });

  it("has no crime section on place pages", () => {
    const page = read("src/pages/places/[slug].astro");
    expect(page).not.toMatch(/crime-data|crime-profile|crimeRate/);
  });

  it("names no crime domain in the two pressure findings, outside their corrections", () => {
    for (const p of ["src/content/findings/combined-pressure-top-councils.md", "src/content/findings/blackpool-worst-every-metric.md"]) {
      expect(prose(p), p).not.toMatch(/\bcrime\b/i);
    }
  });
});
