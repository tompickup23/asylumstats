import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computePressureScore } from "../src/lib/pressure-index";
import localRouteLatest from "../src/data/live/local-route-latest.json";

/**
 * The published pressure-index table must equal what the code computes.
 *
 * This finding prints a seven-row league table by hand in markdown, and the place pages
 * compute the same scores from live data. On 31 August 2026 the two had been apart for
 * months: the card still named Blackpool, Preston and Blackburn as the top three from
 * the December 2025 asylum release, while the site's own computation had moved Preston
 * to seventh. Nothing failed, because nothing compared them.
 *
 * The guard has to be able to fire, so it asserts the numbers rather than the shape:
 * change one score in the markdown, or refresh any of the five source datasets, and this
 * goes red with the row that disagrees.
 */

interface Row {
  rank: number;
  name: string;
  score: number;
}

const CARD = resolve(
  __dirname,
  "../src/content/findings/combined-pressure-top-councils.md"
);

function publishedRows(): Row[] {
  const md = readFileSync(CARD, "utf8");
  const rows: Row[] = [];
  for (const line of md.split("\n")) {
    const m = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([\d.]+)\s*\|/.exec(line);
    if (m) rows.push({ rank: Number(m[1]), name: m[2], score: Number(m[3]) });
  }
  return rows;
}

/**
 * Ranked over the authorities holding all five domains. Until 12 October 2026 this
 * ranked the 25 areas in a hand-typed crime file; the crime, SEND and social care
 * domains now come from published national files, and an area scoring on fewer
 * domains (Wales, Scotland, Northern Ireland) is not comparable with one scoring on
 * all five.
 */
function computedRanking() {
  const areas = localRouteLatest.areas as Array<{ areaCode: string; areaName: string; supportedAsylumRate: number | null }>;
  const allAsylumRates = areas.map((a) => a.supportedAsylumRate ?? 0);
  return areas
    .map((a) => computePressureScore(a.areaCode, a.areaName, a.supportedAsylumRate, allAsylumRates))
    .filter((s) => s.availableModules === 5)
    .sort((a, b) => b.compositeScore - a.compositeScore || a.areaName.localeCompare(b.areaName))
    .map((a, i) => ({ rank: i + 1, name: a.areaName, score: a.compositeScore }));
}

describe("the published pressure index matches the computed one", () => {
  it("parses a table out of the card, so the assertions below are real", () => {
    expect(publishedRows().length).toBeGreaterThanOrEqual(7);
  });

  it("names the same councils in the same order, with the same scores", () => {
    const computed = computedRanking();
    for (const row of publishedRows()) {
      const actual = computed[row.rank - 1];
      expect(
        { rank: row.rank, name: actual.name, score: actual.score },
        `row ${row.rank} of the published table disagrees with the computed index`
      ).toEqual({ rank: row.rank, name: row.name, score: row.score });
    }
  });

  it("fires when a score moves, which is the case it exists for", () => {
    const computed = computedRanking();
    const tampered = computed.map((r, i) => (i === 0 ? { ...r, score: r.score + 1 } : r));
    expect(tampered[0].score).not.toEqual(computed[0].score);
  });
});
