/**
 * Explainers built entirely on the quarterly Home Office release, the weekly small boats
 * series and the MOJ tribunal statistics. Nothing here is typed in: each answer is
 * composed from the marts, so the next refresh rewrites it.
 */
import { loadRouteDashboard, loadLocalRouteLatest, type RouteSeriesPoint } from "../route-data";
import { buildPlacePath } from "../site";
import {
  fmtInt,
  formatLongDate,
  grantRateSeries,
  initialGrantRate,
  routesRelease,
  smallBoats
} from "../headline-figures";
import type { Explainer } from "./types";

const pct = (value: number, digits = 0) => `${value.toFixed(digits)}%`;

function changePct(latest: number, previous: number): number {
  return ((latest - previous) / previous) * 100;
}

/** "12% lower" / "4% higher" / "unchanged". */
function direction(latest: number, previous: number): string {
  const change = changePct(latest, previous);
  if (Math.abs(change) < 0.5) return "unchanged";
  return `${Math.abs(change).toFixed(0)}% ${change < 0 ? "lower" : "higher"}`;
}

/** The point exactly one year before the last, matched on date rather than position. */
function yearEarlier(series: RouteSeriesPoint[]): RouteSeriesPoint | null {
  const last = series.at(-1);
  if (!last?.periodEnd) return null;
  const target = `${Number(last.periodEnd.slice(0, 4)) - 1}${last.periodEnd.slice(4)}`;
  return series.find((point) => point.periodEnd === target) ?? null;
}

function sourceById(id: string): string {
  const source = loadRouteDashboard().sources.find((entry) => entry.source_id === id);
  if (!source?.source_url) throw new Error(`Route dashboard has no source "${id}" for an explainer.`);
  return source.source_url;
}

function requirePoint<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Explainer data missing: ${what}`);
  return value;
}

function routeReleaseDates() {
  const release = routesRelease();
  const published = requirePoint(release.publishedDate, "routes release date");
  return {
    published,
    nextUpdate: release.nextEditionDueBy
      ? { date: release.nextEditionDueBy, label: "Home Office quarterly statistics, next edition due by" }
      : undefined
  };
}

function howManyAsylumSeekers(): Explainer {
  const dynamics = loadRouteDashboard().nationalSystemDynamics;
  const latest = dynamics.latestQuarter;
  const supportSeries = dynamics.stockSeries.supportedAsylum;
  const last = requirePoint(supportSeries.at(-1), "support series");
  const before = requirePoint(yearEarlier(supportSeries), "support a year earlier");
  const peak = supportSeries.reduce((max, point) => (point.value > max.value ? point : max));
  const breakdown = dynamics.latestSupportBreakdown;
  const supportUrl = sourceById("asylum_support");
  const areas = [...loadLocalRouteLatest().areas]
    .sort((a, b) => b.supportedAsylum - a.supportedAsylum)
    .slice(0, 10);
  const asAt = formatLongDate(last.periodEnd);

  return {
    slug: "how-many-asylum-seekers-are-in-the-uk",
    topic: "numbers",
    question: "How many asylum seekers are in the UK?",
    seoTitle: `How many asylum seekers are in the UK? ${fmtInt(last.value)} (${last.periodLabel.replace(/^\d+ /, "")})`,
    seoDescription: `${fmtInt(last.value)} people were on Home Office asylum support at ${asAt}, ${direction(last.value, before.value)} than a year earlier. Where they live, and how many are in hotels.`,
    figure: fmtInt(last.value),
    figureLabel: `on asylum support, ${asAt}`,
    answer:
      `There is no single official count of asylum seekers in the UK. The closest measure is asylum support: ` +
      `${fmtInt(last.value)} people were receiving Home Office accommodation, cash or both at ${asAt}, ` +
      `${direction(last.value, before.value)} than a year earlier. ` +
      `Separately, ${fmtInt(latest.awaitingInitialDecision)} people were waiting for a first decision.`,
    asAt: requirePoint(last.periodEnd, "period end"),
    ...routeReleaseDates(),
    sources: [{ label: "Home Office, immigration system statistics: asylum support (Asy_D11)", url: supportUrl }],
    keyFigures: [
      ...breakdown.map((row) => ({ label: row.label, value: fmtInt(row.value) })),
      { label: "Peak", value: fmtInt(peak.value), note: formatLongDate(peak.periodEnd) }
    ],
    chart: {
      title: "People on asylum support, quarter end",
      description: `From ${supportSeries[0].periodLabel} to ${last.periodLabel}. A stock at each quarter end, not a count of arrivals.`,
      points: supportSeries.map((point) => ({ label: point.periodLabel, value: point.value })),
      source: "Home Office, Asy_D11",
      sourceUrl: supportUrl
    },
    basis: [
      "Asylum support is what the Home Office provides to people who have claimed asylum and would otherwise be destitute: a room, a weekly cash allowance, or both. It is a count of people at the end of each quarter, including children and other dependants.",
      "It is not everyone in the asylum system. People who claim and support themselves are not in it, and people leave it when they are granted protection, refused and removed, or stop being eligible. The number waiting for a decision overlaps with it, so the two must not be added together."
    ],
    questions: [
      {
        question: "How many asylum seekers are in hotels?",
        answer: `${fmtInt(latest.hotelAccommodation)} people were in contingency hotels at ${asAt}, ${pct(requirePoint(latest.hotelShareOfSupportPct, "hotel share"), 1)} of everyone on asylum support. Most people on support, ${fmtInt(breakdown.find((row) => row.metricId === "dispersal")?.value)}, live in dispersal housing: ordinary flats and houses rented by the Home Office's contractors.`
      },
      {
        question: "Is the number going up or down?",
        answer: `Down. ${fmtInt(last.value)} people were on support at ${asAt}, against ${fmtInt(before.value)} a year earlier. The highest point in the published series was ${fmtInt(peak.value)} at ${formatLongDate(peak.periodEnd)}.`
      },
      {
        question: "Which areas have the most asylum seekers?",
        answer: `${areas[0].areaName} has the most people on asylum support, ${fmtInt(areas[0].supportedAsylum)}, followed by ${areas[1].areaName} and ${areas[2].areaName}. Counts favour big cities, so the rate per 10,000 residents is the fairer comparison. Every area has its own page with both.`
      }
    ],
    areas: {
      title: "Where people on asylum support live",
      note: `The ten local authorities with the most people on asylum support at ${asAt}, with the rate per 10,000 residents.`,
      rows: areas.map((area) => ({
        name: area.areaName,
        href: buildPlacePath(area),
        value: fmtInt(area.supportedAsylum),
        detail: area.supportedAsylumRate !== null ? `${area.supportedAsylumRate.toFixed(1)} per 10,000` : undefined
      }))
    },
    relatedFindings: ["concentration-top-10-areas", "north-west-one-in-five", "hotel-budget-share"],
    relatedExplainers: ["how-many-asylum-hotels-are-there", "how-many-asylum-seekers-are-waiting-for-a-decision"],
    relatedPages: [
      { href: "/places/", label: "Every local authority" },
      { href: "/national/", label: "The national picture" }
    ]
  };
}

function waitingForADecision(): Explainer {
  const dynamics = loadRouteDashboard().nationalSystemDynamics;
  const latest = dynamics.latestQuarter;
  const series = dynamics.stockSeries.awaitingInitialDecision;
  const last = requirePoint(series.at(-1), "awaiting series");
  const before = requirePoint(yearEarlier(series), "awaiting a year earlier");
  const peak = series.reduce((max, point) => (point.value > max.value ? point : max));
  const url = sourceById("asylum_awaiting_decision");
  const asAt = formatLongDate(last.periodEnd);
  const falling = latest.decisionMinusClaims > 0;

  return {
    slug: "how-many-asylum-seekers-are-waiting-for-a-decision",
    topic: "numbers",
    question: "How many asylum seekers are waiting for a decision?",
    seoTitle: `Asylum backlog: ${fmtInt(last.value)} waiting for a decision (${last.periodLabel.replace(/^\d+ /, "")})`,
    seoDescription: `${fmtInt(last.value)} people were waiting for an initial asylum decision at ${asAt}, ${direction(last.value, before.value)} than a year earlier. The peak, the trend, and why it moved.`,
    figure: fmtInt(last.value),
    figureLabel: `waiting for a first decision, ${asAt}`,
    answer:
      `${fmtInt(last.value)} people were waiting for an initial decision on an asylum claim at ${asAt}, ` +
      `${direction(last.value, before.value)} than a year earlier and well below the peak of ${fmtInt(peak.value)} at ${formatLongDate(peak.periodEnd)}. ` +
      `In the latest quarter the Home Office made ${fmtInt(latest.initialDecisions)} initial decisions against ${fmtInt(latest.claims)} new claims.`,
    asAt: requirePoint(last.periodEnd, "period end"),
    ...routeReleaseDates(),
    sources: [{ label: "Home Office, immigration system statistics: claims awaiting a decision (Asy_D03)", url }],
    keyFigures: [
      { label: "Waiting for an initial decision", value: fmtInt(last.value), note: asAt },
      { label: "A year earlier", value: fmtInt(before.value), note: formatLongDate(before.periodEnd) },
      { label: "Peak", value: fmtInt(peak.value), note: formatLongDate(peak.periodEnd) },
      { label: `Initial decisions, ${latest.quarterLabel}`, value: fmtInt(latest.initialDecisions) },
      { label: `New claims, ${latest.quarterLabel}`, value: fmtInt(latest.claims) }
    ],
    chart: {
      title: "People waiting for an initial asylum decision",
      description: `Quarter end, ${series[0].periodLabel} to ${last.periodLabel}. Main applicants and dependants.`,
      points: series.map((point) => ({ label: point.periodLabel, value: point.value })),
      source: "Home Office, Asy_D03",
      sourceUrl: url
    },
    basis: [
      "The backlog here is people waiting for a first decision on their claim, counted at the end of each quarter, including dependants. The Home Office publishes the number of cases too, which is lower because one case can cover a family.",
      "It does not include people whose claim was refused and who have appealed. Those cases sit with the tribunal, in a separate backlog measured by a different department on a different calendar."
    ],
    questions: [
      {
        question: "Is the asylum backlog going down?",
        answer: falling
          ? `Yes. The Home Office decided ${fmtInt(latest.decisionMinusClaims)} more claims than it received in ${latest.quarterLabel}, so the queue shrank. The number waiting fell from ${fmtInt(before.value)} to ${fmtInt(last.value)} over the year.`
          : `Not in the latest quarter. The Home Office received ${fmtInt(-latest.decisionMinusClaims)} more claims than it decided in ${latest.quarterLabel}, so the queue grew.`
      },
      {
        question: "Does the backlog include appeals?",
        answer: "No. Once a claim is refused, an appeal goes to the First-tier Tribunal, which the Ministry of Justice counts separately. Clearing the Home Office backlog pushes work into the tribunal: the Ministry of Justice attributes the steep rise in asylum appeals from late 2023 to exactly that."
      },
      {
        question: "Where do people wait for a decision?",
        answer: `Many are on asylum support, in dispersal housing or hotels, while others support themselves. ${fmtInt(latest.supportedAsylum)} people were on support at ${asAt}. That group overlaps with the people waiting but is not the same, so the two figures should not be added.`
      }
    ],
    relatedFindings: ["backlog-awaiting-decision", "returns-39k-vs-manifesto"],
    relatedExplainers: ["how-long-does-an-asylum-appeal-take", "uk-asylum-grant-rate"],
    relatedPages: [{ href: "/routes/", label: "Claims, decisions and returns" }]
  };
}

function smallBoatCrossings(): Explainer {
  const boats = smallBoats();
  const cards = loadRouteDashboard().nationalCards;
  const yearEnding = cards.find((card) => card.id === "small_boat_arrivals");
  const share = cards.find((card) => card.id === "small_boat_share");
  const years = Object.entries(boats.completeCalendarYears).sort(([a], [b]) => a.localeCompare(b));
  const [peakYear, peakValue] = years.reduce((max, entry) => (entry[1] > max[1] ? entry : max));
  const lastFullYear = requirePoint(years.at(-1), "complete calendar years");
  const asAt = formatLongDate(boats.asAt);
  const change = boats.changePct;
  const changeText =
    change === null ? "" : `, ${Math.abs(change).toFixed(0)}% ${change < 0 ? "fewer" : "more"} than the ${fmtInt(boats.priorYearArrivals)} at the same point in ${boats.priorYear}`;
  const week = boats.latestWeek;
  const otherEntryMethods = loadRouteDashboard()
    .illegalEntryMethodsLatestYear.filter((row) => !/small boat/i.test(row.method))
    .map((row) => `${row.method.toLowerCase()} (${fmtInt(row.value)})`)
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");

  return {
    slug: "how-many-small-boats-have-crossed-this-year",
    topic: "arrivals",
    question: `How many small boats have crossed the Channel in ${boats.year}?`,
    seoTitle: `Small boat crossings ${boats.year}: ${fmtInt(boats.arrivals)} so far`,
    seoDescription:
      `${fmtInt(boats.arrivals)} people crossed the Channel in small boats in ${boats.year} to ${asAt.replace(/ \d{4}$/, "")}` +
      (change === null ? ". " : `, ${Math.abs(change).toFixed(0)}% ${change < 0 ? "fewer" : "more"} than by that date in ${boats.priorYear}. `) +
      "Every year since 2018.",
    figure: fmtInt(boats.arrivals),
    figureLabel: `small boat arrivals, 1 January to ${asAt}`,
    answer:
      `${fmtInt(boats.arrivals)} people crossed the Channel in small boats between 1 January and ${asAt}${changeText}. ` +
      `The whole of ${lastFullYear[0]} saw ${fmtInt(lastFullYear[1])}. The Home Office publishes the count daily and updates the full series every Friday.`,
    asAt: boats.asAt,
    published: boats.published,
    sources: [
      { label: "Home Office, migrants detected crossing the English Channel in small boats", url: boats.sourceUrl },
      ...(yearEnding ? [{ label: "Home Office, immigration system statistics: irregular migration", url: yearEnding.sourceUrl }] : [])
    ],
    keyFigures: [
      { label: `${boats.year}, 1 January to ${asAt}`, value: fmtInt(boats.arrivals) },
      { label: `${boats.priorYear}, same period`, value: fmtInt(boats.priorYearArrivals) },
      { label: `Week ending ${formatLongDate(week.weekEnding)}`, value: fmtInt(week.arrivals), note: `${fmtInt(week.boats)} boats` },
      ...(yearEnding ? [{ label: yearEnding.period, value: fmtInt(yearEnding.value), note: "official quarterly total" }] : []),
      { label: `Record year, ${peakYear}`, value: fmtInt(peakValue) }
    ],
    chart: {
      title: "Small boat arrivals by calendar year",
      description: `Complete years only, ${years[0][0]} to ${lastFullYear[0]}. ${boats.year} is not plotted because it is not finished.`,
      points: years.map(([year, value]) => ({ label: year, value })),
      source: "Home Office, small boats time series",
      sourceUrl: boats.sourceUrl
    },
    basis: [
      "The count is people detected arriving in the UK in small boats. The Home Office publishes it daily and revises it in a weekly time series, which is what this page uses.",
      "The year-to-date comparison runs to the same calendar day in both years, because crossings are seasonal and a part-year against a full year would mislead. The Home Office's quarterly figure, a rolling twelve months, is a different measure and is shown separately."
    ],
    questions: [
      {
        question: "What was the record year for small boat crossings?",
        answer: `${peakYear}, when ${fmtInt(peakValue)} people crossed. The published series starts in 2018, when 299 people arrived this way.`
      },
      {
        question: "What share of irregular arrivals come by small boat?",
        answer: share
          ? `${pct(share.value, 1)} of detected irregular entry in the ${share.period.toLowerCase()}, according to the Home Office. The rest are ${otherEntryMethods}.`
          : "Most detected irregular entry is by small boat, according to the Home Office's irregular migration statistics."
      },
      {
        question: "How many crossed last week?",
        answer: `${fmtInt(week.arrivals)} people in ${fmtInt(week.boats)} boats in the week ending ${formatLongDate(week.weekEnding)}` +
          (week.migrantsPrevented !== null ? `, with ${fmtInt(week.migrantsPrevented)} people prevented from crossing.` : ".")
      }
    ],
    relatedFindings: ["small-boats-arrivals", "returns-39k-vs-manifesto"],
    relatedExplainers: ["how-many-asylum-seekers-are-waiting-for-a-decision", "uk-asylum-grant-rate"],
    relatedPages: [{ href: "/routes/", label: "Every route into the UK" }]
  };
}

function grantRate(): Explainer {
  const rate = requirePoint(initialGrantRate(), "grant rate");
  const series = grantRateSeries();
  const url = sourceById("asylum_outcome_analysis");
  const { published, nextUpdate } = routeReleaseDates();
  const asAt = requirePoint(
    loadRouteDashboard().nationalSystemDynamics.flowSeries.mainApplicantGrants.at(-1)?.periodEnd,
    "grant series end"
  );
  const previous = rate.previousPct;

  return {
    slug: "uk-asylum-grant-rate",
    topic: "decisions",
    question: "What is the UK asylum grant rate?",
    seoTitle: `UK asylum grant rate: ${pct(rate.pct)} at initial decision`,
    seoDescription: `${pct(rate.pct)} of asylum claims decided in the year to ${formatLongDate(asAt).replace(/^\d+ /, "")} were granted at first decision${previous !== null ? `, against ${pct(previous)} a year before` : ""}. How it is measured.`,
    figure: pct(rate.pct),
    figureLabel: `granted at initial decision, ${rate.windowLabel}`,
    answer:
      `${pct(rate.pct)} of asylum claims decided in the year to ${formatLongDate(asAt).replace(/^\d+ /, "")} were granted at initial decision` +
      (previous !== null ? `, against ${pct(previous)} in the year before. ` : ". ") +
      `That is ${fmtInt(rate.grants)} grants and ${fmtInt(rate.refusals)} refusals of main applicants. More are granted later on appeal.`,
    asAt,
    published,
    nextUpdate,
    sources: [{ label: "Home Office, immigration system statistics: initial decisions (Asy_D02)", url }],
    keyFigures: [
      { label: "Grant rate, initial decision", value: pct(rate.pct, 1), note: rate.windowLabel },
      { label: "Main applicants granted", value: fmtInt(rate.grants) },
      { label: "Main applicants refused", value: fmtInt(rate.refusals) },
      ...(previous !== null ? [{ label: "A year earlier", value: pct(previous, 1) }] : [])
    ],
    chart: {
      title: "Grant rate at initial decision, year ending June",
      description: "Main applicants granted as a share of grants and refusals. Withdrawals and administrative outcomes excluded.",
      points: series,
      valueSuffix: "%",
      source: "Home Office, Asy_D02",
      sourceUrl: url
    },
    basis: [
      "This is the Home Office's own measure: main applicants granted protection or other leave, divided by main applicants granted or refused. Withdrawn claims and administrative outcomes are left out, and dependants are not counted, because they follow the main applicant's decision.",
      "Different definitions give different numbers. Dividing by every decision, withdrawals included, gives a lower figure, and counting dependants changes it again. A rate quoted without its definition cannot be compared with another."
    ],
    questions: [
      {
        question: "What happens if an asylum claim is refused?",
        answer: "Most refused claimants can appeal to the First-tier Tribunal. Many do, and some of those appeals are allowed, so the final grant rate for a group of claims ends up higher than the initial one. That final rate takes years to settle, because appeals take more than a year to clear."
      },
      {
        question: "Why does the grant rate change so much?",
        answer: "Grant rates differ enormously by nationality and can move sharply when conditions in a country change. So a shift in which nationalities are being decided, or in the assessment of one large group, moves the overall rate even if nothing else changes."
      },
      {
        question: "Which nationalities are most likely to be granted?",
        answer: "It ranges from almost every claim granted for some nationalities to almost none for others, which is why a single national rate says little about any one claim. The Home Office publishes the rate for every nationality, and our league table ranks them."
      }
    ],
    relatedFindings: ["grant-rate-league-table", "home-office-appeal-uplift-may2026", "pakistan-asylum-17x-surge"],
    relatedExplainers: ["how-long-does-an-asylum-appeal-take", "how-many-asylum-seekers-are-waiting-for-a-decision"],
    relatedPages: [{ href: "/routes/", label: "Claims, decisions and returns" }]
  };
}

function appealWaitingTime(): Explainer {
  const appeals = loadRouteDashboard().nationalSystemDynamics.postDecisionPath.appeals;
  const asylum = requirePoint(appeals.caseTypes.find((row) => row.id === "asylum_protection"), "asylum case type");
  const open = appeals.series.openCaseload ?? [];
  const receipts = requirePoint(appeals.series.receipts?.at(-1), "tribunal receipts");
  const disposals = requirePoint(appeals.series.disposals?.at(-1), "tribunal disposals");
  const lastOpen = requirePoint(open.at(-1), "open caseload");
  const openYearEarlier = requirePoint(yearEarlier(open as RouteSeriesPoint[]), "open caseload a year earlier");
  const weeks = requirePoint(appeals.meanWeeksToClear, "mean weeks");
  const previousWeeks = weeks - (appeals.meanWeeksToClearChange ?? 0);
  const url = sourceById("moj_tribunals");
  const coverage = appeals.sourceLabel.replace(/^Tribunal Statistics Quarterly: /, "");
  const asAt = formatLongDate(lastOpen.periodEnd);

  return {
    slug: "how-long-does-an-asylum-appeal-take",
    topic: "decisions",
    question: "How long does an asylum appeal take?",
    seoTitle: `How long does an asylum appeal take? ${asylum.meanWeeksToClear} weeks on average`,
    seoDescription: `Asylum and protection appeals took an average of ${asylum.meanWeeksToClear} weeks to clear in ${coverage}. ${fmtInt(lastOpen.value)} tribunal cases were open at ${asAt}.`,
    figure: `${asylum.meanWeeksToClear} weeks`,
    figureLabel: `average time to clear an asylum appeal, ${coverage}`,
    answer:
      `An asylum or protection appeal took an average of ${asylum.meanWeeksToClear} weeks to clear at the First-tier Tribunal in ${coverage}. ` +
      `Across all immigration and asylum appeals the average was ${weeks} weeks, up from ${previousWeeks} a year earlier, ` +
      `and ${fmtInt(lastOpen.value)} cases were waiting at ${asAt}.`,
    asAt: requirePoint(lastOpen.periodEnd, "period end"),
    published: appeals.sourceReleaseDate,
    nextUpdate: appeals.nextEditionDate
      ? { date: appeals.nextEditionDate, label: "Ministry of Justice tribunal statistics, next edition" }
      : undefined,
    sources: [{ label: `Ministry of Justice, ${appeals.sourceLabel}`, url }],
    keyFigures: [
      { label: "Asylum and protection appeals", value: `${asylum.meanWeeksToClear} weeks`, note: coverage },
      { label: "All immigration and asylum appeals", value: `${weeks} weeks`, note: `${previousWeeks} a year earlier` },
      { label: "Cases open", value: fmtInt(lastOpen.value), note: asAt },
      { label: "Asylum and protection cases open", value: fmtInt(asylum.openCaseload) },
      { label: `Appeals received, ${receipts.periodLabel}`, value: fmtInt(receipts.value) },
      { label: `Appeals cleared, ${disposals.periodLabel}`, value: fmtInt(disposals.value) }
    ],
    chart: {
      title: "Open cases at the immigration and asylum tribunal",
      description: `Quarter end, ${open[0]?.periodLabel} to ${lastOpen.periodLabel}. All case types. Financial-year quarters.`,
      points: open.map((point) => ({ label: point.periodLabel, value: point.value })),
      source: "Ministry of Justice, tribunal statistics quarterly",
      sourceUrl: url
    },
    basis: [
      "The time is the mean from an appeal being received to it being cleared, which includes appeals withdrawn or struck out as well as those heard. The Ministry of Justice has withdrawn its median and quartile measures pending a review, so only the mean is published.",
      appeals.periodBasisNote
    ],
    questions: [
      {
        question: "Why are asylum appeals taking longer?",
        answer:
          (receipts.value > disposals.value
            ? `The tribunal is receiving more than it clears. In ${receipts.periodLabel} it received ${fmtInt(receipts.value)} appeals and cleared ${fmtInt(disposals.value)}`
            : `The tribunal now clears more than it receives, ${fmtInt(disposals.value)} against ${fmtInt(receipts.value)} in ${receipts.periodLabel}, but the queue built up first`) +
          `, and ${fmtInt(lastOpen.value)} cases were open against ${fmtInt(openYearEarlier.value)} a year earlier. The Ministry of Justice attributes the rise in asylum appeals to the Home Office clearing its backlog of older claims.`
      },
      {
        question: "How many asylum appeals succeed?",
        answer: `${appeals.allowedRatePct}% of appeals decided at a hearing or on paper were allowed in ${coverage}, against ${appeals.allowedRatePctPrevious}% a year earlier. Appeals that are withdrawn or struck out are not in that rate.`
      },
      {
        question: "Where does someone live while their appeal is heard?",
        answer: "A refused asylum seeker with a pending appeal generally stays on asylum support until the appeal is decided, so a longer tribunal wait means longer in Home Office accommodation, including hotels."
      }
    ],
    relatedFindings: ["home-office-appeal-uplift-may2026", "true-cost-of-asylum"],
    relatedExplainers: ["uk-asylum-grant-rate", "how-many-asylum-seekers-are-waiting-for-a-decision"],
    relatedPages: [{ href: "/routes/", label: "Tribunal figures in full" }]
  };
}

export function systemExplainers(): Explainer[] {
  return [howManyAsylumSeekers(), waitingForADecision(), smallBoatCrossings(), grantRate(), appealWaitingTime()];
}
