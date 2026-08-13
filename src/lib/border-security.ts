import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface DisruptionQuarter {
  year: number;
  quarter: string;
  quarterId: string;
  major: number;
  moderate: number;
  minor: number;
  total: number;
}

export interface DisruptionMetric {
  level: "major" | "moderate" | "minor" | "total";
  latest: number;
  prior: number;
  changePct: number;
}

export interface AgencyInvolvementRow {
  agency: string;
  prior: number;
  latest: number;
}

export interface UkFranceMonth {
  year: number;
  month: string;
  period: string;
  transferredIn: number;
  returnedOut: number;
}

export interface BorderSecurity {
  release: string;
  releaseDate: string;
  statisticsStatus: string;
  organisedImmigrationCrime: {
    sourceUrl: string;
    coverage: string;
    quarterly: DisruptionQuarter[];
    summary: {
      latestPeriod: string;
      priorPeriod: string;
      latestPeriodShort: string;
      priorPeriodShort: string;
      metrics: DisruptionMetric[];
    };
    agencyInvolvement: {
      /**
       * Always false. The column counts agency involvement in an arrest, and more than
       * one agency can be involved in the same arrest, so the rows sum to well above the
       * arrest total: 2,380 against a published "at least 1,900". Typed as a literal so
       * anything that tries to total this column has to acknowledge the flag first.
       */
      countsArrests: false;
      note: string;
      latestPeriod: string;
      priorPeriod: string;
      rows: AgencyInvolvementRow[];
    };
    arrests: {
      basis: string;
      latest: number;
      prior: number;
      latestUkLawEnforcement: number;
      latestOverseasPartners: number;
    };
    caveats: string[];
  };
  ukFranceAgreement: {
    sourceUrl: string;
    coverage: string;
    monthly: UkFranceMonth[];
    totals: { transferredIn: number; returnedOut: number };
    caveats: string[];
  };
}

export function loadBorderSecurity(): BorderSecurity {
  return JSON.parse(
    readFileSync(join(process.cwd(), "src/data/live/border-security.json"), "utf8")
  ) as BorderSecurity;
}

/** Percentage change formatted with an explicit sign, for prose. */
export function signedPct(value: number): string {
  return `${value >= 0 ? "up" : "down"} ${Math.abs(value)}%`;
}
