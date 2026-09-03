import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadHoAsylumEntities,
  loadHoAsylumByYear,
  loadAsylumCostReconciliation,
  getPageworthyEntities,
  formatGbpShort,
  perPersonInUk
} from "../src/lib/ho-spend";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const entities = loadHoAsylumEntities();
const byYear = loadHoAsylumByYear();
const reconciliation = loadAsylumCostReconciliation();

/**
 * The corpus is rebuilt from 402 published files every time the fetch runs, and four of
 * the defects these tests guard against were live at some point during the build:
 *
 *  - two unmapped header spellings silently deleted the only main-department returns for
 *    December 2018 and September 2019;
 *  - three files had an extension that lied about their contents;
 *  - the dedupe key used the raw date string, so the answer changed by £2.2bn depending
 *    on which of two equally valid parsers read an ODS file first;
 *  - a supplier-name search counted "Refugee Council", a charity, as a local authority
 *    and trebled the answer to the most load-bearing figure on the page.
 *
 * None of those announced themselves. Each is now a test.
 */
describe("Home Office asylum spend corpus", () => {
  it("parses every file in the corpus", () => {
    // A file that stops parsing is a silently missing month, not a rounding error.
    expect(entities.summary.filesParsed).toBe(entities.summary.filesInCorpus);
    expect(entities.summary.filesInCorpus).toBeGreaterThanOrEqual(255);
  });

  it("holds a plausible number of transactions and entities", () => {
    expect(entities.summary.transactions).toBeGreaterThan(16_000);
    expect(entities.summary.entities).toBeGreaterThan(300);
    expect(entities.summary.totalGbp).toBeGreaterThan(4.0e9);
    expect(entities.summary.totalGbp).toBeLessThan(5.5e9);
  });

  it("covers every financial year from 2010/11 with no empty year", () => {
    // The department's Expense Area label for asylum disappeared between 2017 and 2020.
    // The Expense Type codes did not, which is the only reason there is no hole here.
    // An empty year means the type-code half of the classification has been dropped.
    const years = byYear.years.map((y) => y.fy);
    for (const fy of ["2017/18", "2018/19", "2019/20", "2020/21"]) {
      expect(years).toContain(fy);
    }
    for (const year of byYear.years) {
      expect(year.amountGbp).toBeGreaterThan(0);
      expect(year.transactions).toBeGreaterThan(0);
    }
  });

  it("records which expense-area labels were in use, so no one draws a trend line", () => {
    expect(byYear.noTrendLineRule).toMatch(/reclassification/i);
    const labelled = byYear.years.filter((y) => y.areaLabels.length > 0);
    expect(labelled.length).toBeGreaterThan(5);
  });

  it("names no individual person as a supplier", () => {
    // Five supplier strings in the wider Home Office corpus are named individuals. None
    // are in the asylum subset today. This publishes monthly, so that must be checked
    // rather than assumed: a named individual is personal data, not a company payment.
    const personalTitle = /\b(MR|MRS|MISS|MS|DR|PROF|REV|SIR|DAME)\b\.?\s+[A-Z]/i;
    const offenders = entities.entities.filter((entity) =>
      entity.rawSuppliers.some((raw) => personalTitle.test(raw))
    );
    expect(offenders.map((entity) => entity.name)).toEqual([]);
  });

  it("keeps group companies separate unless a merge is justified in writing", () => {
    // Same name root is not the same legal entity. Merging Clearsprings Ready Homes with
    // Clearsprings Management would assert a corporate structure this data cannot show.
    const ids = entities.entities.map((entity) => entity.entityId);
    expect(ids).toContain("clearsprings-ready-homes");
    const merged = entities.entities.filter((entity) => entity.rawSuppliers.length > 1);
    for (const entity of merged) {
      expect(entity.mergeBasis, `${entity.entityId} merges names with no stated basis`).toBeTruthy();
    }
  });

  it("applies an entity floor that removes thin pages, not substance", () => {
    const pageworthy = getPageworthyEntities(entities.entities);
    const dropped = entities.entities.length - pageworthy.length;
    const droppedValue = entities.entities
      .filter((entity) => entity.transactions < 3)
      .reduce((total, entity) => total + entity.amountGbp, 0);
    expect(dropped).toBeGreaterThan(0);
    // Dropping pages is only acceptable while it costs almost none of the money.
    expect(droppedValue / entities.summary.totalGbp).toBeLessThan(0.02);
  });
});

describe("the basis rule", () => {
  it("states the rule on the mart itself, not only in documentation", () => {
    expect(reconciliation.basisRule).toMatch(/never be summed/i);
    expect(reconciliation.basisRule).toMatch(/compared/i);
  });

  it("labels both sides of every comparison with their basis", () => {
    expect(reconciliation.headline.publishedBasis).toBe("published_transaction");
    expect(reconciliation.headline.estimatedBasis).toBe("nao_estimate");
    for (const component of reconciliation.components) {
      expect(component.estimatedBasis).toBeTruthy();
      if (component.publishedGbp !== null) {
        expect(component.publishedBasis).toBe("published_transaction");
      }
    }
  });

  it("marks the cross-basis ratio as derived and names its inputs", () => {
    const capture = reconciliation.headline.capture;
    expect(capture).not.toBeNull();
    expect(capture!.basis).toBe("derived");
    expect(capture!.inputs).toContain("published_transaction");
    expect(capture!.inputs).toContain("nao_estimate");
  });

  it("never presents a component total that sums across bases", () => {
    // The NAO's own stated total is used verbatim. Summing the component rows would mix
    // parents with their children and produce a number the source does not support.
    const total = reconciliation.components.find((c) => c.componentId === "TOTAL");
    expect(total).toBeDefined();
    const summedChildren = reconciliation.components
      .filter((c) => c.componentId !== "TOTAL" && !c.parentId)
      .reduce((sum, c) => sum + c.estimatedGbp, 0);
    expect(summedChildren).not.toBe(total!.estimatedGbp);
    expect(total!.note).toMatch(/do not recompute/i);
  });

  it("carries the licence of every borrowed figure", () => {
    // NAO material is NOT Open Government Licence. It is NAO copyright, non-commercial
    // reuse with a prescribed acknowledgement, so the licence has to travel with the row.
    for (const component of reconciliation.components) {
      expect(component.sourceLicence).toBeTruthy();
      expect(component.sourceUrl).toMatch(/^https:\/\//);
    }
    const nao = reconciliation.components.filter((c) => /National Audit Office/i.test(c.sourceTitle));
    expect(nao.length).toBeGreaterThan(0);
    for (const component of nao) {
      expect(component.sourceLicence).toMatch(/NOT Open Government Licence/i);
    }
  });
});

describe("the council figure, which is the most misreadable number on the site", () => {
  it("excludes Refugee Council, a charity, from the council total", () => {
    const { publishedGbp, publishedIncludingRefugeeCouncilGbp } = reconciliation.councilTest;
    expect(publishedGbp).toBeLessThan(publishedIncludingRefugeeCouncilGbp);
    // The naive answer is more than double the right one. That gap is the whole reason
    // this test exists.
    expect(publishedIncludingRefugeeCouncilGbp / publishedGbp).toBeGreaterThan(1.5);
  });

  it("says in the data what the difference is", () => {
    expect(reconciliation.councilTest.note).toMatch(/charity/i);
  });
});

describe("what this dataset is not", () => {
  it("says so on the mart, where a page author will meet it", () => {
    expect(entities.whatThisIsNot).toMatch(/not total asylum spending/i);
    expect(reconciliation.whatThisIsNot).toMatch(/not missing, wasted or hidden/i);
  });
});

describe("the advertised download", () => {
  it("exists, and is the same bytes as the mart", () => {
    // /what-the-home-office-publishes emits Dataset structured data pointing at
    // /data/ho-asylum-entities.json. Nothing else would notice if that file stopped being
    // written: the page still renders, the build still passes, and only someone following
    // the schema.org link hits a 404. sync-live writes it from the mart; this checks it.
    const published = resolve(ROOT, "public/data/ho-asylum-entities.json");
    const mart = resolve(ROOT, "data/marts/ho_spend/ho-asylum-entities.json");
    expect(existsSync(published), "public/data/ho-asylum-entities.json missing — run npm run sync:live").toBe(true);
    expect(readFileSync(published).equals(readFileSync(mart))).toBe(true);
  });
});

describe("plain-language helpers", () => {
  it("shortens money rather than printing ten digits", () => {
    expect(formatGbpShort(4_329_261_711)).toBe("£4.33bn");
    expect(formatGbpShort(539_725_048)).toBe("£539.7m");
    expect(formatGbpShort(1_595_281)).toBe("£1.6m");
  });

  it("anchors a large number to something a reader can hold", () => {
    // ONS mid-2024 UK population 69,281,400. £4.9bn is about £71 each.
    expect(perPersonInUk(4_900_000_000)).toBe("about £71 for every person in the UK");
  });

  it("keeps the headline sentence readable", () => {
    // Flesch-Kincaid grade, computed here rather than trusted: the sentence a reader
    // meets first has to work for someone who left school at sixteen.
    const sentence = reconciliation.headline.capture!.plain;
    expect(gradeLevel(sentence)).toBeLessThan(9);
  });
});

/** Flesch-Kincaid grade level. Deliberately dependency-free. */
function gradeLevel(text: string): number {
  const words = text.match(/[A-Za-z'’-]+/g) ?? [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (!words.length || !sentences.length) return 0;
  const syllables = words.reduce((total, word) => total + countSyllables(word), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  let count = 0;
  let prevVowel = false;
  for (const ch of w) {
    const isVowel = "aeiouy".includes(ch);
    if (isVowel && !prevVowel) count += 1;
    prevVowel = isVowel;
  }
  if (w.endsWith("e") && count > 1) count -= 1;
  return Math.max(count, 1);
}
