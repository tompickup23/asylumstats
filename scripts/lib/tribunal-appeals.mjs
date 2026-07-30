import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const liveTribunalPath = path.resolve("src/data/live/tribunal-appeals.json");

/**
 * Reads the published MOJ tribunal mart, or returns null when the tribunal pipeline has not
 * been run yet.
 */
export function readTribunalAppeals() {
  if (!existsSync(liveTribunalPath)) {
    return null;
  }

  return JSON.parse(readFileSync(liveTribunalPath, "utf8"));
}

/**
 * Builds the route dashboard's `postDecisionPath.appeals` block from the MOJ tribunal mart.
 *
 * Both transform-tribunals.mjs and transform-routes.mjs call this so there is a single
 * definition of the published shape. The keys deliberately name what MOJ measures (receipts,
 * disposals, open caseload) rather than reusing the discontinued Home Office
 * "lodged" and "determined" wording, which counted a narrower, asylum-only population.
 */
export function buildAppealsBlock(tribunal) {
  if (!tribunal) {
    return null;
  }

  return {
    latestQuarterLabel: tribunal.latestPeriodLabel,
    dataCompleteThroughLabel: tribunal.latestPeriodLabel,
    periodBasis: tribunal.periodBasis,
    periodBasisNote: tribunal.periodBasisNote,
    scopeLabel: `${tribunal.chamberLabel}, all case types`,
    scopeNote: tribunal.continuityNote,
    provisionalNote: tribunal.provisionalNote,
    sourceLabel: tribunal.release.title,
    sourceReleaseDate: tribunal.release.publishedDate,
    nextEditionDate: tribunal.release.nextEditionDate,
    meanWeeksToClear: tribunal.timeliness.quarterly.latestMeanWeeks,
    meanWeeksToClearChange: tribunal.timeliness.quarterly.changeWeeks,
    allowedRatePct: tribunal.headline.allowedRatePct.latest,
    allowedRatePctPrevious: tribunal.headline.allowedRatePct.previous,
    series: {
      receipts: tribunal.series.receipts,
      disposals: tribunal.series.disposals,
      openCaseload: tribunal.series.openCaseload,
      allowedRatePct: tribunal.series.allowedRatePct
    },
    latestDeterminationBreakdown: tribunal.latestBreakdown,
    caseTypes: tribunal.caseTypes.map((caseType) => ({
      id: caseType.id,
      label: caseType.label,
      receipts: caseType.receipts.latest,
      disposals: caseType.disposals.latest,
      openCaseload: caseType.openCaseload.latest,
      allowedRatePct: caseType.allowedRatePct.latest,
      meanWeeksToClear: caseType.meanWeeksToClear
    }))
  };
}
