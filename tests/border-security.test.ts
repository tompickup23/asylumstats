import { describe, expect, it } from "vitest";
import borderSecurity from "../src/data/live/border-security.json";

/**
 * The Border Security Commander's data is the only source here with no spreadsheet: the
 * numbers exist as HTML tables on two GOV.UK pages, so the parse is more fragile than
 * anything else the site ingests.
 *
 * These tests guard the two things that would actually go wrong. First, a column shift
 * in the HTML producing plausible but wrong figures, caught by checking every series
 * against the totals the release states itself. Second, the agency table, which is the
 * trap in this dataset: it counts agency INVOLVEMENT in an arrest, not arrests, and more
 * than one agency can attach to the same arrest. Summing it gives 2,380 against a
 * published "at least 1,900", an overstatement of about 25%.
 */
const data = borderSecurity as {
  releaseDate: string;
  statisticsStatus: string;
  organisedImmigrationCrime: {
    quarterly: Array<{
      quarterId: string;
      major: number;
      moderate: number;
      minor: number;
      total: number;
    }>;
    summary: {
      latestPeriod: string;
      latestPeriodShort: string;
      metrics: Array<{ level: string; latest: number; prior: number; changePct: number }>;
    };
    agencyInvolvement: {
      countsArrests: boolean;
      note: string;
      rows: Array<{ agency: string; prior: number; latest: number }>;
    };
    arrests: { basis: string; latest: number; prior: number };
  };
  ukFranceAgreement: {
    monthly: Array<{ period: string; transferredIn: number; returnedOut: number }>;
    totals: { transferredIn: number; returnedOut: number };
  };
};

const oic = data.organisedImmigrationCrime;
const metric = (level: string) => {
  const found = oic.summary.metrics.find((candidate) => candidate.level === level);
  if (!found) throw new Error(`no ${level} metric`);
  return found;
};

describe("organised immigration crime disruptions", () => {
  it("has every quarter's parts summing to its own published row total", () => {
    for (const quarter of oic.quarterly) {
      expect(
        quarter.major + quarter.moderate + quarter.minor,
        `${quarter.quarterId} parts do not sum to its row total`
      ).toBe(quarter.total);
    }
  });

  it("matches the totals the release states in prose", () => {
    // These are the figures the Home Office writes out in the release text. If the parse
    // drifts from them, the parse is wrong, not the release.
    expect(metric("total").latest).toBe(3766);
    expect(metric("total").prior).toBe(2578);
    expect(metric("major").latest).toBe(108);
    expect(metric("major").changePct).toBe(29);
    expect(metric("moderate").changePct).toBe(79);
    expect(metric("minor").changePct).toBe(43);
  });

  it("derives the summary from the trailing four quarters, not a hardcoded window", () => {
    const latestFour = oic.quarterly.slice(-4);
    expect(latestFour).toHaveLength(4);
    expect(latestFour.reduce((sum, row) => sum + row.total, 0)).toBe(metric("total").latest);
    expect(latestFour.at(-1)?.quarterId).toBe("2026-Q1");
  });
});

describe("the agency involvement table", () => {
  it("is flagged as not counting arrests", () => {
    expect(oic.agencyInvolvement.countsArrests).toBe(false);
    expect(oic.agencyInvolvement.note).toMatch(/not arrests/i);
  });

  it("sums above the arrest total, which is why it must never be summed", () => {
    // The guard is this inequality. If a future release made the column sum to the
    // arrest total, the note above would be wrong and would need rewriting rather than
    // this test being relaxed.
    const summed = oic.agencyInvolvement.rows.reduce((total, row) => total + row.latest, 0);
    expect(summed).toBeGreaterThan(oic.arrests.latest);
    expect(summed).toBe(2380);
  });

  it("carries arrests as minimums, as the release states them", () => {
    expect(oic.arrests.basis).toBe("at least");
    expect(oic.arrests.latest).toBe(1900);
    expect(oic.arrests.prior).toBe(1100);
  });
});

describe("UK-France agreement transfers", () => {
  it("has monthly rows summing to the table's own total row", () => {
    const monthly = data.ukFranceAgreement.monthly;
    expect(monthly.reduce((sum, row) => sum + row.transferredIn, 0)).toBe(
      data.ukFranceAgreement.totals.transferredIn
    );
    expect(monthly.reduce((sum, row) => sum + row.returnedOut, 0)).toBe(
      data.ukFranceAgreement.totals.returnedOut
    );
  });

  it("excludes the source table's Total row from the monthly series", () => {
    // The parse reads a table whose last row is a Total. Leaving it in would double the
    // series and still sum "correctly" against itself.
    const monthly = data.ukFranceAgreement.monthly;
    expect(monthly).toHaveLength(11);
    expect(monthly.some((row) => /total/i.test(row.period))).toBe(false);
  });
});

describe("provenance", () => {
  it("labels the release as not designated official statistics", () => {
    // Both series are ad hoc or in development. The site says so wherever they appear,
    // and this is the guard that the label travels with the data.
    expect(data.statisticsStatus).toMatch(/not designated official statistics/i);
    expect(data.releaseDate).toBe("2026-07-16");
  });

  it("carries no run timestamp, so a re-run does not churn the diff", () => {
    // A generatedAt here would make `git diff --quiet` in refresh-data.yml see a change
    // on every run and commit weekly whether or not the data moved.
    expect(data).not.toHaveProperty("generatedAt");
  });
});
