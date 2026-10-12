import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  areasBelowFiftyBy,
  nationalWhiteBritishShare,
  distinctAreaCodes,
  RETIRED_AREA_CODES,
  whiteBritishCrossingRange,
  nationalGroupShare,
} from "../src/lib/ethnic-projections";
import { plausibleThrough } from "../src/lib/projection-plausibility";
import rawProjections from "../src/data/live/ethnic-projections.json";
import validation from "../src/data/live/out-of-sample-validation.json";
import censusManifest from "../data/raw/manifests/census_ethnic_groups.json";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * The failure this file exists to stop.
 *
 * asylumstats published MAE 1.71pp, 109 areas and a NEWETHPOP head-to-head of
 * 2.58pp for eight days after the sister site had withdrawn all three, because
 * the two sites run the same model from the same file and only one of them was
 * corrected. The digits were then swept and the sweep passed while a numberless
 * prose caveat carrying the same withdrawn finding sat on a thousand pages.
 *
 * So this file checks three separate things, because each one has been the hole
 * the last time:
 *   1. every figure the site publishes about this model reproduces from the data
 *   2. the same metric carries the same value on every page that prints it
 *   3. the withdrawn CLAIM cannot come back, in words as well as in digits
 *
 * No figure from one model run is typed into the checks for 1 and 2. Each one
 * compares a number printed on a page against the data file or the helper the
 * page prints from, or compares two derivations of the same quantity. A model
 * re-run therefore passes if the prose moves with it, and fails, naming the
 * sentence, if it does not. Before 12 October 2026 this file asserted 74.4, 55.1,
 * 86, 59, 67, 92, 93, 318, 269, 1.56, 0.05 and 285 directly, so every re-run
 * failed CI by design. Withdrawn and superseded figures (section 3) stay as
 * literals: they are history, and the check is that they do not come back.
 */

const areas = rawProjections.areas as Record<string, any>;
const wb = (code: string, year: number) => areas[code]?.projections?.[String(year)]?.white_british;
const publishable = (code: string, year: number) => {
  const through = plausibleThrough(areas[code]);
  return wb(code, year) != null && through != null && through >= year;
};

/** Prose with markdown emphasis, tags, entities and line wrapping taken out. Dated
 * correction notices (blockquotes) are left out: they record what was true on
 * their date and must not move with the data. */
const prose = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&rarr;/g, "->")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ");

/** Every capture of `re` in `text`, failing loudly if the sentence has gone. */
const grab = (text: string, re: RegExp, label: string): string[] => {
  const m = text.match(re);
  if (!m) throw new Error(`${label}: sentence not found (${re}). Update this test with the prose.`);
  return m.slice(1);
};

/**
 * A share printed to one decimal. The finding and the teaser truncate (55.06
 * reads 55.0) where the homepage rounds (55.1), so either reading of the same
 * value is accepted, and nothing further from it than that.
 */
const oneDecimal = (pct: number) =>
  new Set([(Math.trunc(pct * 10) / 10).toFixed(1), pct.toFixed(1)]);

describe("the model's own accuracy figures come from the validation file", () => {
  it("holds a summary consistent with the run it describes", () => {
    const s = validation.summary.white_british;
    expect(s.n).toBe(validation.areasScored);
    expect(s.overPredict + s.underPredict).toBeLessThanOrEqual(s.n);
    expect(s.mae).toBeGreaterThan(0);
    // A mean absolute error can never be smaller than the size of the mean error.
    expect(s.mae).toBeGreaterThanOrEqual(Math.abs(s.bias));
    expect(s.p10).toBeLessThanOrEqual(s.median);
    expect(s.median).toBeLessThanOrEqual(s.p90);
  });

  it("describes the fit it ran, not a different one", () => {
    // The first copy of this file described a six-group fit while running at
    // GROUPING=detailed. The numbers were the detailed fit's; only the prose lied.
    if (validation.grouping === "detailed") {
      expect(validation.design).not.toMatch(/^(?!.*16 groups).*Six broad groups/);
    }
  });
});

describe("the area count is the distinct authorities, not the raw keys", () => {
  it("drops the retired duplicate codes and nothing else", () => {
    // Barnsley and Sheffield each appear twice. Sheffield falls below 50% under
    // both codes, so counting raw keys published 87 areas where the truth was 86.
    const raw = Object.keys(areas);
    const distinct = distinctAreaCodes();
    const retiredPresent = raw.filter((c) => RETIRED_AREA_CODES.has(c));
    expect(distinct.length).toBe(raw.length - retiredPresent.length);
    for (const code of distinct) expect(RETIRED_AREA_CODES.has(code), code).toBe(false);
    expect(new Set(distinct).size).toBe(distinct.length);
    expect(RETIRED_AREA_CODES.has("E08000019")).toBe(true);
  });
});

describe("the published counts reproduce from the projection file", () => {
  it("counts the distinct authorities below 50%, guarded, by a direct scan", () => {
    for (const year of [2031, 2041, 2051, 2061]) {
      const scored = distinctAreaCodes().filter((c) => wb(c, year) != null);
      const below = scored.filter((c) => wb(c, year) < 50);
      const guarded = below.filter((c) => publishable(c, year));
      const today = guarded.filter((c) => (areas[c].current?.groups?.white_british ?? 0) >= 50);
      const result = areasBelowFiftyBy(year);
      expect(result.areasScored, String(year)).toBe(scored.length);
      expect(result.beforeGuard, String(year)).toBe(below.length);
      expect(result.total, String(year)).toBe(guarded.length);
      expect(result.majorityToday, String(year)).toBe(today.length);
    }
  });

  it("applies the plausibility guard to the count", () => {
    // Some areas have a withheld 2051 projection. Their place pages do not show
    // it, so no aggregate may count it.
    const at2051 = areasBelowFiftyBy(2051);
    const withheld = distinctAreaCodes().filter((c) => wb(c, 2051) != null && wb(c, 2051) < 50 && !publishable(c, 2051));
    expect(withheld.length).toBeGreaterThan(0);
    expect(at2051.withheld).toBe(withheld.length);
    expect(at2051.total).toBe(at2051.beforeGuard - withheld.length);
  });

  it("weights the national share by population, by a direct scan", () => {
    // Projected years weight each area's share by its 2021 population, across
    // every distinct area that has the year, guarded or not (see the helper).
    for (const year of [2031, 2041, 2051]) {
      let num = 0;
      let den = 0;
      for (const code of distinctAreaCodes()) {
        const pop = areas[code].current?.total_population ?? 0;
        if (!pop || wb(code, year) == null) continue;
        num += wb(code, year) * pop;
        den += pop;
      }
      expect(nationalWhiteBritishShare(year)!.pct, String(year)).toBeCloseTo(num / den, 9);
    }
  });

  /**
   * An observed year must reproduce as a plain sum of its own people, because that is what
   * the homepage calls it: "2011 Census". The first version of nationalWhiteBritishShare
   * weighted the 2011 shares by 2021 populations and shipped 80.0% under that label. The
   * second summed the area records' 2011 baselines, which counted the eleven authorities
   * created after 2011 at their 2021 Census and published 80.2%. Census 2011 KS201EW gives
   * 80.5% for England and Wales, so 2011 now comes from its England and Wales totals.
   */
  it("takes 2011 from the KS201EW England and Wales totals, every group", () => {
    const ew = (censusManifest as any).englandAndWales["2011"];
    for (const g of ["white_british", "white_other", "asian", "black", "mixed", "other"] as const) {
      expect(nationalGroupShare(g, 2011)!.pct.toFixed(3), g).toBe(((ew.groups[g] / ew.total) * 100).toFixed(3));
    }
    // Every local authority on 2011 boundaries, not the area records here.
    expect(nationalWhiteBritishShare(2011)!.areas).toBe(ew.areas);
    expect(ew.areas).toBeGreaterThan(distinctAreaCodes().length);
  });

  it("2021 summed from the area records is the TS021 England and Wales population", () => {
    const ew = (censusManifest as any).englandAndWales["2021"];
    expect(nationalWhiteBritishShare(2021)!.pct.toFixed(3)).toBe(((ew.groups.white_british / ew.total) * 100).toFixed(3));
  });

  it("weights an observed year by its own population, not by 2021's", () => {
    const sum = (year: number) => {
      let people = 0;
      let whiteBritish = 0;
      for (const code of distinctAreaCodes()) {
        const absolute =
          year === 2011 ? areas[code].baseline?.groups_absolute : areas[code].current?.groups_absolute;
        if (!absolute) continue;
        whiteBritish += absolute.white_british;
        people += Object.values(absolute).reduce((a: number, b: any) => a + Number(b), 0);
      }
      return (whiteBritish / people) * 100;
    };

    for (const year of [2021]) {
      expect(nationalWhiteBritishShare(year)!.pct.toFixed(2), String(year)).toBe(sum(year).toFixed(2));
    }
  });

  it("reports a 2061 figure on a smaller area set, so never alongside the others", () => {
    expect(nationalWhiteBritishShare(2061)!.areas).toBeLessThan(
      nationalWhiteBritishShare(2051)!.areas
    );
  });
});

describe("the same metric reads the same on every page that prints it", () => {
  const findingRaw = read("src/content/findings/86-areas-minority-wbi-2051.md");
  const front = findingRaw.split("---")[1];
  const finding = prose(findingRaw.split("---").slice(2).join("---"));
  const teaser = prose(read("src/components/SisterSiteTeaser.astro"));
  const methodology = prose(read("src/pages/methodology.astro"));
  const index = prose(read("src/pages/index.astro"));

  it("agrees on the 2051 count and its split, in the frontmatter", () => {
    const { total, majorityToday } = areasBelowFiftyBy(2051);
    const [stat] = grab(front, /stat_value: "(\d+)"/, "stat_value");
    const [headline] = grab(front, /headline: "(\d+) local authorities projected minority White British by 2051"/, "headline");
    const [summary, split] = grab(
      front, /summary: "(\d+) English local authorities[^"]*?(\d+) of those have a White British majority today/, "summary");
    const [seoTitle] = grab(front, /seo_title: "(\d+) councils projected minority/, "seo_title");
    const [seoDesc, seoSplit] = grab(
      front, /seo_description: "(\d+) English local authorities[^"]*?(\d+) of them have a White British majority today/, "seo_description");
    for (const [label, n] of [["stat_value", stat], ["headline", headline], ["summary", summary], ["seo_title", seoTitle], ["seo_description", seoDesc]]) {
      expect(Number(n), label).toBe(total);
    }
    expect(Number(split), "summary split").toBe(majorityToday);
    expect(Number(seoSplit), "seo split").toBe(majorityToday);
  });

  it("agrees on the counts by year and the split, in the finding's body", () => {
    const [by2041, by2051] = grab(finding, /(\d+) by 2041\. (\d+) by 2051\./, "counts by year");
    expect(Number(by2041), "2041").toBe(areasBelowFiftyBy(2041).total);
    expect(Number(by2051), "2051").toBe(areasBelowFiftyBy(2051).total);
    const [ofThe, have] = grab(finding, /Of the (\d+), (\d+) have a White British majority today/, "split");
    expect(Number(ofThe)).toBe(areasBelowFiftyBy(2051).total);
    expect(Number(have)).toBe(areasBelowFiftyBy(2051).majorityToday);
  });

  /**
   * The hole this block had. It checked the finding, the teaser and the
   * methodology, and /national/ was none of those. The commit that introduced
   * areasBelowFiftyBy was 146fde1, "carry the v8.0 recalibration through every
   * page that publishes it", and it missed this page: /national/ kept its own
   * inline filter from April and published 93 from 23 August while every checked
   * surface said 86. 93 is the count with neither correction applied. It counts
   * Sheffield under both its retired and its current code, and it counts the six
   * London boroughs whose projection the plausibility guard withholds.
   *
   * So this asserts the rule rather than the number. Any page that prints the
   * count must get it from the helper, because a page that derives it itself
   * will agree only until the model moves.
   */
  it("derives the count from the helper on every page that prints it", () => {
    const offenders: string[] = [];
    for (const file of ["src/pages/national.astro", "src/pages/index.astro"]) {
      const text = read(file);
      if (!/areasBelowFiftyBy/.test(text)) offenders.push(`${file}: does not use areasBelowFiftyBy`);
      // A second, hand-rolled filter on the same threshold is the bug itself.
      if (/projections\??\.\[?["']2051["']\]?\??\.white_british\s*<\s*50/.test(text)) {
        offenders.push(`${file}: filters on the raw 2051 projection instead of the helper`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("prints no unguarded or undeduplicated variant of the count", () => {
    // The three wrong counts, derived rather than typed: deduplicated but
    // unguarded, neither, and guarded but not deduplicated. None may appear
    // beside this claim on any page.
    const at2051 = areasBelowFiftyBy(2051);
    const allKeys = Object.keys(areas);
    const rawBelow = allKeys.filter((c) => wb(c, 2051) != null && wb(c, 2051) < 50);
    const retiredGuarded = rawBelow.filter((c) => RETIRED_AREA_CODES.has(c) && publishable(c, 2051)).length;
    const wrong = new Set([at2051.beforeGuard, rawBelow.length, at2051.total + retiredGuarded]);
    wrong.delete(at2051.total);
    expect(wrong.size).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const file of ["src/pages/national.astro", "src/pages/index.astro", "src/components/SisterSiteTeaser.astro"]) {
      const text = read(file);
      for (const n of wrong) {
        if (new RegExp(`\\b${n}\\s+(areas|local authorities|councils)`).test(text)) {
          offenders.push(`${file}: ${n}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("agrees on the national share", () => {
    const now = nationalWhiteBritishShare(2021)!.pct;
    const then = nationalWhiteBritishShare(2051)!.pct;
    const [f21, f51] = grab(finding, /the share is (\d+\.\d)% in 2021 and (\d+\.\d)% by 2051/, "finding national share");
    expect(oneDecimal(now).has(f21), `finding 2021 ${f21}`).toBe(true);
    expect(oneDecimal(then).has(f51), `finding 2051 ${f51}`).toBe(true);
    const [t21, t51] = grab(teaser, /(\d+\.\d) -> (\d+\.\d)%/, "teaser national share");
    expect(oneDecimal(now).has(t21), `teaser 2021 ${t21}`).toBe(true);
    expect(oneDecimal(then).has(t51), `teaser 2051 ${t51}`).toBe(true);
  });

  /**
   * The one this file missed the first time. The teaser carried the corrected stat
   * (74.4 -> 55.0%) beside a sparkline still plotting the v7.0 series from a hardcoded
   * array, plus an aria-label spelling all four old numbers out. Checking that the right
   * figure appears somewhere on a page does not establish that the wrong one is gone, so
   * this asserts the absence of the superseded values rather than the presence of the new.
   */
  it("carries no superseded national percentage in a rendered component", () => {
    const superseded = ["80.5", "73.3", "48.7", "40.2", "72.5", "50.5", "52.7"];
    const offenders: string[] = [];
    for (const file of ["src/components/SisterSiteTeaser.astro", "src/pages/index.astro"]) {
      const text = read(file);
      for (const value of superseded) {
        if (new RegExp(`${value.replace(".", "\\.")}\\s?%|pct: ${value.replace(".", "\\.")}`).test(text)) {
          offenders.push(`${file}: ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("derives the national trajectory rather than writing it in", () => {
    // Both surfaces must go through the helper, so a model change moves them.
    for (const file of ["src/components/SisterSiteTeaser.astro", "src/pages/index.astro"]) {
      expect(read(file), file).toContain("nationalWhiteBritishShare");
    }
  });

  it("agrees on the area count", () => {
    const n = distinctAreaCodes().length;
    expect(finding).toContain(`${n} distinct local authorities`);
    expect(teaser).toContain(`${n} local authorities`);
    expect(methodology).toContain(`${n} local authorities`);
  });

  it("agrees on the accuracy figures with the validation file", () => {
    const s = validation.summary.white_british;
    const mae = `${s.mae.toFixed(2)}pp`;
    const bias = `${s.bias >= 0 ? "+" : ""}${s.bias.toFixed(2)}`;
    for (const [name, page] of [["teaser", teaser], ["methodology", methodology], ["index", index], ["finding", finding]] as const) {
      expect(page, name).toContain(mae);
    }
    const [fMae, fBias, fAreas] = grab(finding, /\(MAE (\d\.\d\d)pp, bias ([+-]\d\.\d\d)pp across (\d+) areas\)/, "finding source line");
    expect(`${fMae}pp`).toBe(mae);
    expect(fBias).toBe(bias);
    expect(Number(fAreas)).toBe(validation.areasScored);
    const [fMean] = grab(finding, /mean error of ([+-]\d\.\d\d) percentage points/, "finding mean error");
    expect(fMean).toBe(bias);
    const [mMae, mBias, mAreas] = grab(
      methodology, /forecasting 2021: MAE (\d\.\d\d)pp on the White British share, bias ([+-]\d\.\d\d)pp, across (\d+) areas/,
      "methodology model summary");
    expect(`${mMae}pp`).toBe(mae);
    expect(mBias).toBe(bias);
    expect(Number(mAreas)).toBe(validation.areasScored);
  });

  it("agrees on the model settings with the validation file", () => {
    const { SHRINK_K, CCR_CEILING } = validation.settings;
    const [k, ceiling] = grab(methodology, /cell size \(K=(\d+)\) and capped at a growth ceiling of (\d+\.\d+) per decade/, "methodology settings");
    expect(Number(k)).toBe(SHRINK_K);
    expect(Number(ceiling)).toBe(CCR_CEILING);
    const [fCeiling] = grab(finding, /capped at (\d+\.\d+) growth per decade/, "finding ceiling");
    expect(Number(fCeiling)).toBe(CCR_CEILING);
  });
});

describe("the withdrawn claim cannot come back", () => {
  // Files where the withdrawn figures are legitimate: a dated retraction has to
  // be able to say what it is retracting, and a release note records a figure as
  // reported at the time.
  const RETRACTION_CONTEXTS = [
    "src/pages/methodology.astro",
    "src/content/findings/newethpop-validation-2021.md",
    // Its own correction notice has to be able to say it used to read 109.
    "src/content/findings/86-areas-minority-wbi-2051.md",
    "src/data/site/releases.json",
    "src/pages/releases.astro",
  ];

  /**
   * Not a published surface: this is the backcast run's own output file,
   * including its own measured MAE, consumed by the model scripts and imported
   * by no page. Rewriting it would misrepresent a run that did happen. The
   * exemption is only sound while nothing renders it, which the next test checks.
   */
  const RUN_ARTEFACTS = ["src/data/live/model-validation.json"];

  const contentFiles = () => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of require("node:fs").readdirSync(join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.(astro|md|ts|json)$/.test(entry.name)) out.push(rel);
      }
    };
    walk("src");
    return out.filter((f) => !RETRACTION_CONTEXTS.includes(f) && !RUN_ARTEFACTS.includes(f));
  };

  it("carries no withdrawn accuracy figure outside a retraction", () => {
    const offenders = contentFiles().filter((f) => /1\.71\s?pp|1\.72pp|2\.58pp/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("carries no withdrawn count outside a retraction", () => {
    const offenders = contentFiles().filter((f) =>
      /109 (local authorities|areas)|269 areas|278 (local authorities|areas)/.test(read(f))
    );
    expect(offenders).toEqual([]);
  });

  /**
   * The one that actually caught something. Sweeping digits cleared every page
   * while "a known bias toward overstating the White British share" stayed live,
   * which is the withdrawn backcast's direction with the number taken out. The
   * measured bias is +0.05pp and the methodology page calls the forecast close to
   * unbiased, so the caveat contradicted the page it linked to.
   */
  it("carries no withdrawn claim in words", () => {
    const patterns: Array<[RegExp, string]> = [
      [/bias toward (over|under)stating the White British/i, "the withdrawn bias direction"],
      [/beats NEWETHPOP|33 ?(%|per cent) more accurate/i, "the withdrawn head-to-head"],
      [/most accurate .{0,40}projection model/i, "the withdrawn primacy claim"],
      [/model (understates|understating) the pace of change/i, "the reversed pace claim"],
    ];
    const offenders: string[] = [];
    for (const f of contentFiles()) {
      const text = read(f);
      for (const [re, label] of patterns) if (re.test(text)) offenders.push(`${f}: ${label}`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the run-artefact exemption honest", () => {
    // model-validation.json is exempt above only because no page renders it. If
    // a page ever imports it, the withdrawn 1.71pp inside it becomes published
    // and the exemption has to go with it.
    const importers = contentFiles()
      .concat(RETRACTION_CONTEXTS)
      .filter((f) => f.startsWith("src/pages") || f.startsWith("src/components") || f.startsWith("src/lib"))
      .filter((f) => read(f).includes("model-validation"));
    expect(importers).toEqual([]);
  });

  it("still lets the retraction say what it retracts", () => {
    // A guard that forbade these strings everywhere would delete the retraction
    // along with the claim, which is how a withdrawal quietly becomes a deletion.
    expect(read("src/pages/methodology.astro")).toContain("withdrawn");
    expect(read("src/content/findings/newethpop-validation-2021.md")).toContain("2.58pp");
  });
});

describe("a stated crossing year is borne out by the projection", () => {
  it("never names a decade at which the area is still above 50%", () => {
    const offenders: string[] = [];
    for (const code of distinctAreaCodes()) {
      const area = (rawProjections.areas as any)[code];
      const threshold = (area.thresholds ?? []).find(
        (t: any) => t.label === "White British <50%"
      );
      if (!threshold) continue;
      const decadal = area.projections?.[String(threshold.year)]?.white_british;
      if (decadal == null || decadal < 50) continue;
      // Three areas sit just the wrong side of the line because the crossing
      // year is interpolated between decades while the decadal value is not:
      // West Northamptonshire 50.28% at 2051, Bedford 50.34% and Welwyn Hatfield
      // 50.27% at 2041. That is the interpolation disagreeing with itself by a
      // third of a point, and it is why nothing on this site counts off
      // thresholds[]. A crossing year that misses by more than half a point is
      // not rounding, and must fail.
      if (decadal < 50.5) continue;
      offenders.push(`${area.areaName} crosses ${threshold.year} but is ${decadal}% that year`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the half-point tolerance honest", () => {
    // The tolerance above is only defensible while the areas using it are the
    // three known interpolation artefacts. A fourth means something has moved.
    const marginal: string[] = [];
    for (const code of distinctAreaCodes()) {
      const area = (rawProjections.areas as any)[code];
      const threshold = (area.thresholds ?? []).find((t: any) => t.label === "White British <50%");
      if (!threshold) continue;
      const decadal = area.projections?.[String(threshold.year)]?.white_british;
      if (decadal != null && decadal >= 50) marginal.push(area.areaName);
    }
    expect(marginal.sort()).toEqual(["Bedford", "Welwyn Hatfield", "West Northamptonshire"]);
  });
});

/**
 * A crossing year used to ship bare: "approximately 2027", "around 2050". It is
 * interpolated between two decadal projections and then divided by a slope, so it
 * is more fragile than either projection it comes from, and the methodology tells
 * readers to carry the model's error with every figure. A year with no interval
 * reads as a date rather than a projection, so the finding now states a range and
 * this pins that range to the derivation rather than to a typed-in pair of years.
 */
describe("a published crossing year carries its sensitivity range", () => {
  const lancashire = read("src/content/findings/blackburn-minority-wb-2027.md");
  const AREAS: Array<[string, string]> = [
    ["E06000008", "Blackburn with Darwen"],
    ["E07000122", "Pendle"],
    ["E07000123", "Preston"],
    ["E07000117", "Burnley"],
  ];

  it("reproduces the central year the article prints", () => {
    for (const [code, name] of AREAS) {
      const range = whiteBritishCrossingRange(code);
      expect(range, name).not.toBeNull();
      const stated = (rawProjections.areas as any)[code].thresholds?.find(
        (t: any) => t.label === "White British <50%"
      )?.year;
      expect(range!.central, name).toBe(stated);
    }
  });

  it("brackets the central year", () => {
    for (const [code, name] of AREAS) {
      const { central, earliest, latest } = whiteBritishCrossingRange(code)!;
      expect(earliest, name).toBeLessThanOrEqual(central);
      expect(latest, name).toBeGreaterThanOrEqual(central);
    }
  });

  it("widens with the horizon, because a later crossing compounds more", () => {
    const width = (code: string) => {
      const r = whiteBritishCrossingRange(code)!;
      return r.latest - r.earliest;
    };
    expect(width("E07000117")).toBeGreaterThan(width("E06000008"));
  });

  it("prints the derived range in the article, not a typed-in one", () => {
    for (const [code, name] of AREAS) {
      const { earliest, latest } = whiteBritishCrossingRange(code)!;
      const dash = `${earliest}-${latest}`;
      const prose = `a range of ${earliest} to ${latest}`;
      expect(
        lancashire.includes(dash) || lancashire.includes(prose),
        `${name}: article states neither "${dash}" nor "${prose}"`
      ).toBe(true);
    }
  });

  it("no longer offers a bare approximate year", () => {
    expect(lancashire).not.toMatch(/below 50% by approximately \d{4}/);
    expect(lancashire).not.toContain("About a year from minority status");
  });
});

/**
 * The count was not the only aggregate /national/ derived for itself. The
 * national ethnic trajectory chart summed over the raw key set, so it counted
 * Sheffield and Barnsley twice and plotted 74.5% for 2021 against the 74.4% the
 * finding and the teaser publish. Two duplicated authorities are 800,000 people
 * in 57 million, which is why it survived a correction sweep: too small to look
 * wrong, too visible to be right, and printed next to the other value.
 */
describe("a national aggregate is derived once, not per page", () => {
  it("aggregates over the distinct authorities, never the raw keys", () => {
    // The chart's 74.5% against everyone else's 74.4% was the raw keys: Sheffield
    // and Barnsley counted twice. The helper may cover fewer areas than the
    // distinct set (an area missing a year), never more.
    for (const year of [2021, 2051]) {
      expect(nationalGroupShare("white_british", year)!.areas, String(year)).toBeLessThanOrEqual(
        distinctAreaCodes().length
      );
    }
  });

  it("agrees with the White British wrapper on every published year", () => {
    for (const year of [2011, 2021, 2031, 2041, 2051]) {
      expect(nationalGroupShare("white_british", year)?.pct, String(year)).toBe(
        nationalWhiteBritishShare(year)?.pct
      );
    }
  });

  it("sums the plotted groups to a whole population, so no area is counted twice", () => {
    // The five plotted groups plus "other" are the whole of each area. If a page
    // aggregated over the raw keys these would still sum to 100, which is why
    // this checks the helper is used rather than checking the total.
    for (const year of [2021, 2051]) {
      const groups = ["white_british", "white_other", "asian", "black", "mixed", "other"] as const;
      const total = groups.reduce((sum, g) => sum + (nationalGroupShare(g, year)?.pct ?? 0), 0);
      expect(total, String(year)).toBeCloseTo(100, 1);
    }
  });

  it("leaves /national/ no way to aggregate the projection file itself", () => {
    const page = read("src/pages/national.astro");
    expect(page).not.toContain("ethnic-projections.json");
    expect(page).toContain("nationalGroupShare");
  });
});

/**
 * Relayed from the ukdemographics session, which runs the same model, and correct:
 * the 2061 aggregate carries a denominator the 2051 one does not.
 *
 * 49 authorities have no 2061 projection, so a 2061 count is taken over 269 where
 * 2051 is taken over 318, and the 49 are not a random 49. The homepage trajectory
 * chart already stopped at 2051 and said why in its own caption, and then the key
 * stats underneath printed 86 by 2051 next to 99 by 2061 as if they were a series.
 * The page stated the rule and broke it two elements later.
 *
 * The same session claimed 93 was "the most nearly correct figure on the estate".
 * That part is wrong and the test below says why: 93 double-counts Sheffield, which
 * no reading makes correct. What is right underneath it is that 86 is a lower bound
 * rather than the model's answer, because the guard only ever removes areas that are
 * below 50%. Both facts are now published rather than only the flattering one.
 */
describe("a count carries the denominator it was taken over", () => {
  it("scores 2061 over fewer authorities than 2051", () => {
    const scored = (year: number) => distinctAreaCodes().filter((c) => wb(c, year) != null).length;
    expect(areasBelowFiftyBy(2051).areasScored).toBe(scored(2051));
    expect(areasBelowFiftyBy(2061).areasScored).toBe(scored(2061));
    expect(areasBelowFiftyBy(2061).areasScored).toBeLessThan(areasBelowFiftyBy(2051).areasScored);
  });

  it("says so wherever both years are printed together", () => {
    const page = read("src/pages/index.astro");
    expect(page).toContain("areasScored");
    expect(page).toMatch(/Not comparable/i);
  });

  it("publishes the guard gap, because the guard only removes areas below 50%", () => {
    const at2051 = areasBelowFiftyBy(2051);
    expect(at2051.withheld).toBeGreaterThan(0);
    expect(at2051.total + at2051.withheld).toBe(at2051.beforeGuard);
    // A lower bound, never above the model's own count.
    expect(at2051.total).toBeLessThanOrEqual(at2051.beforeGuard);
    expect(read("src/pages/index.astro")).toContain("beforeGuard");
  });

  it("does not make the raw-key count defensible: it counts an authority twice", () => {
    // Sheffield falls below 50% under both its retired and its current code, so
    // the raw key count exceeds the deduplicated one by the retired codes below
    // 50%. Whatever view is taken of the guard, double-counting an authority is
    // not a view.
    const raw = Object.keys(areas).filter((c) => wb(c, 2051) != null && wb(c, 2051) < 50);
    const retiredBelow = raw.filter((c) => RETIRED_AREA_CODES.has(c)).length;
    expect(raw.length - areasBelowFiftyBy(2051).beforeGuard).toBe(retiredBelow);
  });
});
