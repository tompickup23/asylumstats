import araCosts from "../../data/marts/home_office_ara/asylum-costs.json";
import routeDashboard from "../data/live/route-dashboard.json";

/**
 * True Cost v3. The one place an asylum cost figure is derived.
 *
 * ── Why v3 exists ────────────────────────────────────────────────────────────
 *
 * The site stated this quantity five different ways. Checking the arithmetic showed
 * they were not five errors, which matters for what the fix had to be:
 *
 *   £207 headline      = £7,087m / 34.1M  (v2 conservative)
 *   £230 summary, £236 = £8,050m / 34.1M  (v2 central)
 *   £8B+, £8.1B nav    = £8,050m          (v2 central total)
 *   £155 / £169 / £5.3-6.3B on the homepage = v1, the 10-category edition that the
 *                        finding itself says it superseded in April 2026
 *
 * So the finding was internally consistent across three confidence columns, and the
 * homepage was simply a year out of date. The failure was not bad arithmetic, it was
 * four surfaces each holding their own copy of a number. Hence one module, imported.
 *
 * ── What changed in the numbers ──────────────────────────────────────────────
 *
 * v2 built the Home Office block from NAO reports, factsheets and estimates. v3 replaces
 * it with the audited outturn in the Annual Report and Accounts 2025-26 (HC 440), which
 * the site did not previously use. The rest of the system, which other departments pay
 * for and nobody publishes as an asylum total, stays as estimates and is labelled as
 * such on the page.
 *
 * ── The two traps, both live on this site before ──────────────────────────────
 *
 * 1. DOUBLE COUNTING. Detention (£159.3m) is an expense TYPE that sits inside the
 *    Immigration Enforcement SEGMENT (£769.8m). Adding both counts it twice. Likewise
 *    "asylum costs excluding grants" (£2,962m) sits inside ASRA (£4,181m). This module
 *    only ever totals segments, never types, and `assertNoDoubleCount` enforces it.
 *
 * 2. MIXING BASES. £150 per person per day was not arbitrary: it was £5.3bn / 97,519 /
 *    365, total-system cost expressed per supported person. That conflates costs
 *    incurred for people who are NOT on asylum support (post-decision welfare, family
 *    reunion, foreign national offenders) with the population on support. So the
 *    per-area figure here is deliberately NOT the system total. It is the audited
 *    accommodation and support cost, which is the cost that actually scales with the
 *    number of people supported in an area. The two are exported under names that make
 *    the basis unmissable, and `perSupportedPersonPerDay` is the only one a place page
 *    may use.
 */

const THOUSAND = 1_000;

/** HMRC projected individual income taxpayers 2024-25, Table 2.1 (Nov 2024 forecast). */
export const UK_TAXPAYERS = 34_100_000;
export const UK_TAXPAYERS_SOURCE =
  "https://www.gov.uk/government/statistics/income-tax-liabilities-statistics";

/**
 * People on asylum support at the latest published quarter end.
 *
 * A CURRENT fact, for stating how many people are supported today. It is deliberately
 * NOT the denominator of any cost rate: see the financial-year mean below.
 */
export const SUPPORTED_ASYLUM_POPULATION =
  routeDashboard.nationalSystemDynamics.latestQuarter.supportedAsylum;
export const SUPPORTED_ASYLUM_AS_AT = routeDashboard.localSnapshotDate;

/**
 * The financial year the ASRA outturn covers, parsed from the accounts provenance rather
 * than written down twice. "2025-26" means 1 April 2025 to 31 March 2026.
 */
const [ASRA_FY_START_YEAR] = araCosts._provenance.financialYear.split("-").map(Number);
export const ASRA_FY_OPENS = `${ASRA_FY_START_YEAR}-03-31`;
export const ASRA_FY_CLOSES = `${ASRA_FY_START_YEAR + 1}-03-31`;

/**
 * Mean supported population across the financial year the cost covers.
 *
 * ── Why this is not the latest quarter ───────────────────────────────────────
 *
 * ASRA is a FULL YEAR of spending. Dividing it by a single quarter-end stock answers a
 * different question, and it is the same mistake that put £276 a night and £100,740 a
 * year on the homepage: a 2024/25 cost over a March 2026 population. Here the endpoint
 * happens to be the LOWEST point in the year (97,519 against a 106,719 mean, because
 * supported numbers fell hard through 2025-26), so the endpoint basis overstated the
 * rate by about 9%, £117 a night against £107.
 *
 * Averaging a stock over a period is a trapezoid: opening and closing balances count
 * half, the quarter-ends between them count whole.
 *
 * ── Why it is pinned to a closed year ────────────────────────────────────────
 *
 * The window is fixed by the accounts, not by "latest". When the next quarterly release
 * lands, the series gains a point outside this window and every figure below is
 * unchanged. Nothing drifts between refreshes without someone re-transcribing the
 * accounts, which is the only event that should move an audited cost rate.
 */
const supportedSeries = routeDashboard.nationalSystemDynamics.stockSeries
  .supportedAsylum as Array<{ periodEnd: string; value: number }>;

const asraYearPoints = supportedSeries
  .filter((point) => point.periodEnd >= ASRA_FY_OPENS && point.periodEnd <= ASRA_FY_CLOSES)
  .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

// Fail loudly rather than quietly averaging a partial year. A cost rate built on three
// quarters of a five-point year is wrong in a way no range check would catch.
if (asraYearPoints.length !== 5) {
  throw new Error(
    `True Cost: expected 5 quarter-end supported-population points from ${ASRA_FY_OPENS} to ` +
      `${ASRA_FY_CLOSES} to average the ${araCosts._provenance.financialYear} ASRA outturn, ` +
      `found ${asraYearPoints.length} (${asraYearPoints.map((p) => p.periodEnd).join(", ")}). ` +
      `Either the accounts moved to a new financial year and need re-transcribing, or the ` +
      `supported-population series no longer covers it. See src/lib/true-cost.ts.`
  );
}

export const SUPPORTED_ASYLUM_MEAN_OVER_ASRA_YEAR = Math.round(
  asraYearPoints.reduce(
    (total, point, index) =>
      total + (index === 0 || index === asraYearPoints.length - 1 ? point.value / 2 : point.value),
    0
  ) /
    (asraYearPoints.length - 1)
);

export type CostBasis = "audited" | "attributed" | "published" | "estimated";

/**
 * What kind of quantity a category is, which is a different question from how well
 * sourced it is.
 *
 * `basis` says whether a reader can check the figure. `kind` says what the figure
 * would mean if the asylum system did not exist, and the two are independent: an
 * audited line can still be an average attribution, and an estimate can still be a
 * genuinely marginal cost.
 *
 *   direct              - incurred because of this caseload and scaling with it.
 *                         Accommodation contracts, tribunal sitting days, ESOL
 *                         places. Remove the caseload and the cost goes with it.
 *   transfer            - a payment to a person. Marginal equals average by
 *                         construction, because a pound paid is a pound.
 *   average_attribution - an average cost per head of some wider population,
 *                         applied to this one. NHS spend per capita, funding per
 *                         pupil, cost per prison place.
 *
 * The last kind is the one that needs saying out loud. An average carries a share
 * of fixed capacity: hospital estate, school buildings, the prison estate. Those
 * costs do not fall away in proportion when the population using them does, so an
 * average-attributed figure overstates what the exchequer would actually stop
 * spending. It is a fair answer to "what share of public spending is associated
 * with this population" and the wrong answer to "what would we save".
 */
export type CostKind = "direct" | "transfer" | "average_attribution";

export interface CostCategory {
  id: string;
  label: string;
  /**
   * audited    - an outturn line in the Annual Report and Accounts
   * attributed - an audited total multiplied by a stated asylum share
   * published  - another body publishes the figure, but not as an asylum total
   * estimated  - our estimate, method shown in the finding
   */
  basis: CostBasis;
  /** See CostKind. Independent of `basis`. */
  kind: CostKind;
  conservative: number;
  central: number;
  upper: number;
  /** Shown on the page so a reader can see where a judgement was made. */
  note: string;
}

const araDirectorates = araCosts.directorates;

/** £ thousand in the accounts to £ million here. */
const toMillions = (thousands: number): number => Math.round(thousands / THOUSAND);

/**
 * Asylum share of a directorate whose work is only partly asylum.
 *
 * These three rates are the only judgement calls in the Home Office block, and they are
 * named here rather than buried in a spreadsheet so they can be argued with. v2 used
 * 50-60% for enforcement and a £350-650m range for border operations built the same way.
 */
const ATTRIBUTION = {
  immigrationEnforcement: { conservative: 0.4, central: 0.5, upper: 0.6 },
  borderForce: { conservative: 0.15, central: 0.2, upper: 0.25 }
} as const;

const attributed = (thousands: number, share: (typeof ATTRIBUTION)[keyof typeof ATTRIBUTION]) => ({
  conservative: Math.round(toMillions(thousands) * share.conservative),
  central: Math.round(toMillions(thousands) * share.central),
  upper: Math.round(toMillions(thousands) * share.upper)
});

const enforcementShare = attributed(
  araDirectorates.immigrationEnforcement.resourceOutturn,
  ATTRIBUTION.immigrationEnforcement
);
const borderForceShare = attributed(
  araDirectorates.borderForce.resourceOutturn,
  ATTRIBUTION.borderForce
);

const asra = toMillions(araDirectorates.asylumSupportResettlementAccommodation.resourceOutturn);
const borderSecurityCommand = toMillions(araDirectorates.borderSecurityCommand.resourceOutturn);

/**
 * The Home Office block: audited outturn, plus two stated attribution rates.
 */
const HOME_OFFICE_CATEGORIES: CostCategory[] = [
  {
    id: "asra",
    label: "Asylum support, resettlement and accommodation",
    basis: "audited",
    kind: "direct",
    conservative: asra,
    central: asra,
    upper: asra,
    note: "Audited resource outturn for the whole ASRA segment. Covers contracted accommodation and subsistence, resettlement schemes and the grants paid to local authorities, so it replaces three separately estimated lines in the previous edition. Down from £4,513m in 2024-25 and £5,425m in 2023-24."
  },
  {
    id: "border_security_command",
    label: "Border Security Command",
    basis: "audited",
    kind: "direct",
    conservative: borderSecurityCommand,
    central: borderSecurityCommand,
    upper: borderSecurityCommand,
    note: "Audited resource outturn, counted in full because the command exists to tackle small boats and organised immigration crime. Its budget rises to £797m in 2026-27."
  },
  {
    id: "immigration_enforcement",
    label: "Immigration enforcement, asylum share",
    basis: "attributed",
    kind: "direct",
    ...enforcementShare,
    note: `${ATTRIBUTION.immigrationEnforcement.conservative * 100}% to ${ATTRIBUTION.immigrationEnforcement.upper * 100}% of the audited £${toMillions(araDirectorates.immigrationEnforcement.resourceOutturn).toLocaleString()}m segment. Enforcement covers all immigration offending, not only asylum. Detention costs of £159m sit inside this segment and are not added separately.`
  },
  {
    id: "border_force",
    label: "Border Force, asylum share",
    basis: "attributed",
    kind: "direct",
    ...borderForceShare,
    note: `${ATTRIBUTION.borderForce.conservative * 100}% to ${ATTRIBUTION.borderForce.upper * 100}% of the audited £${toMillions(araDirectorates.borderForce.resourceOutturn).toLocaleString()}m segment. Border Force protects all UK borders, including trade and drugs, so most of it is not asylum.`
  }
];

/**
 * Everything the Home Office does not pay for.
 *
 * Carried unchanged from the v2 finding, where each has its method and sources set out.
 * These are NOT audited and the page says so. They are the reason the total is a range
 * rather than a figure.
 */
const OTHER_CATEGORIES: CostCategory[] = [
  {
    id: "post_decision_welfare",
    label: "Post-decision welfare",
    basis: "estimated",
    kind: "transfer",
    conservative: 740,
    central: 924,
    upper: 1098,
    note: "One year's cohort of grants entering mainstream welfare. Counting every past cohort still on benefits would be far larger and would double count against historic years."
  },
  {
    id: "family_reunion",
    label: "Family reunion dependants",
    basis: "estimated",
    kind: "average_attribution",
    conservative: 377,
    central: 500,
    upper: 623,
    note: "18,869 family reunion arrivals at an estimated £20,000 to £33,000 of public services each."
  },
  {
    id: "modern_slavery",
    label: "Modern slavery support",
    basis: "estimated",
    kind: "direct",
    conservative: 255,
    central: 340,
    upper: 425,
    note: "17,004 National Referral Mechanism referrals. Roughly 60% also have an asylum claim; the full cost is attributed here."
  },
  {
    id: "integration",
    label: "ESOL and integration",
    basis: "estimated",
    kind: "direct",
    conservative: 200,
    central: 250,
    upper: 300,
    note: "English language provision through the Adult Education Budget, plus refugee-specific integration programmes."
  },
  {
    id: "healthcare",
    label: "Healthcare",
    basis: "estimated",
    kind: "average_attribution",
    conservative: 204,
    central: 222,
    upper: 259,
    note: "No body publishes asylum-specific NHS costs. This is the largest data gap in the calculation and could be materially wrong in either direction."
  },
  {
    id: "criminal_justice",
    label: "Criminal justice",
    basis: "estimated",
    kind: "average_attribution",
    conservative: 127,
    central: 152,
    upper: 203,
    note: "A share of foreign national offender prison costs, judged from the overlap between top prison nationalities and top asylum nationalities. Not a measured figure."
  },
  {
    id: "education",
    label: "Education",
    basis: "estimated",
    kind: "average_attribution",
    conservative: 105,
    central: 140,
    upper: 185,
    note: "Neither the Home Office nor the DfE publishes the number of asylum-seeking children in schools."
  },
  {
    id: "translation",
    label: "Translation and interpreting",
    basis: "estimated",
    kind: "direct",
    conservative: 80,
    central: 125,
    upper: 170,
    note: "Built from NHS, HMCTS and local authority sectoral estimates. No single source publishes a total."
  },
  {
    id: "local_authority_unfunded",
    label: "Local authority unfunded costs",
    basis: "estimated",
    kind: "direct",
    conservative: 105,
    central: 125,
    upper: 145,
    note: "Costs falling on councils beyond the Home Office grants already counted inside ASRA: no-recourse-to-public-funds support and leaving-care costs for former unaccompanied children."
  },
  {
    id: "tribunals",
    label: "Tribunals and courts",
    basis: "published",
    kind: "direct",
    conservative: 102,
    central: 115,
    upper: 130,
    note: "First-tier Tribunal immigration and asylum chamber running costs, plus Home Office appeal representation. Published by HMCTS, but not as an asylum-only total."
  },
  {
    id: "legal_aid",
    label: "Legal aid",
    basis: "published",
    kind: "direct",
    conservative: 55,
    central: 60,
    upper: 70,
    note: "Legal Aid Agency immigration and asylum spend, including the 30% controlled-work fee rise from July 2025."
  }
];

export const COST_CATEGORIES: CostCategory[] = [...HOME_OFFICE_CATEGORIES, ...OTHER_CATEGORIES];

const sum = (categories: CostCategory[], column: "conservative" | "central" | "upper") =>
  categories.reduce((total, category) => total + category[column], 0);

/** £ million. */
export const TOTAL_GBP_M = {
  conservative: sum(COST_CATEGORIES, "conservative"),
  central: sum(COST_CATEGORIES, "central"),
  upper: sum(COST_CATEGORIES, "upper")
};

/**
 * The central total split by basis, in £m and as a share of the whole.
 *
 * This exists because the finding described the audited portion as "about 60%"
 * while its own table put £4,363M of £7,973M on an audited basis, which is 55%.
 * 60% was neither the audited share nor the audited-plus-attributed share (63%),
 * so a reader checking the claim against the table could not reproduce it either
 * way. Derive the shares here and assert the prose against them, rather than
 * re-deriving a percentage by hand each edition.
 */
export const BY_BASIS: Record<CostBasis, { gbpM: number; sharePct: number }> = (() => {
  const bases: CostBasis[] = ["audited", "attributed", "published", "estimated"];
  const out = {} as Record<CostBasis, { gbpM: number; sharePct: number }>;
  for (const basis of bases) {
    const gbpM = sum(COST_CATEGORIES.filter((c) => c.basis === basis), "central");
    out[basis] = { gbpM, sharePct: (gbpM / TOTAL_GBP_M.central) * 100 };
  }
  return out;
})();

/**
 * The central total split by what kind of quantity each category is.
 *
 * Published because the headline is an attribution and not a counterfactual, and
 * those differ by a knowable amount. The average-attributed share is the part of
 * the total that would NOT fall away in proportion if the caseload did, because
 * an average carries fixed capacity with it.
 */
export const BY_KIND: Record<CostKind, { gbpM: number; sharePct: number }> = (() => {
  const kinds: CostKind[] = ["direct", "transfer", "average_attribution"];
  const out = {} as Record<CostKind, { gbpM: number; sharePct: number }>;
  for (const kind of kinds) {
    const gbpM = sum(COST_CATEGORIES.filter((c) => c.kind === kind), "central");
    out[kind] = { gbpM, sharePct: (gbpM / TOTAL_GBP_M.central) * 100 };
  }
  return out;
})();

/** Audited plus attributed: the portion traceable to a page of the accounts. */
export const TRACEABLE_TO_ACCOUNTS_PCT =
  BY_BASIS.audited.sharePct + BY_BASIS.attributed.sharePct;

export const PER_TAXPAYER_GBP = {
  conservative: Math.round((TOTAL_GBP_M.conservative * 1_000_000) / UK_TAXPAYERS),
  central: Math.round((TOTAL_GBP_M.central * 1_000_000) / UK_TAXPAYERS),
  upper: Math.round((TOTAL_GBP_M.upper * 1_000_000) / UK_TAXPAYERS)
};

/**
 * Accommodation and support cost per supported person per day.
 *
 * THE ONLY per-person figure a place or region page may use. It is the audited ASRA
 * outturn over the mean supported population of the SAME financial year, so numerator
 * and denominator describe the same people over the same period. Roughly £107, which
 * sits sensibly against the roughly £170 a night the Migration Observatory publishes
 * for hotels in the same year: hotels are the expensive end of a mix that is mostly
 * dispersal housing.
 *
 * This comment used to compare it to "the £119 a night the Home Office publishes".
 * That figure was withdrawn from the True Cost article, which now says in as many words
 * that it can no longer be sourced. A withdrawn number left standing in a comment is how
 * it finds its way back into copy.
 *
 * Two substitutions are banned here, both of which have been live on this site:
 *   - a system-total numerator, which produced £150 a day and silently attributes
 *     post-decision welfare and offender costs to people currently on support;
 *   - a latest-quarter denominator, which produced £276 a night on the homepage by
 *     dividing one year's cost by another year's population.
 */
export const ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY = Math.round(
  (asra * 1_000_000) / SUPPORTED_ASYLUM_MEAN_OVER_ASRA_YEAR / 365
);

export const ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_YEAR =
  ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY * 365;

/**
 * System cost per head of the supported population. Exported for completeness and
 * deliberately named so nobody reaches for it thinking it is a per-area unit cost.
 * See the basis warning above.
 */
export const SYSTEM_TOTAL_PER_SUPPORTED_PERSON_PER_DAY_DO_NOT_USE_PER_AREA = Math.round(
  (TOTAL_GBP_M.central * 1_000_000) / SUPPORTED_ASYLUM_MEAN_OVER_ASRA_YEAR / 365
);

/** Cost of a named area's supported population, on the accommodation and support basis. */
export function accommodationCostForArea(supportedAsylum: number): number {
  return supportedAsylum * ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_YEAR;
}

export const TRUE_COST_SOURCE = {
  release: araCosts._provenance.source,
  url: araCosts._provenance.sourceUrl,
  financialYear: araCosts._provenance.financialYear,
  finding: "/findings/true-cost-of-asylum/"
};

/**
 * Guard against the double count described at the top.
 *
 * The expense types are inside the segments. If a future edit adds one to the category
 * list, the total jumps by billions and looks merely large rather than wrong, so this
 * fails the build instead.
 */
export function assertNoDoubleCount(): void {
  // `expenseTypes` carries a leading `_note` string alongside the entries, so this
  // narrows on the shape rather than assuming every value is an object.
  const forbidden = Object.values(araCosts.expenseTypes)
    .flatMap((entry) =>
      typeof entry === "object" && entry !== null && typeof entry.value === "number"
        ? [toMillions(entry.value)]
        : []
    );

  for (const category of COST_CATEGORIES) {
    for (const value of forbidden) {
      if (category.central === value) {
        throw new Error(
          `True Cost category "${category.id}" equals an expense-type figure (£${value}m). ` +
            `Expense types sit inside the directorate segments already counted, so this ` +
            `would double count. See the double-counting note in src/lib/true-cost.ts.`
        );
      }
    }
  }
}

assertNoDoubleCount();
