import { describe, it, expect } from "vitest";
import {
  whiteBritishShareRange,
  whiteBritishCrossingRange,
  WHITE_BRITISH_MAE_PP,
  distinctAreaCodes
} from "../src/lib/ethnic-projections";
import { consistentBand } from "../src/lib/projection-consistency";
import projections from "../src/data/live/ethnic-projections.json";

/**
 * A projected share carries the model's measured error, and never two kinds of it.
 *
 * Crossing years have published a sensitivity band since August while the share point
 * estimates they are derived FROM did not, so a page could say Blackburn crosses 50%
 * between 2026 and 2028 and then print its 2051 share as a bare 24.6%. One of those reads
 * as a projection and the other as a measurement, and they came out of the same model.
 *
 * The band is a sensitivity band, not a confidence interval: it propagates the one-decade
 * out-of-sample error and nothing else, so at a thirty-year horizon it understates the true
 * uncertainty rather than bounding it. Say so wherever it is published.
 */
const areas = (projections as { areas: Record<string, any> }).areas;

describe("white British share range", () => {
  it("brackets the point estimate it is built from", () => {
    for (const code of distinctAreaCodes().slice(0, 80)) {
      const range = whiteBritishShareRange(code, 2051);
      if (!range) continue;
      expect(range.low, code).toBeLessThanOrEqual(range.central);
      expect(range.high, code).toBeGreaterThanOrEqual(range.central);
    }
  });

  it("never leaves the 0-100 range a percentage lives in", () => {
    for (const code of distinctAreaCodes()) {
      const range = whiteBritishShareRange(code, 2051);
      if (!range) continue;
      expect(range.low, code).toBeGreaterThanOrEqual(0);
      expect(range.high, code).toBeLessThanOrEqual(100);
    }
  });

  it("widens with the horizon, because the error compounds", () => {
    const code = distinctAreaCodes().find(
      (c) => areas[c]?.projections?.["2031"] && areas[c]?.projections?.["2051"]
    )!;
    const near = whiteBritishShareRange(code, 2031)!;
    const far = whiteBritishShareRange(code, 2051)!;
    expect(far.high - far.low).toBeGreaterThan(near.high - near.low);
  });

  it("uses the measured error rather than a chosen one", () => {
    // One decade out, the half-width is exactly the measured MAE. If someone swaps in a
    // rounder number this fails rather than quietly widening every published range.
    const code = distinctAreaCodes().find((c) => areas[c]?.projections?.["2031"])!;
    const range = whiteBritishShareRange(code, 2031)!;
    expect(range.high - range.central).toBeCloseTo(WHITE_BRITISH_MAE_PP, 5);
  });

  it("returns nothing where the model has no projection", () => {
    // Scotland and Northern Ireland are outside the model. A range there would be invented.
    expect(whiteBritishShareRange("S12000049", 2051)).toBeNull();
  });

  it("is available wherever the stochastic interval is withheld", () => {
    // The two are alternatives, never companions: the place page shows the 80% interval
    // where it is coherent and this where it is not, so every projected area carries
    // exactly one. This checks the fallback can actually cover the gap.
    const withheld = distinctAreaCodes().filter((code) => {
      const estimate = areas[code]?.projections?.["2051"]?.white_british;
      if (estimate == null) return false;
      return consistentBand(estimate, areas[code]?.stochastic?.["2051"]?.wbi ?? null) === null;
    });
    expect(withheld.length).toBeGreaterThan(0);
    const uncovered = withheld.filter((code) => whiteBritishShareRange(code, 2051) === null);
    expect(uncovered, "no interval of either kind on these").toEqual([]);
  });

  it("agrees with the crossing band, which uses the same measured error", () => {
    // Both derive from WHITE_BRITISH_MAE_PP widened by sqrt(decades). If they ever diverge,
    // one page's range stops meaning what another page's range means.
    const code = distinctAreaCodes().find((c) => whiteBritishCrossingRange(c))!;
    const crossing = whiteBritishCrossingRange(code)!;
    expect(crossing.earliest).toBeLessThanOrEqual(crossing.central);
    expect(crossing.latest).toBeGreaterThanOrEqual(crossing.central);
  });
});
