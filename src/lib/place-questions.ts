/**
 * The questions a place page answers, in the words people search.
 *
 * These target the three queries this page type exists for: "how many asylum seekers in
 * [area]", "asylum seekers per 10,000 [area]" and "asylum hotels in [area]". Every answer
 * is built from the same data the page renders, so it cannot drift from the figures
 * above it, and every answer leads with the answer.
 *
 * Length is held to roughly 40-60 words on purpose. That is what fits a featured snippet
 * whole, and a snippet that is cut off mid-clause is worse than one that never appeared,
 * because the reader sees an incomplete number.
 */
import { formatFindingDate } from "./finding-dates";
import { formatOrdinal } from "./route-analytics";

export interface PlaceQuestionInput {
  areaName: string;
  supportedAsylum: number;
  ratePer10k: number | null;
  rank: number;
  areaCount: number;
  /** Percentile of the rate across all areas, 0-100. */
  ratePercentile: number;
  contingencyAccommodation: number;
  subsistenceOnly: number;
  /** Hotels named in the ledger and currently in use. */
  namedHotelNames: string[];
  /** Sites the Home Office is known to use in the area but has not named. */
  unnamedSiteCount: number;
  /** The AASC prime provider for the region, where one is identified. */
  primeProviderName: string | null;
  /** ISO date the figures describe, e.g. the quarter end. */
  snapshotDate: string;
}

export interface AskedAndAnswered {
  question: string;
  answer: string;
}

export function buildPlaceQuestions(input: PlaceQuestionInput): AskedAndAnswered[] {
  const {
    areaName, supportedAsylum, ratePer10k, rank, areaCount, ratePercentile,
    contingencyAccommodation, subsistenceOnly, namedHotelNames, unnamedSiteCount,
    primeProviderName, snapshotDate
  } = input;

  const when = formatFindingDate(snapshotDate);
  const count = supportedAsylum.toLocaleString("en-GB");
  const items: AskedAndAnswered[] = [];

  items.push({
    question: `How many asylum seekers are in ${areaName}?`,
    answer:
      supportedAsylum === 0
        ? `None. ${areaName} recorded nobody receiving Home Office asylum support at ${when}, ` +
          `the most recent quarter published. Dozens of UK councils carry no supported ` +
          `asylum population at all, and the figure can move to and from zero between ` +
          `quarters as the Home Office moves people between areas.`
        : `${count} ${supportedAsylum === 1 ? "person was" : "people were"} receiving Home ` +
          `Office asylum support in ${areaName} at ${when}, the most recent quarter ` +
          `published. That ranks ${formatOrdinal(rank)} of ${areaCount} UK local ` +
          `authorities. It counts people on support at that date, which is not the number ` +
          `who claimed asylum there and not the number waiting for a decision.`
  });

  if (typeof ratePer10k === "number" && ratePer10k > 0) {
    const heavier = ratePercentile >= 50;
    items.push({
      question: `How many asylum seekers per 10,000 people are in ${areaName}?`,
      answer:
        `${ratePer10k.toLocaleString("en-GB")} per 10,000 residents, which places ${areaName} ` +
        `in the ${formatOrdinal(ratePercentile)} percentile of UK local authorities. ` +
        `${heavier
          ? `It carries more people on asylum support per head than ${ratePercentile}% of the country.`
          : `It carries fewer per head than ${100 - ratePercentile}% of the country.`} ` +
        `Rate is the fair comparison between areas, because a large city carries more ` +
        `people than a small district at the same pressure per head.`
    });
  }

  // The hotel question has three genuinely different answers, and the honest one where
  // the Home Office has published nothing is the point of the page rather than a gap in
  // it. Never imply an area has no hotels when what is true is that none is named.
  if (namedHotelNames.length > 0) {
    const names = listOf(namedHotelNames);
    items.push({
      question: `Are there asylum hotels in ${areaName}?`,
      answer:
        `Yes. ${namedHotelNames.length === 1 ? "One site is" : `${namedHotelNames.length} sites are`} ` +
        `named in the public record for ${areaName}: ${names}.` +
        (unnamedSiteCount > 0
          ? ` A further ${unnamedSiteCount} ${unnamedSiteCount === 1 ? "site is" : "sites are"} ` +
            `recorded without a name, because the Home Office does not publish hotel addresses.`
          : ` The Home Office does not publish hotel addresses, so named sites come from ` +
            `council papers, parliamentary answers and reporting rather than from the department.`)
    });
  } else if (contingencyAccommodation > 0) {
    items.push({
      question: `Are there asylum hotels in ${areaName}?`,
      answer:
        `The Home Office does not say. ${contingencyAccommodation.toLocaleString("en-GB")} ` +
        `${contingencyAccommodation === 1 ? "person" : "people"} in ${areaName} were in ` +
        `contingency accommodation at ${when}, and contingency accommodation is the category ` +
        `that includes hotels. No site in the area has been named in council papers, a ` +
        `parliamentary answer or published reporting, so the buildings are not identifiable.`
    });
  } else if (supportedAsylum > 0) {
    items.push({
      question: `Are there asylum hotels in ${areaName}?`,
      answer:
        `Not on the published figures. ${areaName} recorded nobody in contingency ` +
        `accommodation at ${when}, which is the category that includes hotels. The ` +
        `${supportedAsylum.toLocaleString("en-GB")} ${supportedAsylum === 1 ? "person" : "people"} ` +
        `on asylum support there ${supportedAsylum === 1 ? "is" : "are"} recorded in ` +
        `dispersal housing or on subsistence-only support.`
    });
  }

  if (primeProviderName && supportedAsylum > 0) {
    items.push({
      question: `Who houses asylum seekers in ${areaName}?`,
      answer:
        `${primeProviderName} holds the Home Office asylum accommodation contract for the ` +
        `region ${areaName} sits in, under the Asylum Accommodation and Support Contracts. ` +
        `The contract covers a whole region rather than a single council, and the Home ` +
        `Office does not publish a council-by-council split of which properties sit under it.`
    });
  }

  if (subsistenceOnly > 0 && supportedAsylum > 0) {
    const share = Math.round((subsistenceOnly / supportedAsylum) * 100);
    items.push({
      question: `Are all of them in Home Office accommodation in ${areaName}?`,
      answer:
        `No. ${subsistenceOnly.toLocaleString("en-GB")} of the ${count} on support in ` +
        `${areaName}, about ${share}%, receive subsistence only: a cash payment with no ` +
        `accommodation, usually because they are living with friends or family. The rest ` +
        `are in Home Office accommodation, which covers dispersal housing and hotels.`
    });
  }

  return items;
}

function listOf(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
