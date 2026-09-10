import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The hero cycles three cost figures, and the reason this file exists is that the last
 * time this page carried two cost figures it contradicted itself in public.
 *
 * The hero said "£62 per income taxpayer per year" for hotels while the strip below said
 * £234 for the whole system. Both were arithmetically right. They were different scopes
 * printed in the same unit on the same screen, so they read as the site not knowing its
 * own number, and search engines quoted the smaller one back. The rule that came out of
 * it is the site's general basis rule: figures on different bases may sit side by side
 * with both named, never summed and never presented as versions of one quantity.
 *
 * So each panel has to carry its own scope, period, basis and source, the three have to
 * use three different units, and the per-taxpayer figure has to keep saying it is an
 * attribution rather than a saving. Those are the things asserted here.
 */
const DIST = join(__dirname, "../dist/index.html");

describe.skipIf(!existsSync(DIST))("homepage hero statistics", () => {
  const html = existsSync(DIST) ? readFileSync(DIST, "utf8") : "";
  const payload = /<script type="application\/json" data-hero-stats>([\s\S]*?)<\/script>/.exec(html);

  interface HeroStat {
    id: string; value: string; label: string; deck: string; basis: string;
    sourceLabel: string; sourceHref: string;
  }
  const stats: HeroStat[] = payload ? JSON.parse(payload[1]) : [];

  it("ships the rotating panels as data", () => {
    expect(payload, "no hero stats payload in the built homepage").not.toBeNull();
    expect(stats.length).toBeGreaterThanOrEqual(2);
  });

  it("gives every panel a basis and a source", () => {
    for (const stat of stats) {
      expect(stat.basis?.trim(), `${stat.id} has no basis`).toBeTruthy();
      expect(stat.sourceHref?.trim(), `${stat.id} has no source`).toBeTruthy();
      expect(stat.sourceLabel?.trim(), `${stat.id} has no source label`).toBeTruthy();
      // Every basis names the period it covers, because a cost figure without a year is
      // the defect this page has already shipped once.
      expect(stat.basis, `${stat.id} basis names no period`).toMatch(/20\d\d/);
    }
  });

  it("never repeats a unit, so no two panels read as the same quantity", () => {
    // The 2026 failure was two figures in the same unit at different scopes. Distinct
    // units are what stops a reader treating one panel as a correction of another.
    const units = stats.map((stat) => stat.label.replace(/[\d£,.]/g, "").trim().toLowerCase());
    expect(new Set(units).size, `two panels share a unit:\n${units.join("\n")}`).toBe(units.length);
  });

  it("states the per-taxpayer figure as an attribution, not a saving", () => {
    const perTaxpayer = stats.find((stat) => stat.id === "taxpayer");
    expect(perTaxpayer, "the per-taxpayer panel is gone").toBeDefined();
    // It is the system cost divided by taxpayers. Most of the total is average-attributed
    // capacity that would not fall away with the caseload, so it is not a sum anyone gets
    // back, and the panel has to say so rather than leave the reader to assume.
    expect(perTaxpayer!.deck).toMatch(/not a sum that would be saved/i);
    // The range travels with the central figure.
    expect(perTaxpayer!.deck).toMatch(/Range £\d+\s*to\s*£\d+/i);
    expect(perTaxpayer!.label).toMatch(/whole system/i);
  });

  it("keeps the hotel panel scoped to hotels and its own year", () => {
    const hotels = stats.find((stat) => stat.id === "hotels");
    expect(hotels, "the hotel panel is gone").toBeDefined();
    expect(hotels!.basis).toMatch(/hotel accommodation only/i);
  });

  it("renders exactly one h1, holding one figure", () => {
    // The panels are data, not stacked markup. Three headline numbers in the h1 would
    // reach a crawler as one incoherent title and a no-JS reader as three claims at once.
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "";
    const figures = h1.match(/£[\d,.]+[MBbn]*/g) ?? [];
    expect(figures.length, `h1 carries ${figures.length} figures: ${figures.join(", ")}`).toBe(1);
  });

  it("renders a dot per panel, so the controls cannot drift from the data", () => {
    // Count elements, not occurrences of the string: the inline script contains the
    // selector "[data-hero-dot]" too, and matching raw text counted that as a fourth dot.
    const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");
    expect((markup.match(/data-hero-dot(?!s)/g) ?? []).length).toBe(stats.length);
  });

  it("ships a pause control, because the rotation is auto-updating content", () => {
    // WCAG 2.2 SC 2.2.2: information that updates automatically alongside other content
    // has to be pausable. The site's accessibility statement commits to 2.2 AA.
    expect(html).toContain("data-hero-toggle");
    expect(html).toMatch(/prefers-reduced-motion/);
  });
});
