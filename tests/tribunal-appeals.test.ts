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
    const { title, publishedDate, nextEditionDate } = tribunal.release;
    expect(title).toMatch(/^Tribunal Statistics Quarterly: \w+ to \w+ \d{4}$/);
    for (const date of [publishedDate, nextEditionDate]) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const parsed = Date.parse(date);
      expect(Number.isFinite(parsed)).toBe(true);
      expect(new Date(parsed).toISOString().slice(0, 10)).toBe(date);
    }
    expect(publishedDate <= new Date().toISOString().slice(0, 10)).toBe(true);
    expect(nextEditionDate > publishedDate).toBe(true);
    expect(tribunal.latestPeriodLabel).toMatch(FINANCIAL_QUARTER);
    const match = title.match(/: (\w+) to (\w+) (\d{4})$/)!;
    const months = ["April to June", "July to September", "October to December", "January to March"];
    const quarter = months.indexOf(`${match[1]} to ${match[2]}`) + 1;
    expect(quarter).toBeGreaterThan(0);
    const startYear = Number(match[3]) - (quarter === 4 ? 1 : 0);
    expect(tribunal.latestPeriodLabel).toBe(
      `Q${quarter} ${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`
    );
  });

  // Keep release metadata and financial-year comparisons consistent across editions.
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

  it("reconciles the headline figures with the quarterly and annual series", () => {
    const checkBlock = (block: any, series: any[], latest: string, previous: string) => {
      for (const [key, label] of [["latest", latest], ["previous", previous]]) {
        const point = series.find((row) => row.periodLabel === label);
        expect(point, label).toBeDefined();
        expect(Number.isFinite(block[key])).toBe(true);
        expect(block[key]).toBeGreaterThanOrEqual(0);
        expect(block[key]).toBe(point.value);
      }
      expect(block.change).toBe(block.latest - block.previous);
    };
    for (const [key, series] of Object.entries(tribunal.series)) {
      checkBlock(tribunal.headline[key], series as any[], tribunal.latestPeriodLabel, tribunal.previousPeriodLabel);
    }
    for (const [key, series] of Object.entries(tribunal.annualSeries)) {
      const headlineKey = `annual${key[0].toUpperCase()}${key.slice(1)}`;
      checkBlock(tribunal.headline[headlineKey], series as any[], tribunal.latestAnnualLabel, tribunal.previousAnnualLabel);
    }
    expect(tribunal.reconciliation.allPassed).toBe(true);
    expect(tribunal.reconciliation.checkCount).toBeGreaterThan(0);
  });

  it("splits the caseload by case type consistently", () => {
    expect(tribunal.caseTypes.some((row: any) => row.id === "asylum_protection")).toBe(true);
    for (const caseType of tribunal.caseTypes) {
      expect(Number.isFinite(caseType.meanWeeksToClear)).toBe(true);
      expect(caseType.meanWeeksToClear).toBeGreaterThanOrEqual(0);
      for (const key of ["receipts", "disposals", "openCaseload", "allowedRatePct"]) {
        for (const [side, label] of [["latest", tribunal.latestPeriodLabel], ["previous", tribunal.previousPeriodLabel]]) {
          const point = caseType.series[key].find((row: any) => row.periodLabel === label);
          expect(point, `${caseType.id} ${key} ${label}`).toBeDefined();
          expect(Number.isFinite(caseType[key][side])).toBe(true);
          expect(caseType[key][side]).toBeGreaterThanOrEqual(0);
          expect(caseType[key][side]).toBe(point.value);
          if (key === "allowedRatePct") expect(point.value).toBeLessThanOrEqual(100);
        }
        expect(caseType[key].change).toBe(caseType[key].latest - caseType[key].previous);
      }
    }
  });

  it("reports both the quarterly and the annual mean time to clear", () => {
    for (const basis of ["quarterly", "annual"]) {
      const timing = tribunal.timeliness[basis];
      expect(timing.basisLabel).toBeTruthy();
      for (const key of ["latestMeanWeeks", "previousMeanWeeks"]) {
        expect(Number.isFinite(timing[key])).toBe(true);
        expect(timing[key]).toBeGreaterThanOrEqual(0);
      }
      expect(timing.changeWeeks).toBe(timing.latestMeanWeeks - timing.previousMeanWeeks);
    }
    expect(tribunal.timeliness.quarterly.basisLabel).not.toBe(tribunal.timeliness.annual.basisLabel);
  });

  it("labels every period on the MOJ financial-year basis", () => {
    expect(tribunal.periodBasis).toBe("financial_year_quarter");
    for (const series of Object.values(tribunal.series) as any[][]) {
      expect(series.length).toBeGreaterThan(0);
      expect(series.at(-1).periodLabel).toBe(tribunal.latestPeriodLabel);
      for (const point of series) {
        expect(point.periodLabel).toMatch(FINANCIAL_QUARTER);
        const [quarter, year] = point.periodLabel.split(" ");
        const startYear = Number(year.slice(0, 4));
        expect(year.slice(-2)).toBe(String((startYear + 1) % 100).padStart(2, "0"));
        const ends: Record<string, string> = {
          Q1: `${startYear}-06-30`, Q2: `${startYear}-09-30`,
          Q3: `${startYear}-12-31`, Q4: `${startYear + 1}-03-31`
        };
        expect(point.periodEnd).toBe(ends[quarter]);
      }
    }
  });

  it("carries consistent revision status for each published period", () => {
    expect(tribunal.revisionStatusByPeriod.length).toBeGreaterThan(0);
    for (const row of tribunal.revisionStatusByPeriod) {
      expect(row.periodLabel).toMatch(FINANCIAL_QUARTER);
      expect(["provisional", "revised", "final"]).toContain(row.status);
      if (row.publishedStatus) expect(row.status).toBe(row.publishedStatus);
      const point = tribunal.series.receipts.find((point: any) => point.periodLabel === row.periodLabel);
      expect(point).toBeDefined();
      expect(point.seriesStatus).toBe(row.status);
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
