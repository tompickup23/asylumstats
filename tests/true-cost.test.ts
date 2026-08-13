import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY,
  COST_CATEGORIES,
  PER_TAXPAYER_GBP,
  SUPPORTED_ASYLUM_POPULATION,
  SYSTEM_TOTAL_PER_SUPPORTED_PERSON_PER_DAY_DO_NOT_USE_PER_AREA,
  TOTAL_GBP_M,
  UK_TAXPAYERS,
  assertNoDoubleCount
} from "../src/lib/true-cost";
import araCosts from "../data/marts/home_office_ara/asylum-costs.json";

/**
 * True Cost had one job to fix: stop the same quantity being written down in five
 * places. The module is now the single source, but the finding is markdown and cannot
 * import it, so this file is what actually enforces the "one figure" rule. If the
 * article and the module disagree, this fails.
 *
 * The other tests here guard the two ways this calculation goes wrong, both of which
 * have live history on this site: double counting an expense type that sits inside a
 * budget segment, and dividing a system total by a population it does not describe.
 */

const finding = readFileSync(
  join(process.cwd(), "src/content/findings/true-cost-of-asylum.md"),
  "utf8"
);

describe("the finding agrees with the derived constant", () => {
  it("states the central per-taxpayer figure in its headline and summary", () => {
    expect(finding).toContain(`£${PER_TAXPAYER_GBP.central} per income taxpayer`);
    expect(finding).toMatch(
      new RegExp(`headline:.*£${PER_TAXPAYER_GBP.central} per income taxpayer`)
    );
  });

  it("states the full per-taxpayer range", () => {
    expect(finding).toContain(
      `£${PER_TAXPAYER_GBP.conservative} | £${PER_TAXPAYER_GBP.central} | £${PER_TAXPAYER_GBP.upper}`
    );
    expect(finding).toContain(
      `on a range of £${PER_TAXPAYER_GBP.conservative} to £${PER_TAXPAYER_GBP.upper}`
    );
  });

  it("states the totals row exactly as the module computes it", () => {
    expect(finding).toContain(
      `**£${TOTAL_GBP_M.conservative.toLocaleString()}M** | ` +
        `**£${TOTAL_GBP_M.central.toLocaleString()}M** | ` +
        `**£${TOTAL_GBP_M.upper.toLocaleString()}M**`
    );
  });

  it("lists every category with the module's three columns", () => {
    for (const category of COST_CATEGORIES) {
      const row =
        `£${category.conservative.toLocaleString()}M | ` +
        `£${category.central.toLocaleString()}M | ` +
        `£${category.upper.toLocaleString()}M`;
      expect(finding, `no row in the finding matching ${category.id} (${row})`).toContain(row);
    }
  });

  it("carries the per-supported-person figure the place pages use", () => {
    expect(finding).toContain(
      `£${ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY} per supported person per day`
    );
  });

  it("states no superseded figure as a current claim", () => {
    // These are the figures that contradicted each other. £8,050M and £236 were the v2
    // central; £155/£169/£5.3B-£6.3B were v1, stranded on the homepage for four months.
    //
    // They are allowed to appear where the article explicitly says they are superseded:
    // the edition note and the paragraph comparing v2's estimate against the audited
    // rebuild. Saying what changed is the point of a third edition. So the check runs
    // over the prose with those lines removed, rather than banning the strings outright.
    const supersessionMarker =
      /third edition|second edition|previous edition|moves from|the accounts win/i;
    const currentClaims = finding
      .split("\n")
      .filter((line) => !supersessionMarker.test(line))
      .join("\n");

    for (const stale of ["£207", "£230", "£236", "£266", "£8.1 billion", "£9,075M", "£8,050M"]) {
      expect(
        currentClaims,
        `the finding states the superseded figure ${stale} outside an edition note`
      ).not.toContain(stale);
    }
  });
});

describe("the double-count guard", () => {
  it("passes on the current category list", () => {
    expect(() => assertNoDoubleCount()).not.toThrow();
  });

  it("knows the expense types are not categories", () => {
    // "Asylum costs excluding grants" (£2,962m) sits inside ASRA (£4,181m); detention
    // (£159m) sits inside Immigration Enforcement (£770m). Neither may be a category.
    const categoryValues = COST_CATEGORIES.map((category) => category.central);
    expect(categoryValues).not.toContain(2962);
    expect(categoryValues).not.toContain(159);
  });

  it("keeps ASRA larger than the asylum costs sitting inside it", () => {
    // A sanity check on the containment claim itself. If the accounts ever reported
    // asylum costs above the ASRA segment, the note in the module would be wrong.
    expect(araCosts.directorates.asylumSupportResettlementAccommodation.resourceOutturn)
      .toBeGreaterThan(araCosts.expenseTypes.asylumCostsExcludingGrants.value);
    expect(araCosts.directorates.immigrationEnforcement.resourceOutturn).toBeGreaterThan(
      araCosts.expenseTypes.detentionCosts.value
    );
  });
});

describe("the per-person basis", () => {
  it("derives the per-area figure from ASRA, not the system total", () => {
    const asraMillions = Math.round(
      araCosts.directorates.asylumSupportResettlementAccommodation.resourceOutturn / 1000
    );
    expect(ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY).toBe(
      Math.round((asraMillions * 1_000_000) / SUPPORTED_ASYLUM_POPULATION / 365)
    );
  });

  it("is materially below the system-total figure, which is the whole point", () => {
    // £150/day on the old site was £5.3bn / 97,519 / 365: a total-system numerator over
    // a supported-population denominator. The gap below is that error, quantified.
    expect(ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY).toBeLessThan(
      SYSTEM_TOTAL_PER_SUPPORTED_PERSON_PER_DAY_DO_NOT_USE_PER_AREA
    );
    const overstatement =
      SYSTEM_TOTAL_PER_SUPPORTED_PERSON_PER_DAY_DO_NOT_USE_PER_AREA /
      ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY;
    expect(overstatement).toBeGreaterThan(1.5);
  });

  it("sits in the same range as the published hotel nightly rate", () => {
    // The Home Office publishes £119 a night for hotels. An accommodation and support
    // figure far from that would mean the numerator and denominator had drifted apart.
    expect(ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY).toBeGreaterThan(80);
    expect(ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY).toBeLessThan(160);
  });
});

describe("arithmetic", () => {
  it("totals the categories rather than carrying a written-down total", () => {
    for (const column of ["conservative", "central", "upper"] as const) {
      expect(TOTAL_GBP_M[column]).toBe(
        COST_CATEGORIES.reduce((total, category) => total + category[column], 0)
      );
    }
  });

  it("orders the three columns", () => {
    expect(TOTAL_GBP_M.conservative).toBeLessThan(TOTAL_GBP_M.central);
    expect(TOTAL_GBP_M.central).toBeLessThan(TOTAL_GBP_M.upper);
  });

  it("divides by the stated taxpayer count", () => {
    expect(PER_TAXPAYER_GBP.central).toBe(
      Math.round((TOTAL_GBP_M.central * 1_000_000) / UK_TAXPAYERS)
    );
    expect(UK_TAXPAYERS).toBe(34_100_000);
  });

  it("ties the ARA figures to the exact banked file", () => {
    // Provenance is the site's whole proposition. These figures were transcribed by hand
    // from a 370-page PDF, so the hash is what makes that transcription checkable.
    expect(araCosts._provenance.sourceSha256).toBe(
      "c8cda7ee5f28700b4a2174b3889cb203c410503c60222e6a03102d92642c1350"
    );
    expect(araCosts._provenance.financialYear).toBe("2025-26");
  });
});
