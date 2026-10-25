/**
 * Official figures that arrive as prose rather than as a dataset: ministerial letters,
 * statutory instruments, press releases. Each one is typed in here once, with the date it
 * applies to, the date it was published, the source and its basis, and read from here by
 * every page that prints it.
 *
 * Initial values were read off primary sources on 27 Sep 2026. Later additions
 * record their own retrieval dates. Three press-reported
 * versions were wrong and are recorded so they are not reintroduced:
 *   - the catered support rate is £9.95, not £8.86 (raised 2 June 2025);
 *   - the Home Office's £144 hotel figure, repeated undated in its 30 June 2026 press
 *     release, is the end of June 2025 cost, from a letter of 8 October 2025;
 *   - there is no official count of 160 hotels at the end of June 2026. "Less than 160"
 *     is dated 12 August 2026.
 *
 * Basis rule (see CLAUDE.md): these may be set beside the quarterly statistics with both
 * named, never summed with them or drawn as one series.
 */

export interface OfficialFigure {
  value: number;
  /** What the figure is, in a phrase a reader can check against the source. */
  label: string;
  /** The date or period the figure describes, as the source states it. */
  appliesTo: string;
  /** ISO date the source was published. */
  published: string;
  source: string;
  url: string;
}

const HAC_LETTER_AUG_2026 = {
  source: "Anna Turley MP, letter to the Home Affairs Committee, 26 August 2026",
  url: "https://committees.parliament.uk/publications/55072/documents/305271/default/",
  published: "2026-09-17"
};
const HAC_LETTER_OCT_2025 = {
  source: "Alex Norris MP, letter to the Home Affairs Committee, 8 October 2025",
  url: "https://committees.parliament.uk/publications/49663/documents/265736/default/",
  published: "2025-10-14"
};

/** Cost per person per night, including VAT. */
export const COST_PER_NIGHT = {
  hotel2026: { value: 199, label: "Contingency hotel, per person per night", appliesTo: "April 2026", ...HAC_LETTER_AUG_2026 },
  hotelPerBed2026: { value: 95, label: "Contingency hotel, per bed per night", appliesTo: "April 2026", ...HAC_LETTER_AUG_2026 },
  dispersal2026: { value: 25, label: "Dispersal housing, per person per night", appliesTo: "April 2026", ...HAC_LETTER_AUG_2026 },
  hotel2025: { value: 144.98, label: "Contingency hotel, per person per night", appliesTo: "end of June 2025", ...HAC_LETTER_OCT_2025 },
  dispersal2025: { value: 23.25, label: "Dispersal housing, per person per night", appliesTo: "end of June 2025", ...HAC_LETTER_OCT_2025 },
  wethersfield2025: { value: 132, label: "Wethersfield, per person per night", appliesTo: "end of June 2025", ...HAC_LETTER_OCT_2025 }
} satisfies Record<string, OfficialFigure>;

/** The reason the April 2026 letter gives for the per-person rise, verbatim. */
export const HOTEL_COST_RISE_REASON =
  "As occupancy falls ahead of full site closure, the department continues to incur costs for some unoccupied rooms";

const SUPPORT_PAGE = {
  source: "GOV.UK, Asylum support: what you'll get",
  url: "https://www.gov.uk/asylum-support/what-youll-get",
  published: "2026-09-09"
};

/** Weekly asylum support, per person. */
export const SUPPORT_RATES = {
  standard: {
    value: 49.18,
    label: "Standard weekly allowance, per person",
    appliesTo: "since 15 January 2024 (SI 2023/1372)",
    ...SUPPORT_PAGE
  },
  catered: {
    value: 9.95,
    label: "Full-board accommodation, per person",
    appliesTo: "since 2 June 2025, up from £8.86",
    source: "Home Office, 2024 asylum support rate review",
    url: "https://www.gov.uk/government/publications/report-on-review-of-cash-allowance-paid-to-asylum-seekers",
    published: "2025-11-13"
  },
  pregnant: { value: 5.25, label: "Extra weekly payment, pregnant", appliesTo: "since 15 January 2024", ...SUPPORT_PAGE },
  underOne: { value: 9.5, label: "Extra weekly payment, baby under 1", appliesTo: "since 15 January 2024", ...SUPPORT_PAGE },
  oneToThree: { value: 5.25, label: "Extra weekly payment, child aged 1 to 3", appliesTo: "since 15 January 2024", ...SUPPORT_PAGE },
  maternity: { value: 300, label: "One-off maternity payment", appliesTo: "since 15 January 2024", ...SUPPORT_PAGE }
} satisfies Record<string, OfficialFigure>;

/**
 * Home Office funding instructions, read on GOV.UK on 25 October 2026.
 * Schedule 1 paragraphs 1.2 to 1.4, verbatim below. Crown copyright, reused
 * under the Open Government Licence v3.0. URLs are in ASYLUM_DISPERSAL_GRANT.
 *
 * 2025 to 2026:
 * 1.2. This payment is intended to recognise the existing contribution and longstanding support from local authorities. Each Recipient accommodating Asylum Seekers determined by a report run by the Authority on 30 March 2025 will receive a £1200 payment per Asylum Seeker in all accommodation types across Dispersal Accommodation (DA), Overflow Dispersal Accommodation (ODA), Initial Accommodation (IA), and Contingency Accommodation (CA). This Funding will be paid by 30 June 2025.
 * 1.3. A payment of £100 per Month, for each additional occupied bed space between 01 April 2025 and 31 March 2026 (should occupancy increase above the 31 March 2025 figure).
 * 1.4. This Funding is payable for all Asylum Accommodation types (DA, ODA, IA, CA, Medium Sites and in LA-led asylum accommodation through pilots). For Medium Sites and LA-led accommodation, payments will be calculated for additional bedspaces over the occupancy figure of zero. Funding eligibility will be assessed Monthly, and the Funding will be paid quarterly in arrears throughout the Financial Year.
 *
 * 2026 to 2027:
 * 1.2 This payment is intended to recognise the existing contribution and longstanding support from local authorities. Each Recipient accommodating Asylum Seekers determined by a report run by the Authority on 30 March 2026 will receive a £1200 payment per Asylum Seeker in all accommodation types across Dispersal Accommodation (DA), Overflow Dispersal Accommodation (ODA), Initial Accommodation (IA), and Contingency Accommodation (CA). This Funding will be paid by 30 June 2026.
 * 1.3 A payment of £100 per Month, for each additional occupied bed space between 01 April 2026 and 31 March 2027 (should occupancy increase above the 30 March 2026 figure).
 * 1.4 This Funding is payable for all Asylum Accommodation types (DA, ODA, IA, CA). Funding eligibility will be assessed Monthly, and the Funding will be paid quarterly in arrears throughout the Financial Year.
 *
 * The older instruction has conflicting 30/31 March baseline wording. Do not
 * resolve that by guessing. The current instruction uses 30 March throughout.
 * Definition 1.2 excludes Large Sites CA; clause 3.2 covers England, Scotland
 * and Wales. Current quarterly stocks cannot establish the actual grant paid.
 */
export const ASYLUM_DISPERSAL_GRANT = {
  value: 1200,
  label: "Annual grant per eligible person at the baseline",
  appliesTo: "2026 to 2027",
  baselineDate: "2026-03-30",
  published: "2026-03-31",
  retrieved: "2026-10-25",
  additionalBedMonthly: 100,
  source: "Home Office, Asylum Dispersal Grant funding instruction, Schedule 1 paragraphs 1.2 to 1.4",
  url: "https://www.gov.uk/government/publications/asylum-dispersal-grant-funding-instruction/funding-instruction-for-local-authorities-asylum-dispersal-grant-2026-2027-accessible-version",
  previousUrl: "https://www.gov.uk/government/publications/asylum-dispersal-grant-funding-instruction/funding-instruction-for-local-authorities-asylum-grant-2025-2026",
  previousIssued: "2025-03-31",
  previousPageUpdated: "2026-03-31",
  licence: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
} satisfies OfficialFigure & Record<string, string | number>;

/** Hotels in use: sites, not people. Mixed sources, so each carries its own. */
export const HOTEL_SITE_COUNTS: Array<OfficialFigure & { qualifier: string }> = [
  {
    value: 400,
    qualifier: "over",
    label: "Hotels in use at the peak",
    appliesTo: "summer 2023",
    source: "Government response to the Home Affairs Committee, HC 1642",
    url: "https://committees.parliament.uk/publications/51202/documents/284170/default/",
    published: "2026-01-22"
  },
  {
    value: 200,
    qualifier: "fewer than",
    label: "Hotels in use",
    appliesTo: "17 November 2025",
    source: "Home Secretary, House of Commons, 17 November 2025",
    url: "https://hansard.parliament.uk/commons/2025-11-17/debates/527CB714-58DE-4B8E-8CFD-3C166FFE0D9D/ChannelCrossings",
    published: "2025-11-17"
  },
  {
    value: 197,
    qualifier: "",
    label: "Hotels in use",
    appliesTo: "5 January 2026",
    source: "Government response to the Home Affairs Committee, HC 1642",
    url: "https://committees.parliament.uk/publications/51202/documents/284170/default/",
    published: "2026-01-22"
  },
  {
    value: 160,
    qualifier: "fewer than",
    label: "Hotels in use",
    appliesTo: "12 August 2026",
    source: "Home Office, 13 asylum hotels exited and returned to local communities",
    url: "https://www.gov.uk/government/news/13-asylum-hotels-exited-and-returned-to-local-communities",
    published: "2026-08-12"
  }
];

/** Hotels closed in 2026, by the month the Home Office announced the exits. */
export const HOTEL_EXITS_2026 = { april: 11, june: 20, august: 13 };

/** Large sites. Occupancy is from the year ending June 2026 statistics release. */
export const LARGE_SITES = {
  occupancyDate: "30 June 2026",
  occupancySource: "Home Office, immigration system statistics, year ending June 2026",
  occupancyUrl:
    "https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-june-2026/how-many-people-are-in-the-uk-asylum-system",
  wethersfield: {
    people: 744,
    bedspaces: 1245,
    factsheet: "https://www.gov.uk/government/publications/asylum-accommodation-at-military-sites-factsheets/wethersfield-essex-factsheet"
  },
  crowborough: {
    people: 418,
    capacity: 540,
    opened: "22 January 2026",
    factsheet:
      "https://www.gov.uk/government/publications/asylum-accommodation-at-military-sites-factsheets/crowborough-training-camp-east-sussex-factsheet"
  },
  proposedCapacity: 3750
};

/** The flat-rate support charge in the Immigration and Asylum Bill 2026. */
export const SUPPORT_CHARGE = {
  value: 10000,
  pressRelease: "https://www.gov.uk/government/news/asylum-seekers-will-pay-towards-costs-of-accommodation",
  pressReleaseDate: "2026-06-30",
  impactAssessment: "https://www.gov.uk/government/publications/immigration-and-asylum-bill-2026-impact-assessment",
  bill: "https://bills.parliament.uk/bills/4254"
};

/** UK-France returns agreement, 6 August 2025 to 30 June 2026. */
export const UK_FRANCE = {
  returned: 1087,
  transferredToUk: 1117,
  periodStart: "2025-08-06",
  periodEnd: "2026-06-30",
  returnsByMonth: [
    ["Sep 2025", 17], ["Oct 2025", 58], ["Nov 2025", 78], ["Dec 2025", 64], ["Jan 2026", 88],
    ["Feb 2026", 49], ["Mar 2026", 109], ["Apr 2026", 142], ["May 2026", 218], ["Jun 2026", 264]
  ] as Array<[string, number]>,
  source: "Home Office, transfers into and returns from the UK under the UK-France agreement",
  url: "https://www.gov.uk/government/publications/the-border-security-commanders-annual-report-data/transfers-into-and-returns-from-the-united-kingdom-under-the-uk-france-agreement-on-the-prevention-of-dangerous-journeys-between-6-august-2025-and-30",
  published: "2026-07-16",
  extensionEnds: "1 October 2026",
  extensionUrl:
    "https://www.gov.uk/government/publications/ukfrance-exchange-of-letters-amending-and-extending-the-agreement-on-the-prevention-of-dangerous-journeys-ts-no252026"
};

export const gbp = (value: number) =>
  `£${value.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
