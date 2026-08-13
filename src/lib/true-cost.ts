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

/** People on asylum support at the latest published quarter end. */
export const SUPPORTED_ASYLUM_POPULATION =
  routeDashboard.nationalSystemDynamics.latestQuarter.supportedAsylum;
export const SUPPORTED_ASYLUM_AS_AT = routeDashboard.localSnapshotDate;

export type CostBasis = "audited" | "attributed" | "published" | "estimated";

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
    conservative: asra,
    central: asra,
    upper: asra,
    note: "Audited resource outturn for the whole ASRA segment. Covers contracted accommodation and subsistence, resettlement schemes and the grants paid to local authorities, so it replaces three separately estimated lines in the previous edition. Down from £4,513m in 2024-25 and £5,425m in 2023-24."
  },
  {
    id: "border_security_command",
    label: "Border Security Command",
    basis: "audited",
    conservative: borderSecurityCommand,
    central: borderSecurityCommand,
    upper: borderSecurityCommand,
    note: "Audited resource outturn, counted in full because the command exists to tackle small boats and organised immigration crime. Its budget rises to £797m in 2026-27."
  },
  {
    id: "immigration_enforcement",
    label: "Immigration enforcement, asylum share",
    basis: "attributed",
    ...enforcementShare,
    note: `${ATTRIBUTION.immigrationEnforcement.conservative * 100}% to ${ATTRIBUTION.immigrationEnforcement.upper * 100}% of the audited £${toMillions(araDirectorates.immigrationEnforcement.resourceOutturn).toLocaleString()}m segment. Enforcement covers all immigration offending, not only asylum. Detention costs of £159m sit inside this segment and are not added separately.`
  },
  {
    id: "border_force",
    label: "Border Force, asylum share",
    basis: "attributed",
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
    conservative: 740,
    central: 924,
    upper: 1098,
    note: "One year's cohort of grants entering mainstream welfare. Counting every past cohort still on benefits would be far larger and would double count against historic years."
  },
  {
    id: "family_reunion",
    label: "Family reunion dependants",
    basis: "estimated",
    conservative: 377,
    central: 500,
    upper: 623,
    note: "18,869 family reunion arrivals at an estimated £20,000 to £33,000 of public services each."
  },
  {
    id: "modern_slavery",
    label: "Modern slavery support",
    basis: "estimated",
    conservative: 255,
    central: 340,
    upper: 425,
    note: "17,004 National Referral Mechanism referrals. Roughly 60% also have an asylum claim; the full cost is attributed here."
  },
  {
    id: "integration",
    label: "ESOL and integration",
    basis: "estimated",
    conservative: 200,
    central: 250,
    upper: 300,
    note: "English language provision through the Adult Education Budget, plus refugee-specific integration programmes."
  },
  {
    id: "healthcare",
    label: "Healthcare",
    basis: "estimated",
    conservative: 204,
    central: 222,
    upper: 259,
    note: "No body publishes asylum-specific NHS costs. This is the largest data gap in the calculation and could be materially wrong in either direction."
  },
  {
    id: "criminal_justice",
    label: "Criminal justice",
    basis: "estimated",
    conservative: 127,
    central: 152,
    upper: 203,
    note: "A share of foreign national offender prison costs, judged from the overlap between top prison nationalities and top asylum nationalities. Not a measured figure."
  },
  {
    id: "education",
    label: "Education",
    basis: "estimated",
    conservative: 105,
    central: 140,
    upper: 185,
    note: "Neither the Home Office nor the DfE publishes the number of asylum-seeking children in schools."
  },
  {
    id: "translation",
    label: "Translation and interpreting",
    basis: "estimated",
    conservative: 80,
    central: 125,
    upper: 170,
    note: "Built from NHS, HMCTS and local authority sectoral estimates. No single source publishes a total."
  },
  {
    id: "local_authority_unfunded",
    label: "Local authority unfunded costs",
    basis: "estimated",
    conservative: 105,
    central: 125,
    upper: 145,
    note: "Costs falling on councils beyond the Home Office grants already counted inside ASRA: no-recourse-to-public-funds support and leaving-care costs for former unaccompanied children."
  },
  {
    id: "tribunals",
    label: "Tribunals and courts",
    basis: "published",
    conservative: 102,
    central: 115,
    upper: 130,
    note: "First-tier Tribunal immigration and asylum chamber running costs, plus Home Office appeal representation. Published by HMCTS, but not as an asylum-only total."
  },
  {
    id: "legal_aid",
    label: "Legal aid",
    basis: "published",
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

export const PER_TAXPAYER_GBP = {
  conservative: Math.round((TOTAL_GBP_M.conservative * 1_000_000) / UK_TAXPAYERS),
  central: Math.round((TOTAL_GBP_M.central * 1_000_000) / UK_TAXPAYERS),
  upper: Math.round((TOTAL_GBP_M.upper * 1_000_000) / UK_TAXPAYERS)
};

/**
 * Accommodation and support cost per supported person per day.
 *
 * THE ONLY per-person figure a place or region page may use. It is the audited ASRA
 * outturn over the supported population, so both numerator and denominator describe the
 * same people. Roughly £117 on current figures, which sits sensibly against the £119 a
 * night the Home Office publishes for hotels.
 *
 * Do NOT substitute a system-total-derived figure here. That is what produced £150 a day
 * and it silently attributes post-decision welfare and offender costs to people
 * currently on support.
 */
export const ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY = Math.round(
  (asra * 1_000_000) / SUPPORTED_ASYLUM_POPULATION / 365
);

export const ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_YEAR =
  ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY * 365;

/**
 * System cost per head of the supported population. Exported for completeness and
 * deliberately named so nobody reaches for it thinking it is a per-area unit cost.
 * See the basis warning above.
 */
export const SYSTEM_TOTAL_PER_SUPPORTED_PERSON_PER_DAY_DO_NOT_USE_PER_AREA = Math.round(
  (TOTAL_GBP_M.central * 1_000_000) / SUPPORTED_ASYLUM_POPULATION / 365
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
