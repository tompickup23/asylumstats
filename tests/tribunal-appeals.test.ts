import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRouteDashboard } from "../src/lib/route-data";

const tribunal = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/live/tribunal-appeals.json"), "utf8")
);

const FINANCIAL_QUARTER = /^Q[1-4] \d{4}\/\d{2}$/;

describe("MOJ tribunal appeals mart", () => {
  it("names the release it was built from", () => {
    expect(tribunal.datasetId).toBe("moj_tribunals");
    expect(tribunal.release.title).toBe("Tribunal Statistics Quarterly: April to June 2026");
    expect(tribunal.release.publishedDate).toBe("2026-09-10");
    expect(tribunal.release.nextEditionDate).toBe("2026-12-10");
    expect(tribunal.latestPeriodLabel).toBe("Q1 2026/27");
  });

  /**
   * The assertions above pin the current edition on purpose, so a new release is noticed.
   * These pin the SHAPE, so that when the next edition lands and those literals are
   * updated, the parts that must stay internally consistent still are. The release is now
   * discovered from GOV.UK rather than written into the fetcher, and the failure this guards
   * against is the discovery returning one quarter while the labels describe another.
   */
  it("describes one release consistently, whichever release it is", () => {
    const { title, periodLabel, periodCoverage, publishedDate, nextEditionDate, nextEditionCoverage } =
      tribunal.release;

    expect(title).toBe(`Tribunal Statistics Quarterly: ${periodCoverage}`);
    expect(periodLabel).toMatch(FINANCIAL_QUARTER);
    expect(tribunal.latestPeriodLabel).toBe(periodLabel);

    // A quarter is published after it ends, and before the edition that follows it.
    const coverageYear = Number(periodCoverage.slice(-4));
    expect(Number(publishedDate.slice(0, 4))).toBeGreaterThanOrEqual(coverageYear);
    expect(nextEditionDate > publishedDate).toBe(true);
    expect(nextEditionCoverage).not.toBe(periodCoverage);

    // The year-ago comparison is the same quarter one financial year back, and both series
    // must actually carry it. Getting this wrong compares Q1 against Q4.
    const [quarter, year] = periodLabel.split(" ");
    const previousStart = Number(year.split("/")[0]) - 1;
    expect(tribunal.previousPeriodLabel).toBe(
      `${quarter} ${previousStart}/${String((previousStart + 1) % 100).padStart(2, "0")}`
    );

    // The annual comparison is the latest COMPLETE financial year, which only a Q4 edition
    // supplies. On a Q1 edition the quarter's own year has one quarter and no annual total.
    const completeStart = quarter === "Q4" ? previousStart + 1 : previousStart;
    expect(tribunal.latestAnnualLabel).toBe(
      `${completeStart}/${String((completeStart + 1) % 100).padStart(2, "0")}`
    );
    expect(tribunal.headline.annualReceipts.latest).toBeGreaterThan(tribunal.headline.receipts.latest);
  });

  it("carries no release period in its source id", () => {
    // moj_tribunals_q4_2025_26 would have stopped resolving on the next edition, and
    // chartSource returns {} on a miss, so two public charts would have lost their source
    // line with nothing failing.
    for (const source of tribunal.sources ?? []) {
      expect(source.source_id).toBe("moj_tribunals");
    }
  });

  // These are the published headline figures for Q1 2026/27 against Q1 2025/26, and 2025/26
  // (revised) against 2024/25 for the annual line. The transform
  // asserts them at build time too, so a silent change in the MOJ table cannot slip through.
  it("matches the published headline figures", () => {
    expect(tribunal.headline.receipts.latest).toBe(21762);
    expect(tribunal.headline.receipts.previous).toBe(27534);
    expect(tribunal.headline.disposals.latest).toBe(16786);
    expect(tribunal.headline.disposals.previous).toBe(12893);
    expect(tribunal.headline.openCaseload.latest).toBe(155798);
    expect(tribunal.headline.openCaseload.previous).toBe(105522);
    expect(tribunal.headline.allowedRatePct.latest).toBe(38);
    expect(tribunal.headline.allowedRatePct.previous).toBe(40);
    expect(tribunal.headline.annualReceipts.latest).toBe(117722);
    expect(tribunal.headline.annualReceipts.previous).toBe(79074);
  });

  it("splits the caseload by case type", () => {
    const asylum = tribunal.caseTypes.find((row: { id: string }) => row.id === "asylum_protection");
    expect(asylum.openCaseload.latest).toBe(90341);
    expect(asylum.openCaseload.previous).toBe(59925);
    expect(asylum.meanWeeksToClear).toBe(72);

    for (const caseType of tribunal.caseTypes) {
      expect(typeof caseType.meanWeeksToClear).toBe("number");
      expect(caseType.receipts.latest).toBeGreaterThan(0);
    }
  });

  it("reports both the quarterly and the annual mean time to clear", () => {
    // The two bases give different answers, so each is published with its basis named rather
    // than collapsed into a single "mean time to clear".
    expect(tribunal.timeliness.quarterly.latestMeanWeeks).toBe(65);
    expect(tribunal.timeliness.quarterly.previousMeanWeeks).toBe(52);
    expect(tribunal.timeliness.quarterly.changeWeeks).toBe(13);
    expect(tribunal.timeliness.annual.latestMeanWeeks).toBe(56);
    expect(tribunal.timeliness.annual.changeWeeks).toBe(9);
  });

  it("labels every period on the MOJ financial-year basis", () => {
    expect(tribunal.periodBasis).toBe("financial_year_quarter");

    for (const point of tribunal.series.receipts) {
      expect(point.periodLabel).toMatch(FINANCIAL_QUARTER);
    }

    // Q4 of a financial year ends on 31 March of the following calendar year.
    const latest = tribunal.series.receipts.at(-1);
    expect(latest.periodLabel).toBe("Q1 2026/27");
    expect(latest.periodEnd).toBe("2026-06-30");

    const lastQuarterOfYear = tribunal.series.receipts.find(
      (point: { periodLabel: string }) => point.periodLabel === "Q4 2025/26"
    );
    expect(lastQuarterOfYear.periodEnd).toBe("2026-03-31");

    const firstQuarter = tribunal.series.receipts.find(
      (point: { periodLabel: string }) => point.periodLabel === "Q1 2025/26"
    );
    expect(firstQuarter.periodEnd).toBe("2025-06-30");
  });

  it("carries the revision status MOJ published for each period", () => {
    const byLabel = new Map(
      tribunal.revisionStatusByPeriod.map((row: { periodLabel: string }) => [row.periodLabel, row])
    );

    // From this edition MOJ prints the markers as superscripts ("Q1ᵖ", "Q4ʳ").
    expect(byLabel.get("Q1 2026/27")).toMatchObject({ status: "provisional" });
    expect(byLabel.get("Q4 2025/26")).toMatchObject({ status: "revised" });
    expect(byLabel.get("Q3 2025/26")).toMatchObject({ status: "final" });

    // The status parsed from the ODS revision markers must agree with the status published in
    // the national CSV.
    for (const row of tribunal.revisionStatusByPeriod) {
      if (row.publishedStatus) {
        expect(row.status).toBe(row.publishedStatus);
      }
    }
  });

  it("warns that this is not a continuation of the discontinued Home Office series", () => {
    expect(tribunal.continuityNote).toMatch(/not a like-for-like continuation/i);
    expect(tribunal.continuityNote).toMatch(/should not be spliced/i);
    expect(tribunal.periodBasisNote).toMatch(/financial-year quarters/i);
    expect(tribunal.periodBasisNote).toMatch(/calendar quarters/i);
  });

  it("uses no em-dashes on any published string", () => {
    expect(JSON.stringify(tribunal)).not.toContain("—");
  });
});

describe("route dashboard appeals block", () => {
  const dashboard = loadRouteDashboard();
  const appeals = dashboard.nationalSystemDynamics.postDecisionPath.appeals;

  it("is built from the MOJ tribunal mart", () => {
    expect(appeals.latestQuarterLabel).toBe(tribunal.latestPeriodLabel);
    expect(appeals.periodBasis).toBe("financial_year_quarter");
    expect(appeals.series.receipts?.at(-1)?.value).toBe(tribunal.headline.receipts.latest);
    expect(appeals.series.openCaseload?.at(-1)?.value).toBe(tribunal.headline.openCaseload.latest);
    expect(appeals.caseTypes.length).toBe(tribunal.caseTypes.length);
  });

  it("no longer carries the discontinued Home Office appeals series", () => {
    expect(appeals).not.toHaveProperty("dataLagNote");
    expect(appeals.series).not.toHaveProperty("lodged");
    expect(appeals.series).not.toHaveProperty("determined");
    expect(dashboard.sources.some((source) => source.source_id === "asylum_appeals_mar_2023")).toBe(false);
    expect(dashboard.sources.some((source) => source.source_id === "moj_tribunals")).toBe(true);
    expect(dashboard.sources.filter((source) => String(source.source_id).startsWith("moj_tribunals"))).toHaveLength(1);

    // No data point may still sit on the old calendar-quarter labels, and none may predate the
    // dead series' final quarter while pretending to be current.
    for (const series of Object.values(appeals.series)) {
      for (const point of series ?? []) {
        expect(point.periodLabel).toMatch(FINANCIAL_QUARTER);
      }
    }

    // The scope note must still explain what this replaced, so the break in the series is
    // visible to readers rather than silently papered over.
    expect(appeals.scopeNote).toContain("2023 Q1");
  });

  it("keeps the MOJ and Home Office period bases distinct", () => {
    // Mixing the two would misdate the tribunal series by up to a quarter.
    expect(appeals.latestQuarterLabel).toMatch(FINANCIAL_QUARTER);
    expect(dashboard.nationalSystemDynamics.postDecisionPath.returns.latestQuarterLabel).toMatch(
      /^\d{4} Q[1-4]$/
    );
  });
});
