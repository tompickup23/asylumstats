import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fertility from "../src/data/live/fertility-rates.json";

/**
 * A birth count is not a birth rate.
 *
 * This page was headlined "Women in the most deprived areas have 66% more births"
 * off 144,522 births against 87,216, and gave 1.66x as a fertility ratio. ONS
 * Table 8 publishes births by IMD decile and no denominator, so there is no count
 * of women aged 15-44 per decile to divide by, and deprived deciles have younger
 * age structures. An unknown share of the gradient is therefore age composition
 * rather than fertility.
 *
 * The site already enforces this rule elsewhere: the methodology forbids reading
 * an end-of-period asylum support count as throughput. This is the same error on
 * the demographic side, and it went out as a causal headline.
 *
 * So this asserts the denominator is still absent, and that no surface converts
 * the count ratio back into a rate claim while it is.
 */
const finding = readFileSync(
  join(process.cwd(), "src/content/findings/fertility-deprivation-gradient.md"),
  "utf8"
);

describe("the deprivation gradient is published as what it is", () => {
  it("still has no denominator, which is why the rate claim cannot return", () => {
    const gradient = fertility.deprivationGradient as Record<string, unknown>;
    expect(gradient.denominator).toBeNull();
    // If a women-15-44-by-decile count is ever obtained, this fails on purpose:
    // the rate becomes computable and the article should state it.
    for (const decile of Object.values(fertility.fertilityByIMD as Record<string, object>)) {
      expect(Object.keys(decile).sort()).toEqual(["births", "decile", "pctOfBirths"]);
    }
  });

  it("names the ratio a birth count ratio, not a fertility ratio", () => {
    const gradient = fertility.deprivationGradient as Record<string, unknown>;
    expect(gradient).toHaveProperty("birthCountRatio");
    expect(gradient).not.toHaveProperty("ratio");
    expect(String(gradient.insight)).toContain("not a fertility rate");
  });

  it("reproduces the published shares from the birth counts", () => {
    const byImd = fertility.fertilityByIMD as Record<string, { births: number; decile: number }>;
    const deciles = Object.values(byImd);
    const total = deciles.reduce((sum, d) => sum + d.births, 0);
    const quintile = (wanted: number[]) =>
      deciles.filter((d) => wanted.includes(d.decile)).reduce((sum, d) => sum + d.births, 0);

    const mostDeprived = quintile([1, 2]);
    const leastDeprived = quintile([9, 10]);
    expect(mostDeprived).toBe(144_522);
    expect(leastDeprived).toBe(87_216);
    expect(((mostDeprived / total) * 100).toFixed(1)).toBe("25.5");
    expect(((leastDeprived / total) * 100).toFixed(1)).toBe("15.4");
    expect(finding).toContain("25.5%");
    expect(finding).toContain("15.4%");
  });

  /**
   * Scanned with the correction notice removed. A dated retraction has to be able
   * to quote what it retracts, and a guard that banned the words everywhere would
   * delete the correction along with the claim, which is how a withdrawal quietly
   * becomes a deletion. The same exemption exists for the withdrawn model figures
   * in published-projection-figures.test.ts.
   */
  const body = finding.replace(/^> .*$/gm, "");

  it("keeps a dated correction that says what it withdrew", () => {
    expect(finding).toMatch(/> \*\*Correction, 7 September 2026\.\*\*/);
    expect(finding).toMatch(/poverty drives fertility/i);
  });

  it("makes no rate or causal claim from the gradient", () => {
    const banned: Array<[RegExp, string]> = [
      [/poverty drives fertility/i, "the causal headline"],
      [/women in the (most|poorest) deprived[^.]*(more births|66%)/i, "the rate claim"],
      [/have (66%|two-thirds) more births/i, "the rate claim, restated"],
      [/deprivation[- ]fertility ratio/i, "a fertility ratio label on a count ratio"],
    ];
    const offenders = banned.filter(([re]) => re.test(body)).map(([, label]) => label);
    expect(offenders).toEqual([]);
  });

  it("keeps the confounding argument, which the data does support", () => {
    expect(finding).toMatch(/confound/i);
    expect(finding).toContain("2.52");
    expect(finding).toContain("1.31");
  });

  it("says out loud that the denominator is missing", () => {
    expect(finding).toMatch(/no count of women aged 15-44 per decile/i);
  });
});
