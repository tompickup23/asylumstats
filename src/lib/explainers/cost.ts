/**
 * Hotel, cost and support explainers. The hotel population comes from the quarterly
 * statistics; the costs, rates and site counts from the sourced constants in
 * official-figures.ts, which record what each one measures and when.
 */
import { loadRouteDashboard, loadLocalRouteLatest } from "../route-data";
import { buildPlacePath } from "../site";
import { fmtInt, formatLongDate } from "../headline-figures";
import {
  COST_PER_NIGHT,
  HOTEL_COST_RISE_REASON,
  HOTEL_EXITS_2026,
  HOTEL_SITE_COUNTS,
  LARGE_SITES,
  SUPPORT_CHARGE,
  SUPPORT_RATES,
  gbp
} from "../official-figures";
import type { Explainer } from "./types";

function hotelPopulation() {
  const series = loadRouteDashboard().nationalSystemDynamics.stockSeries.hotelAccommodation;
  const last = series.at(-1);
  if (!last) throw new Error("Explainer data missing: hotel population series");
  const peak = series.reduce((max, point) => (point.value > max.value ? point : max));
  return { series, last, peak };
}

function hotelCostPerNight(): Explainer {
  const { hotel2026, hotelPerBed2026, dispersal2026, hotel2025, dispersal2025, wethersfield2025 } = COST_PER_NIGHT;
  const { series, last } = hotelPopulation();

  return {
    slug: "asylum-hotel-cost-per-night",
    topic: "accommodation",
    question: "How much does an asylum hotel cost per night?",
    seoTitle: `Asylum hotel cost per night: ${gbp(hotel2026.value)} (${hotel2026.appliesTo})`,
    seoDescription: `The Home Office puts an asylum hotel at ${gbp(hotel2026.value)} per person per night in ${hotel2026.appliesTo}, up from ${gbp(hotel2025.value)} in June 2025. Why it has risen.`,
    figure: gbp(hotel2026.value),
    figureLabel: `per person per night in a hotel, ${hotel2026.appliesTo}`,
    answer:
      `The Home Office put the cost of housing one person in an asylum hotel at ${gbp(hotel2026.value)} a night in ${hotel2026.appliesTo}, ` +
      `including VAT, against ${gbp(dispersal2026.value)} in dispersal housing. That is up from ${gbp(hotel2025.value)} at the ${hotel2025.appliesTo}. ` +
      "The department says it is still paying for empty rooms as hotels wind down.",
    asAt: "2026-04-30",
    asAtLabel: hotel2026.appliesTo,
    published: hotel2026.published,
    sources: [
      { label: hotel2026.source, url: hotel2026.url },
      { label: hotel2025.source, url: hotel2025.url }
    ],
    keyFigures: [
      { label: hotel2026.label, value: gbp(hotel2026.value), note: hotel2026.appliesTo },
      { label: hotelPerBed2026.label, value: gbp(hotelPerBed2026.value), note: hotelPerBed2026.appliesTo },
      { label: dispersal2026.label, value: gbp(dispersal2026.value), note: dispersal2026.appliesTo },
      { label: hotel2025.label, value: gbp(hotel2025.value), note: hotel2025.appliesTo },
      { label: dispersal2025.label, value: gbp(dispersal2025.value), note: dispersal2025.appliesTo },
      { label: wethersfield2025.label, value: gbp(wethersfield2025.value), note: wethersfield2025.appliesTo },
      { label: "People in asylum hotels", value: fmtInt(last.value), note: formatLongDate(last.periodEnd) }
    ],
    chart: {
      title: "People in asylum hotels, quarter end",
      description: `${series[0].periodLabel} to ${last.periodLabel}. Fewer people in the same rooms is what drives the cost per person up.`,
      points: series.map((point) => ({ label: point.periodLabel, value: point.value })),
      source: "Home Office, Asy_D11",
      sourceUrl: LARGE_SITES.occupancyUrl
    },
    basis: [
      `The per person figure divides what the Home Office pays for its hotels by the people staying in them. The same letter gives ${gbp(hotelPerBed2026.value)} per bed, which divides by capacity instead. The gap between the two is the cost of empty beds, and it widens as hotels empty ahead of closing.`,
      `The Home Office repeated ${gbp(Math.floor(hotel2025.value))} a night, without a date, in a press release on 30 June 2026. That was the cost at the ${hotel2025.appliesTo}, not the current one. The Migration Observatory's widely quoted ${gbp(170)} for 2024/25 is its own estimate, not a Home Office figure.`
    ],
    questions: [
      {
        question: "Why has the cost of an asylum hotel gone up?",
        answer: `Because hotels are emptying faster than they close. The Home Office's explanation, in its letter to the Home Affairs Committee: "${HOTEL_COST_RISE_REASON}". Occupancy fell to ${fmtInt(last.value)} people at ${formatLongDate(last.periodEnd)}.`
      },
      {
        question: "Is a hotel more expensive than other asylum housing?",
        answer: `Much more. In ${dispersal2026.appliesTo} a hotel cost ${gbp(hotel2026.value)} per person per night and dispersal housing, ordinary flats and houses, ${gbp(dispersal2026.value)}. At the ${wethersfield2025.appliesTo} the former RAF Wethersfield site cost ${gbp(wethersfield2025.value)}, close to a hotel.`
      },
      {
        question: "What would a year in a hotel cost?",
        answer: `At ${gbp(hotel2026.value)} a night, one person for a year comes to about ${gbp(Math.round((hotel2026.value * 365) / 1000) * 1000)}, against about ${gbp(Math.round((dispersal2026.value * 365) / 100) * 100)} in dispersal housing. This is our arithmetic on the Home Office's nightly figures, not a figure it publishes.`
      }
    ],
    relatedFindings: ["daily-hotel-cost", "hotel-budget-share", "profit-share-thresholds-exceeded"],
    relatedExplainers: ["how-many-asylum-hotels-are-there", "how-much-do-asylum-seekers-get-a-week"],
    relatedPages: [{ href: "/what-the-home-office-publishes/", label: "What the Home Office publishes on spending" }]
  };
}

function hotelsInUse(): Explainer {
  const { series, last, peak } = hotelPopulation();
  const latestCount = HOTEL_SITE_COUNTS.at(-1)!;
  const january = HOTEL_SITE_COUNTS.find((row) => row.appliesTo === "5 January 2026")!;
  const peakCount = HOTEL_SITE_COUNTS[0];
  const exits = HOTEL_EXITS_2026.april + HOTEL_EXITS_2026.june + HOTEL_EXITS_2026.august;
  const supported = loadRouteDashboard().nationalSystemDynamics.latestQuarter;
  if (supported.hotelShareOfSupportPct === null) throw new Error("Explainer data missing: hotel share of support");
  const hotelShare = supported.hotelShareOfSupportPct;
  const areas = [...loadLocalRouteLatest().areas]
    .filter((area) => (area.contingencyAccommodation ?? 0) > 0)
    .sort((a, b) => (b.contingencyAccommodation ?? 0) - (a.contingencyAccommodation ?? 0))
    .slice(0, 10);
  const asAt = formatLongDate(last.periodEnd);
  const label = (row: (typeof HOTEL_SITE_COUNTS)[number]) => `${row.qualifier ? `${row.qualifier} ` : ""}${row.value}`;

  return {
    slug: "how-many-asylum-hotels-are-there",
    topic: "accommodation",
    question: "How many asylum hotels are there in the UK?",
    seoTitle: `How many asylum hotels are there? Fewer than ${latestCount.value}`,
    seoDescription: `Fewer than ${latestCount.value} hotels housed asylum seekers on ${latestCount.appliesTo}, down from over ${peakCount.value} in 2023. ${fmtInt(last.value)} people were in them at ${asAt}.`,
    figure: `Under ${latestCount.value}`,
    figureLabel: `asylum hotels in use, ${latestCount.appliesTo}`,
    answer:
      `Fewer than ${latestCount.value} hotels were housing asylum seekers on ${latestCount.appliesTo}, according to the Home Office, ` +
      `down from ${january.value} in January 2026 and over ${peakCount.value} at the peak in ${peakCount.appliesTo}. ` +
      `They held ${fmtInt(last.value)} people at ${asAt}, against ${fmtInt(peak.value)} at the peak on ${formatLongDate(peak.periodEnd)}.`,
    asAt: "2026-08-12",
    asAtLabel: latestCount.appliesTo,
    published: latestCount.published,
    sources: [
      { label: latestCount.source, url: latestCount.url },
      { label: "Home Office, immigration system statistics: asylum support (Asy_D11)", url: LARGE_SITES.occupancyUrl }
    ],
    keyFigures: [
      ...HOTEL_SITE_COUNTS.map((row) => ({ label: `${row.label}, ${row.appliesTo}`, value: label(row), note: row.source })),
      { label: "Hotels exited in 2026", value: fmtInt(exits), note: "announced April, June and August" },
      { label: "People in hotels", value: fmtInt(last.value), note: asAt },
      { label: "Share of people on asylum support", value: `${hotelShare.toFixed(1)}%`, note: asAt }
    ],
    chart: {
      title: "People in asylum hotels, quarter end",
      description: `${series[0].periodLabel} to ${last.periodLabel}. People, not hotels: the Home Office publishes no quarterly count of sites.`,
      points: series.map((point) => ({ label: point.periodLabel, value: point.value })),
      source: "Home Office, Asy_D11",
      sourceUrl: LARGE_SITES.occupancyUrl
    },
    basis: [
      "The Home Office does not publish a regular count of hotels. The site counts here come from ministers' statements, a response to the Home Affairs Committee and Home Office press releases, each on its own date, so they show the direction rather than a smooth series.",
      "The number of people in hotels is published every quarter, and is the more reliable measure of how much the system depends on them. The Home Office does not publish which hotels it uses."
    ],
    questions: [
      {
        question: "Where are the asylum hotels?",
        answer: `The Home Office does not name them. Its local authority statistics show where people in contingency accommodation, which is mostly hotels, are placed: ${areas[0].areaName}, ${areas[1].areaName} and ${areas[2].areaName} had the most at ${asAt}.`
      },
      {
        question: "What is replacing asylum hotels?",
        answer: `Mainly dispersal housing, and a small number of large sites. At ${LARGE_SITES.occupancyDate}, ${fmtInt(LARGE_SITES.wethersfield.people)} people were at Wethersfield in Essex and ${fmtInt(LARGE_SITES.crowborough.people)} at Crowborough Training Camp in East Sussex. Three more military sites are proposed that could house around ${fmtInt(LARGE_SITES.proposedCapacity)}.`
      },
      {
        question: "How much does an asylum hotel cost?",
        answer: `${gbp(COST_PER_NIGHT.hotel2026.value)} per person per night in ${COST_PER_NIGHT.hotel2026.appliesTo}, according to the Home Office, against ${gbp(COST_PER_NIGHT.dispersal2026.value)} in dispersal housing.`
      }
    ],
    areas: {
      title: "Where people in contingency accommodation are placed",
      note: `The ten local authorities with the most people in contingency accommodation, mostly hotels, at ${asAt}. Rate per 10,000 residents.`,
      rows: areas.map((area) => ({
        name: area.areaName,
        href: buildPlacePath(area),
        value: fmtInt(area.contingencyAccommodation ?? 0),
        detail:
          area.contingencyAccommodationRate !== null && area.contingencyAccommodationRate !== undefined
            ? `${area.contingencyAccommodationRate.toFixed(1)} per 10,000`
            : undefined
      }))
    },
    relatedFindings: ["hotel-budget-share", "daily-hotel-cost", "three-providers-monopoly"],
    relatedExplainers: ["asylum-hotel-cost-per-night", "how-many-asylum-seekers-are-in-the-uk"],
    relatedPages: [{ href: "/places/", label: "Every local authority" }]
  };
}

function weeklyAllowance(): Explainer {
  const { standard, catered, pregnant, underOne, oneToThree, maternity } = SUPPORT_RATES;
  const perDay = standard.value / 7;

  return {
    slug: "how-much-do-asylum-seekers-get-a-week",
    topic: "accommodation",
    question: "How much do asylum seekers get a week?",
    seoTitle: `How much do asylum seekers get a week? ${gbp(standard.value)}`,
    seoDescription: `Asylum seekers on Home Office support get ${gbp(standard.value)} a week each, or ${gbp(catered.value)} in full-board hotels. What it covers, and the extra payments.`,
    figure: gbp(standard.value),
    figureLabel: "a week per person, standard asylum support",
    answer:
      `Most asylum seekers on Home Office support get ${gbp(standard.value)} a week per person, about ${gbp(Math.round(perDay * 100) / 100)} a day, ` +
      `paid onto a prepaid card, and live in housing the Home Office provides. People in full-board hotels, where meals are provided, get ${gbp(catered.value)} a week. ` +
      "There are small extra payments for pregnancy and young children.",
    asAt: standard.published,
    asAtLabel: "September 2026",
    published: standard.published,
    sources: [
      { label: standard.source, url: standard.url },
      { label: catered.source, url: catered.url }
    ],
    keyFigures: [standard, catered, pregnant, underOne, oneToThree, maternity].map((rate) => ({
      label: rate.label,
      value: gbp(rate.value),
      note: rate.appliesTo
    })),
    basis: [
      "The allowance is for essential living needs such as food, clothing and toiletries. Accommodation, with utilities, is provided separately and is not paid in cash. Only people who would otherwise be destitute qualify.",
      `The standard rate is set in regulations and has been ${gbp(standard.value)} since 15 January 2024. The full-board rate is Home Office policy and rose from £8.86 to ${gbp(catered.value)} on 2 June 2025. Figures quoted at £8.86 or £40.85 are out of date.`
    ],
    questions: [
      {
        question: "Has the asylum allowance gone up?",
        answer: `Not since January 2024. The Home Office's 2024 review, published in November 2025, left the standard rate at ${gbp(standard.value)} and raised the full-board rate from £8.86 to ${gbp(catered.value)}. The rate before January 2024 was £40.85.`
      },
      {
        question: "Will asylum seekers have to pay back their support?",
        answer: `The Immigration and Asylum Bill 2026 would let the Home Office charge adults who have the means a flat rate expected to be around ${gbp(SUPPORT_CHARGE.value)}, paid monthly above a threshold, before they can settle. It would apply only to people who claim after it comes into force.`
      },
      {
        question: "How does the allowance compare with the cost of housing?",
        answer: `The weekly allowance is a small part of the cost. In ${COST_PER_NIGHT.hotel2026.appliesTo} the Home Office put a hotel at ${gbp(COST_PER_NIGHT.hotel2026.value)} a night per person, and dispersal housing at ${gbp(COST_PER_NIGHT.dispersal2026.value)} a night.`
      }
    ],
    relatedFindings: ["true-cost-of-asylum", "ho-publishes-one-pound-in-nine"],
    relatedExplainers: ["asylum-hotel-cost-per-night", "how-many-asylum-seekers-are-in-the-uk"],
    relatedPages: [{ href: "/spending/", label: "Where the asylum money goes" }]
  };
}

export function costExplainers(): Explainer[] {
  return [hotelsInUse(), hotelCostPerNight(), weeklyAllowance()];
}
