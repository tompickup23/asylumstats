import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  areasBelowFiftyBy,
  nationalWhiteBritishShare,
  distinctAreaCodes,
  RETIRED_AREA_CODES,
} from "../src/lib/ethnic-projections";
import rawProjections from "../src/data/live/ethnic-projections.json";
import validation from "../src/data/live/out-of-sample-validation.json";

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
 */

describe("the model's own accuracy figures come from the validation file", () => {
  it("publishes the MAE the out-of-sample run actually measured", () => {
    const mae = validation.summary.white_british.mae;
    expect(mae.toFixed(2)).toBe("1.56");
    expect(validation.summary.white_british.bias.toFixed(2)).toBe("0.05");
    expect(validation.areasScored).toBe(285);
  });

  it("publishes the settings the out-of-sample run actually used", () => {
    expect(validation.settings.SHRINK_K).toBe(25);
    expect(validation.settings.CCR_CEILING).toBe(1.65);
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
  it("drops the retired duplicate codes", () => {
    // Barnsley and Sheffield each appear twice. Sheffield falls below 50% under
    // both codes, so counting raw keys publishes 87 areas where the truth is 86.
    expect(Object.keys(rawProjections.areas)).toHaveLength(320);
    expect(distinctAreaCodes()).toHaveLength(318);
    expect(RETIRED_AREA_CODES.has("E08000019")).toBe(true);
  });
});

describe("the published counts reproduce from the projection file", () => {
  it("puts 86 authorities below 50% by 2051, 59 of them majority today", () => {
    const { total, majorityToday } = areasBelowFiftyBy(2051);
    expect(total).toBe(86);
    expect(majorityToday).toBe(59);
  });

  it("puts 67 below 50% by 2041", () => {
    expect(areasBelowFiftyBy(2041).total).toBe(67);
  });

  it("applies the plausibility guard to the count", () => {
    // Six London boroughs have a withheld 2051 projection. Their place pages do
    // not show it, so no aggregate may count it: without the guard this is 92.
    const withheld = ["E09000010", "E09000003", "E09000014", "E09000022", "E09000019", "E09000012"];
    const naive = distinctAreaCodes().filter((code) => {
      const share = (rawProjections.areas as any)[code]?.projections?.["2051"]?.white_british;
      return share != null && share < 50;
    });
    expect(naive.length).toBe(92);
    for (const code of withheld) expect(naive).toContain(code);
  });

  it("weights the national share to 74.4% in 2021 and 55.0% by 2051", () => {
    expect(nationalWhiteBritishShare(2021)!.pct.toFixed(1)).toBe("74.4");
    expect(nationalWhiteBritishShare(2051)!.pct.toFixed(1)).toBe("55.1");
    // The finding truncates to one decimal, as the sister site does, so it reads
    // 55.0. Assert the underlying value rather than the rendering convention.
    expect(nationalWhiteBritishShare(2051)!.pct).toBeGreaterThan(55.0);
    expect(nationalWhiteBritishShare(2051)!.pct).toBeLessThan(55.1);
  });

  it("reports a 2061 figure on a smaller area set, so never alongside the others", () => {
    expect(nationalWhiteBritishShare(2061)!.areas).toBeLessThan(
      nationalWhiteBritishShare(2051)!.areas
    );
  });
});

describe("the same metric reads the same on every page that prints it", () => {
  const finding = read("src/content/findings/109-areas-minority-wbi-2051.md");
  const teaser = read("src/components/SisterSiteTeaser.astro");
  const methodology = read("src/pages/methodology.astro");

  it("agrees on the 2051 count", () => {
    const { total } = areasBelowFiftyBy(2051);
    expect(finding).toContain(`${total} local authorities projected minority White British by 2051`);
    expect(finding).toContain(`stat_value: "${total}"`);
  });

  it("agrees on the national share", () => {
    expect(finding).toContain("74.4% in 2021");
    expect(teaser).toContain("74.4 &rarr; 55.0%");
  });

  it("agrees on the area count", () => {
    const n = distinctAreaCodes().length;
    expect(finding).toContain(`${n} distinct local authorities`);
    expect(teaser).toContain(`${n} local authorities`);
    expect(methodology).toContain(`${n} local authorities`);
  });

  it("agrees on the accuracy figure", () => {
    for (const [name, page] of [["teaser", teaser], ["methodology", methodology]] as const) {
      expect(page, name).toContain("1.56pp");
    }
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
    "src/content/findings/109-areas-minority-wbi-2051.md",
    "src/data/mock/releases.json",
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
