import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY,
  COST_CATEGORIES,
  PER_TAXPAYER_GBP,
  SUPPORTED_ASYLUM_POPULATION,
  SUPPORTED_ASYLUM_MEAN_OVER_ASRA_YEAR,
  ASRA_FY_OPENS,
  ASRA_FY_CLOSES,
  SYSTEM_TOTAL_PER_SUPPORTED_PERSON_PER_DAY_DO_NOT_USE_PER_AREA,
  TOTAL_GBP_M,
  BY_BASIS,
  BY_KIND,
  TRACEABLE_TO_ACCOUNTS_PCT,
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
      Math.round((asraMillions * 1_000_000) / SUPPORTED_ASYLUM_MEAN_OVER_ASRA_YEAR / 365)
    );
  });

  it("averages the population over the cost's own year, not the latest quarter", () => {
    // The check that has to exist. Restating the module's own formula proves nothing:
    // it passed happily while the denominator was a single quarter-end, which is the
    // £276-a-night error in miniature. This asserts the BASIS instead.
    //
    // Supported numbers fell through 2025-26, so the closing stock is below the mean.
    // If someone swaps the denominator back to the latest quarter, the rate rises and
    // this fails.
    expect(SUPPORTED_ASYLUM_MEAN_OVER_ASRA_YEAR).toBeGreaterThan(SUPPORTED_ASYLUM_POPULATION);

    const onLatestQuarter = Math.round(
      (Math.round(
        araCosts.directorates.asylumSupportResettlementAccommodation.resourceOutturn / 1000
      ) *
        1_000_000) /
        SUPPORTED_ASYLUM_POPULATION /
        365
    );
    expect(ACCOMMODATION_AND_SUPPORT_PER_PERSON_PER_DAY).toBeLessThan(onLatestQuarter);
  });

  it("holds the cost rate steady when a new quarter lands", () => {
    // The refresh guard. A quarterly release adds a point after the accounts year, and
    // the window is pinned to the accounts, so the mean must not move. Simulating the
    // next release here is cheaper than discovering the drift on 362 live place pages.
    const closingYear = Number(ASRA_FY_CLOSES.slice(0, 4));
    expect(ASRA_FY_OPENS < ASRA_FY_CLOSES).toBe(true);

    const nextRelease = { periodEnd: `${closingYear}-06-30`, value: 80_000 };
    const inWindow =
      nextRelease.periodEnd >= ASRA_FY_OPENS && nextRelease.periodEnd <= ASRA_FY_CLOSES;
    expect(inWindow, "a post-year-end quarter must fall outside the averaging window").toBe(
      false
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

/**
 * The audited share went out as "about 60%" in two places while the article's own
 * basis table put £4,363M of £7,973M on an audited basis. That is 55%, and 60% was
 * not the audited-plus-attributed figure either, which is 63%. A reader checking the
 * headline against the table below it could not reproduce the claim on either
 * reading, which is the specific failure this describes.
 */
describe("the basis shares in the prose reproduce from the categories", () => {
  it("splits the central total across exactly the four bases", () => {
    const summed =
      BY_BASIS.audited.gbpM +
      BY_BASIS.attributed.gbpM +
      BY_BASIS.published.gbpM +
      BY_BASIS.estimated.gbpM;
    expect(summed).toBe(TOTAL_GBP_M.central);
  });

  it("puts the audited share at 55%, not 60%", () => {
    expect(Math.round(BY_BASIS.audited.sharePct)).toBe(55);
    expect(Math.round(TRACEABLE_TO_ACCOUNTS_PCT)).toBe(63);
  });

  it("states those shares in the article and nowhere states a 60% audited share", () => {
    expect(finding).toContain(`${Math.round(BY_BASIS.audited.sharePct)}% of the total is an audited outturn`);
    expect(finding).toContain(`${Math.round(TRACEABLE_TO_ACCOUNTS_PCT)}% is either audited or attributed`);
    expect(finding).not.toMatch(/(about|around) 60% of (the total|that) is now audited/i);
  });

  it("prints each basis share in the table beside its money", () => {
    for (const [basis, { gbpM, sharePct }] of Object.entries(BY_BASIS)) {
      expect(finding, basis).toContain(`£${gbpM.toLocaleString("en-GB")}M | ${Math.round(sharePct)}%`);
    }
  });
});

/**
 * The audit's sharpest point, and the one that was not a wording problem.
 *
 * Multiplying a population by average public-service spend attributes costs that
 * would not fall away in proportion if the population did, because an average
 * carries fixed capacity: hospital estate, school buildings, the prison estate.
 * The article headlined "the true cost" and gave no way to tell which of its
 * categories were of that kind, so a reader could not separate "spending
 * associated with this system" from "spending that would stop".
 *
 * `kind` is a second dimension alongside `basis` and independent of it: an
 * audited line can still be an average attribution. These pin the split and the
 * disclosure, so a new category cannot be added without declaring which it is.
 */
describe("the total distinguishes attribution from counterfactual", () => {
  it("classifies every category", () => {
    for (const category of COST_CATEGORIES) {
      expect(["direct", "transfer", "average_attribution"], category.id).toContain(category.kind);
    }
  });

  it("splits the central total across exactly the three kinds", () => {
    const summed =
      BY_KIND.direct.gbpM + BY_KIND.transfer.gbpM + BY_KIND.average_attribution.gbpM;
    expect(summed).toBe(TOTAL_GBP_M.central);
  });

  it("puts the average-attributed share at about an eighth of the total", () => {
    expect(BY_KIND.average_attribution.gbpM).toBe(1014);
    expect(Math.round(BY_KIND.average_attribution.sharePct)).toBe(13);
  });

  it("classes the four per-head multiplications as average attributions", () => {
    const byId = new Map(COST_CATEGORIES.map((c) => [c.id, c.kind]));
    for (const id of ["healthcare", "education", "criminal_justice", "family_reunion"]) {
      expect(byId.get(id), id).toBe("average_attribution");
    }
    // A transfer is not an average attribution: a pound of Universal Credit paid
    // is a pound that stops being paid, with no fixed capacity behind it.
    expect(byId.get("post_decision_welfare")).toBe("transfer");
  });

  it("states the distinction and the amount in the article", () => {
    expect(finding).toMatch(/Attribution, not counterfactual/i);
    expect(finding).toContain("what would the exchequer save");
    for (const { gbpM, sharePct } of Object.values(BY_KIND)) {
      expect(finding).toContain(`£${gbpM.toLocaleString("en-GB")}M | ${Math.round(sharePct)}%`);
    }
  });
});
