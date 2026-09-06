import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Home Office asylum spending, from the department's own transparency publications.
 *
 * READ THIS BEFORE PUTTING A NUMBER FROM HERE ON A PAGE.
 *
 * Every figure carries a `basis`, and the basis is not decoration. It says what kind of
 * measurement the number is, and measurements of different kinds count different things:
 *
 *   published_transaction  an itemised payment over £25,000 in a transparency file.
 *                          Checkable down to the invoice, and badly incomplete.
 *   audited_account        an Annual Report and Accounts figure. Complete, not itemised.
 *   nao_estimate           National Audit Office analysis. Authoritative, and an estimate.
 *   derived                computed by us from the above. Must name its inputs.
 *
 * THE RULE: two figures with different `basis` values may be COMPARED side by side, with
 * both bases named — that comparison is the whole point of the reconciliation. They may
 * never be summed, subtracted into a single total, or drawn as one chart series. A ratio
 * across two bases is itself `derived`.
 *
 * This is not pedantry. The repository's own history records a page carrying five
 * conflicting "true cost" figures, and every one of those incidents was two different
 * bases being treated as the same measure.
 */

export type SpendBasis =
  | "published_transaction"
  | "audited_account"
  | "nao_estimate"
  | "derived";

export interface HoAsylumEntity {
  entityId: string;
  name: string;
  companyNumber: string | null;
  role: string;
  mergeBasis: string | null;
  /** Every supplier string, exactly as the Home Office published it, that maps here. */
  rawSuppliers: string[];
  amountGbp: number;
  transactions: number;
  /** Financial year ("2024/25") to amount. */
  byFy: Record<string, number>;
  topExpenseTypes: Array<{ label: string; amountGbp: number }>;
}

export interface HoAsylumCoverage {
  /** Earliest and latest transaction date in the source data, ISO. */
  earliest: string | null;
  latest: string | null;
  /** "April 2010", "May 2026" — for display. */
  earliestLabel: string | null;
  latestLabel: string | null;
}

export interface HoAsylumEntities {
  /**
   * When the transform last ran. This is NOT the currency of the data — see `coverage`.
   * Never print this next to a spending figure: a reader takes a date beside a number
   * as the date the number is true of.
   */
  generatedAt: string;
  coverage: HoAsylumCoverage;
  basis: SpendBasis;
  licence: string;
  sourceCollection: string;
  whatThisIsNot: string;
  summary: {
    transactions: number;
    totalGbp: number;
    entities: number;
    filesInCorpus: number;
    filesParsed: number;
  };
  entities: HoAsylumEntity[];
}

export interface HoAsylumYear {
  fy: string;
  amountGbp: number;
  transactions: number;
  /** Which expense-area labels the department used that year. */
  areaLabels: string[];
}

export interface HoAsylumByYear {
  generatedAt: string;
  basis: SpendBasis;
  noTrendLineRule: string;
  years: HoAsylumYear[];
}

export interface ReconciliationComponent {
  componentId: string;
  label: string;
  plainLabel: string;
  payer: string;
  parentId: string | null;
  estimatedGbp: number;
  estimatedBasis: SpendBasis;
  publishedGbp: number | null;
  publishedBasis: SpendBasis | null;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceLicence: string;
  note: string | null;
}

export interface AsylumCostReconciliation {
  generatedAt: string;
  fy: string;
  basisRule: string;
  headline: {
    publishedGbp: number;
    publishedBasis: SpendBasis;
    estimatedGbp: number;
    estimatedBasis: SpendBasis;
    capture: {
      basis: SpendBasis;
      inputs: SpendBasis[];
      ratio: number;
      perHundredPounds: number;
      plain: string;
    } | null;
  };
  councilTest: {
    estimatedGbp: number;
    estimatedNote: string;
    publishedGbp: number;
    publishedIncludingRefugeeCouncilGbp: number;
    note: string;
  };
  whatThisIsNot: string;
  components: ReconciliationComponent[];
}

/**
 * Resolved from the project root, not from this module's URL. Astro bundles server code
 * into dist/.prerender/ before running it, so an import.meta.url-relative path points at
 * the bundle rather than the repository and the build fails at render time. Every other
 * loader in src/lib does it this way.
 */
function load<T>(file: string): T {
  const path = join(process.cwd(), "src/data/live", file);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadHoAsylumEntities(): HoAsylumEntities {
  return load<HoAsylumEntities>("ho-asylum-entities.json");
}

export function loadHoAsylumByYear(): HoAsylumByYear {
  return load<HoAsylumByYear>("ho-asylum-by-year.json");
}

export function loadAsylumCostReconciliation(): AsylumCostReconciliation {
  return load<AsylumCostReconciliation>("asylum-cost-reconciliation.json");
}

/**
 * Entities substantial enough to deserve a page of their own.
 *
 * Below this floor an entity gets a row in a table instead. 138 of 366 entities have
 * fewer than three transactions and together account for 0.7% of the money, so the floor
 * removes 37% of potential pages at almost no cost in coverage — and it is what stops the
 * site generating hundreds of near-identical thin pages.
 */
export function getPageworthyEntities(
  entities: HoAsylumEntity[],
  minTransactions = 3
): HoAsylumEntity[] {
  return entities.filter((entity) => entity.transactions >= minTransactions);
}

/** £4,329,261,711 -> "£4.33bn". Pages about public money should not print 10 digits. */
export function formatGbpShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `£${(value / 1e9).toFixed(2)}bn`;
  if (abs >= 1e6) return `£${(value / 1e6).toFixed(1)}m`;
  if (abs >= 1e3) return `£${Math.round(value / 1e3)}k`;
  return `£${Math.round(value)}`;
}

export function formatGbpFull(value: number): string {
  return `£${Math.round(value).toLocaleString("en-GB")}`;
}

/**
 * A large number with a human anchor on the same line, which is a house rule rather than
 * a nicety: "£4.9 billion" is not a quantity most readers can hold, and "about £71 for
 * every person in the UK" is.
 *
 * UK population 69,281,400 (ONS mid-2024).
 */
const UK_POPULATION = 69_281_400;

export function perPersonInUk(value: number): string {
  const each = value / UK_POPULATION;
  if (each < 1) return `${Math.round(each * 100)}p for every person in the UK`;
  return `about £${Math.round(each)} for every person in the UK`;
}
