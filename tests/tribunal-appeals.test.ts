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
    expect(tribunal.release.title).toBe("Tribunal Statistics Quarterly: January to March 2026");
    expect(tribunal.release.publishedDate).toBe("2026-06-11");
    expect(tribunal.release.nextEditionDate).toBe("2026-09-10");
    expect(tribunal.latestPeriodLabel).toBe("Q4 2025/26");
  });

  /**
   * The assertions above pin the current edition on purpose, so a new release is noticed.
   * These pin the SHAPE, so that when the April to June edition lands and those literals are
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
    expect(tribunal.latestAnnualLabel).toBe(year);
  });

  it("carries no release period in its source id", () => {
    // moj_tribunals_q4_2025_26 would have stopped resolving on the next edition, and
    // chartSource returns {} on a miss, so two public charts would have lost their source
    // line with nothing failing.
    for (const source of tribunal.sources ?? []) {
      expect(source.source_id).toBe("moj_tribunals");
    }
  });

  // These are the published headline figures for Q4 2025/26 against Q4 2024/25. The transform
  // asserts them at build time too, so a silent change in the MOJ table cannot slip through.
  it("matches the published headline figures", () => {
    expect(tribunal.headline.receipts.latest).toBe(27689);
    expect(tribunal.headline.receipts.previous).toBe(26273);
    expect(tribunal.headline.disposals.latest).toBe(15317);
    expect(tribunal.headline.disposals.previous).toBe(11420);
    expect(tribunal.headline.openCaseload.latest).toBe(151767);
    expect(tribunal.headline.openCaseload.previous).toBe(90389);
    expect(tribunal.headline.allowedRatePct.latest).toBe(39);
    expect(tribunal.headline.allowedRatePct.previous).toBe(42.5);
    expect(tribunal.headline.annualReceipts.latest).toBe(117697);
    expect(tribunal.headline.annualReceipts.previous).toBe(79074);
  });

  it("splits the caseload by case type", () => {
    const asylum = tribunal.caseTypes.find((row: { id: string }) => row.id === "asylum_protection");
    expect(asylum.openCaseload.latest).toBe(87450);
    expect(asylum.openCaseload.previous).toBe(50976);
    expect(asylum.meanWeeksToClear).toBe(67);

    for (const caseType of tribunal.caseTypes) {
      expect(typeof caseType.meanWeeksToClear).toBe("number");
      expect(caseType.receipts.latest).toBeGreaterThan(0);
    }
  });

  it("reports both the quarterly and the annual mean time to clear", () => {
    // The two bases give different answers, so each is published with its basis named rather
    // than collapsed into a single "mean time to clear".
    expect(tribunal.timeliness.quarterly.latestMeanWeeks).toBe(61);
    expect(tribunal.timeliness.quarterly.previousMeanWeeks).toBe(50);
    expect(tribunal.timeliness.quarterly.changeWeeks).toBe(11);
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
    expect(latest.periodLabel).toBe("Q4 2025/26");
    expect(latest.periodEnd).toBe("2026-03-31");

    const firstQuarter = tribunal.series.receipts.find(
      (point: { periodLabel: string }) => point.periodLabel === "Q1 2025/26"
    );
    expect(firstQuarter.periodEnd).toBe("2025-06-30");
  });

  it("carries the revision status MOJ published for each period", () => {
    const byLabel = new Map(
      tribunal.revisionStatusByPeriod.map((row: { periodLabel: string }) => [row.periodLabel, row])
    );

    expect(byLabel.get("Q4 2025/26")).toMatchObject({ status: "provisional" });
    expect(byLabel.get("Q3 2025/26")).toMatchObject({ status: "revised" });
    expect(byLabel.get("Q4 2024/25")).toMatchObject({ status: "final" });

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
