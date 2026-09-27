import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getExplainers } from "../src/lib/explainers";
import { initialGrantRate, grantRateSeries } from "../src/lib/headline-figures";
import { descriptionWidth, titleWidth, DESCRIPTION_LIMIT_PX, TITLE_LIMIT_PX } from "../src/lib/serp";

const explainers = getExplainers();
const findingSlugs = new Set(
  readdirSync(join(process.cwd(), "src/content/findings")).map((file) => file.replace(/\.md$/, ""))
);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const wordCount = (text: string) => text.trim().split(/\s+/).length;

describe("explainers", () => {
  it("exist, with unique slugs", () => {
    expect(explainers.length).toBeGreaterThanOrEqual(5);
    expect(new Set(explainers.map((e) => e.slug)).size).toBe(explainers.length);
  });

  for (const explainer of explainers) {
    describe(explainer.slug, () => {
      it("fits its title and description in what Google renders", () => {
        expect(titleWidth(explainer.seoTitle), explainer.seoTitle).toBeLessThanOrEqual(TITLE_LIMIT_PX);
        expect(descriptionWidth(explainer.seoDescription), explainer.seoDescription).toBeLessThanOrEqual(
          DESCRIPTION_LIMIT_PX
        );
      });

      // Long enough to stand alone when lifted into a snippet, short enough to be lifted whole.
      it("answers in 30 to 70 words", () => {
        expect(wordCount(explainer.answer)).toBeGreaterThanOrEqual(30);
        expect(wordCount(explainer.answer)).toBeLessThanOrEqual(70);
      });

      it("puts its question as a question and leads the answer with a figure", () => {
        expect(explainer.question.endsWith("?")).toBe(true);
        expect(explainer.answer.slice(0, 160)).toMatch(/\d/);
      });

      it("dates and sources every figure", () => {
        expect(explainer.asAt).toMatch(ISO);
        expect(explainer.published).toMatch(ISO);
        expect(explainer.sources.length).toBeGreaterThan(0);
        for (const source of explainer.sources) expect(source.url).toMatch(/^https:\/\//);
        if (explainer.chart) expect(explainer.chart.sourceUrl).toMatch(/^https:\/\//);
        if (explainer.nextUpdate) expect(explainer.nextUpdate.date > explainer.published).toBe(true);
      });

      it("links only to pages that exist", () => {
        for (const slug of explainer.relatedFindings) expect(findingSlugs.has(slug), slug).toBe(true);
        for (const slug of explainer.relatedExplainers) {
          expect(explainers.some((e) => e.slug === slug), slug).toBe(true);
        }
      });

      it("uses no em-dashes and no unfilled values", () => {
        const text = JSON.stringify(explainer);
        expect(text).not.toContain("—");
        expect(text).not.toMatch(/undefined|NaN|null%|\[object/);
      });
    });
  }
});

describe("the grant rate", () => {
  const rate = initialGrantRate();

  // The Home Office published 38% for the year ending June 2026 ("the grant rate was 38% in
  // YE June 2026") and 48% the year before, main applicants only, withdrawals excluded.
  // The homepage printed 31.5% for the same year, dividing by every decision instead.
  it("reproduces the Home Office's published rate", () => {
    expect(rate).not.toBeNull();
    expect(rate!.windowLabel).toBe("2025 Q3 to 2026 Q2");
    expect(Math.round(rate!.pct)).toBe(38);
    expect(Math.round(rate!.previousPct!)).toBe(48);
  });

  it("is the figure the explainer and its chart publish", () => {
    const explainer = explainers.find((e) => e.slug === "uk-asylum-grant-rate")!;
    expect(explainer.figure).toBe(`${rate!.pct.toFixed(0)}%`);
    expect(grantRateSeries().at(-1)!.value).toBe(rate!.pct);
  });
});
