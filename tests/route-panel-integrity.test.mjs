import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/live/route-dashboard.json"), "utf8")
);
const homepage = readFileSync(join(process.cwd(), "src/pages/index.astro"), "utf8");

const family = (id) => dashboard.routeFamilies.find((f) => f.id === id);

describe("safe and legal humanitarian total", () => {
  // For the year ending March 2026 this reads 190,809, and 147,189 of it is extensions
  // granted to people already in the UK. Out of country grants, the ones that are actually
  // arrivals, FELL from 58,459 to 43,620 over the same year. Published without the split,
  // on a panel headed "The routes into Britain", it reads as a 155 per cent surge in people
  // coming to Britain. It is the opposite.
  it("carries its out-of-country split", () => {
    const total = family("safe_legal_total");
    expect(total).toBeDefined();
    expect(total.split).toBeDefined();
    expect(total.split.outOfCountry).toBeGreaterThan(0);
    expect(total.split.inCountry).toBeGreaterThan(0);
  });

  it("splits to the published total", () => {
    const total = family("safe_legal_total");
    expect(total.split.outOfCountry + total.split.inCountry).toBe(total.latestValue);
  });

  it("splits the same period as the headline", () => {
    const total = family("safe_legal_total");
    expect(total.split.periodLabel).toBe(total.latestPeriod);
  });

  it("says in its own note that most of it is not an arrival", () => {
    expect(family("safe_legal_total").note).toMatch(/extensions for people already in the UK/);
  });
});

describe("the homepage routes panel", () => {
  // The panel showed the top six families off the dashboard. Two of those did not belong.
  it("does not repeat the small boats figure the hero already carries", () => {
    expect(homepage).toContain("ROUTE_PANEL_IDS");
    const ids = homepage.match(/const ROUTE_PANEL_IDS = \[([^\]]+)\]/)?.[1] ?? "";
    expect(ids).not.toContain("small_boats");
  });

  it("does not put a quarter-end stock in a list of routes in", () => {
    const ids = homepage.match(/const ROUTE_PANEL_IDS = \[([^\]]+)\]/)?.[1] ?? "";
    expect(ids).not.toContain("asylum_support");
  });

  it("names only families that exist", () => {
    const ids = [...(homepage.match(/const ROUTE_PANEL_IDS = \[([^\]]+)\]/)?.[1] ?? "")
      .matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(family(id), `${id} is not a route family`).toBeDefined();
    }
  });
});
