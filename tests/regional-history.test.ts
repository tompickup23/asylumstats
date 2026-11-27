import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REGIONS,
  latestRegionalEdition,
  regionalChange,
  regionalEdition,
  regionalEditions,
  regionalRate,
  regionalSharePct,
  unallocated
} from "../src/lib/regional-history";
import { loadLocalRouteLatest } from "../src/lib/route-data";

/**
 * The regional history, and the two findings written from it.
 *
 * No figure is typed in this file. Every number in the findings' tables and sentences is
 * read out of the markdown and recomputed from the Home Office editions the history
 * holds. The findings name the editions they compare by date, and the tests look those
 * dates up, so a new release adds an edition without touching what these pages say about
 * September 2025 and September 2026.
 */

const ENGLISH_REGIONS = REGIONS.filter((r) => !["Scotland", "Wales", "Northern Ireland"].includes(r));
const fmt = (n: number) => n.toLocaleString("en-GB");
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
const num = (s: string) => Number(s.replace(/[,%+]/g, ""));
const finding = (slug: string) =>
  readFileSync(join(process.cwd(), "src/content/findings", `${slug}.md`), "utf8");
const body = (md: string) => md.slice(md.indexOf("---", 3) + 3);
/** Table rows whose first cell is one of the given labels, as trimmed cells. */
const rowsFor = (md: string, labels: readonly string[]) =>
  md
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((c) => c.trim()))
    .filter((cells) => labels.includes(cells[0]));
const ISO_MONTH: Record<string, string> = { June: "06", September: "09" };
const iso = (day: string, month: string, year: string) => `${year}-${ISO_MONTH[month]}-${day.padStart(2, "0")}`;

describe("regional history", () => {
  const editions = regionalEditions();

  it("holds editions in date order, each with a source file and its hash", () => {
    expect(editions.length).toBeGreaterThanOrEqual(13);
    const dates = editions.map((e) => e.snapshotDate);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
    for (const edition of editions) {
      expect(edition.table).toBe("Reg_01");
      expect(edition.sourceUrl).toMatch(/^https:\/\/assets\.publishing\.service\.gov\.uk\/media\//);
      expect(edition.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("sums the English regions to the published England total in every edition", () => {
    for (const edition of editions) {
      const summed = ENGLISH_REGIONS.reduce((t, r) => t + edition.areas[r].supportedAsylum, 0);
      expect(summed, edition.snapshotDate).toBe(edition.areas.England.supportedAsylum);
    }
  });

  it("never allocates more people to regions than the UK total", () => {
    for (const edition of editions) {
      expect(unallocated(edition), edition.snapshotDate).toBeGreaterThanOrEqual(0);
    }
  });

  it("agrees with the council table of the same edition, region by region", () => {
    // Two tables of one Home Office file: Reg_01 by region here, Reg_02 by council in
    // the local mart. Skipped only if the local mart has moved to an edition this file
    // has not been rebuilt for, which the routes ingest prevents.
    const local = loadLocalRouteLatest();
    const edition = regionalEdition(local.snapshotDate);
    expect(edition, `no regional edition for ${local.snapshotDate}`).not.toBeNull();
    for (const region of REGIONS) {
      const summed = local.areas
        .filter((a) => a.regionName === region)
        .reduce((t, a) => t + a.supportedAsylum, 0);
      expect(summed, region).toBe(edition!.areas[region].supportedAsylum);
    }
    expect(latestRegionalEdition().snapshotDate >= local.snapshotDate).toBe(true);
  });
});

describe("regional shift news piece", () => {
  const md = body(finding("asylum-support-regional-shift-sep-2026"));
  const flat = md.replace(/\s+/g, " ");
  const from = regionalEdition("2025-09-30")!;
  const to = regionalEdition("2026-09-30")!;
  const quarter = regionalEdition("2026-06-30")!;
  const SOUTH = ["London", "East of England", "South East", "South West"];
  const uk = regionalChange(from, to, "United Kingdom");

  it("names the editions it compares, and the history holds them", () => {
    expect(flat).toContain("| Region or nation | 30 September 2025 | 30 September 2026 |");
    expect(from && to && quarter).toBeTruthy();
    expect(unallocated(from)).toBe(0);
    expect(unallocated(to)).toBe(0);
  });

  it("prints every region's two counts, change and percentage as the editions give them", () => {
    const rows = rowsFor(md, [...REGIONS, "United Kingdom"]).filter((c) => c.length === 5);
    expect(rows.map((c) => c[0]).sort()).toEqual([...REGIONS, "United Kingdom"].sort());
    for (const [name, a, b, change, pct] of rows) {
      const c = regionalChange(from, to, name);
      expect([name, a, b, change, pct]).toEqual([
        name,
        fmt(c.from),
        fmt(c.to),
        signed(c.change),
        `${c.changePct > 0 ? "+" : ""}${c.changePct}%`
      ]);
    }
  });

  it("orders the table from the steepest fall to the largest rise", () => {
    const rows = rowsFor(md, REGIONS).filter((c) => c.length === 5);
    const pcts = rows.map(([name]) => {
      const c = regionalChange(from, to, name);
      return c.change / c.from;
    });
    expect(pcts).toEqual([...pcts].sort((x, y) => x - y));
  });

  it("states the southern share of the fall, and the two shares, from the same editions", () => {
    const southFall = SOUTH.reduce((t, r) => t - regionalChange(from, to, r).change, 0);
    expect(flat).toContain(`${fmt(to.areas["United Kingdom"].supportedAsylum)} people on asylum support in the UK, ${fmt(-uk.change)} fewer than a year earlier`);
    expect(flat).toContain(`**${fmt(southFall)}** of that fall, **${Math.round((southFall / -uk.change) * 100)}%**`);
    expect(flat).toContain(`held ${regionalSharePct(from, SOUTH)}% of everyone on support. They now hold ${regionalSharePct(to, SOUTH)}%`);
    const risers = REGIONS.filter((r) => regionalChange(from, to, r).change > 0).sort();
    expect(risers).toEqual(["East Midlands", "Scotland", "Wales"]);
  });

  it("prints the contingency and dispersal changes the editions give", () => {
    const rows = rowsFor(md, ["London", "Scotland", "East Midlands", "United Kingdom"]).filter((c) => c.length === 3);
    expect(rows).toHaveLength(4);
    const delta = (name: string, key: "contingencyAccommodation" | "dispersalAccommodation") =>
      to.areas[name][key]! - from.areas[name][key]!;
    for (const [name, contingency, dispersal] of rows) {
      expect([name, contingency, dispersal]).toEqual([
        name,
        signed(delta(name, "contingencyAccommodation")),
        signed(delta(name, "dispersalAccommodation"))
      ]);
    }
    const ukC = from.areas["United Kingdom"].contingencyAccommodation!;
    const ukC2 = to.areas["United Kingdom"].contingencyAccommodation!;
    expect(flat).toContain(`fell by ${fmt(ukC - ukC2)}, from ${fmt(ukC)} to ${fmt(ukC2)}`);
    const notFallen = REGIONS.filter((r) => delta(r, "contingencyAccommodation") >= 0);
    expect(notFallen).toEqual(["Wales"]);
    expect(flat).toContain(`moved from ${from.areas.Wales.contingencyAccommodation} to ${to.areas.Wales.contingencyAccommodation}`);
    const gained = delta("Scotland", "dispersalAccommodation") + delta("East Midlands", "dispersalAccommodation");
    const ukGain = delta("United Kingdom", "dispersalAccommodation");
    expect(flat).toContain(`rose by ${fmt(ukGain)} across the UK`);
    expect(flat).toContain(`gained ${fmt(gained)} dispersal places, ${Math.round((gained / ukGain) * 100)}% of the UK's increase`);
  });

  it("prints the rates per 10,000 on the population the table itself carries", () => {
    expect(flat).toContain(
      `The North East has ${regionalRate(to, "North East")} people on asylum support for every 10,000 residents and the North West ${regionalRate(to, "North West")!.toFixed(1)}`
    );
    expect(flat).toContain(`The South West has ${regionalRate(to, "South West")} and the South East ${regionalRate(to, "South East")}`);
    expect(flat).toContain(`The UK figure is ${regionalRate(to, "United Kingdom")}`);
  });

  it("prints the quarter's changes from the June and September editions", () => {
    const q = (r: string) => regionalChange(quarter, to, r).change;
    expect(flat).toContain(`the UK total rose by ${q("United Kingdom")}`);
    expect(flat).toContain(`London fell by ${fmt(-q("London"))}`);
    expect(flat).toContain(`Scotland rose by ${q("Scotland")}, the East Midlands by ${q("East Midlands")} and the North West by ${q("North West")}`);
  });
});

describe("North West finding", () => {
  const md = body(finding("north-west-one-in-five"));
  const flat = md.replace(/\s+/g, " ");
  const opening = /people on asylum support in the North West at (\d{1,2}) (June|September) (\d{4})/.exec(flat)!;
  const edition = regionalEdition(iso(opening[1], opening[2], opening[3]))!;

  it("takes its table from the edition its opening line names", () => {
    expect(edition).toBeTruthy();
    const rows = rowsFor(md, REGIONS).filter((c) => c.length === 3);
    expect(rows.map((c) => c[0]).sort()).toEqual([...REGIONS].sort());
    for (const [name, count, share] of rows) {
      expect([name, count, share]).toEqual([
        name,
        fmt(edition.areas[name].supportedAsylum),
        `${regionalSharePct(edition, [name]).toFixed(1)}%`
      ]);
    }
    const counts = rows.map((c) => num(c[1]));
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("opens on the North West count and share of that edition", () => {
    expect(flat).toContain(`**${fmt(edition.areas["North West"].supportedAsylum)} people on asylum support in the North West`);
    expect(flat).toContain(`**${regionalSharePct(edition, ["North West"]).toFixed(1)}%** of the ${fmt(edition.areas["United Kingdom"].supportedAsylum)} people`);
  });

  it("prints each September in the comparison as that edition gives it", () => {
    const rows = md
      .split("\n")
      .filter((l) => /^\| \d{4} \|/.test(l))
      .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const [year, nw, nwShare, london, londonShare, uk] of rows) {
      const e = regionalEdition(`${year}-09-30`)!;
      expect(e, year).toBeTruthy();
      expect([nw, nwShare, london, londonShare, uk]).toEqual([
        fmt(e.areas["North West"].supportedAsylum),
        `${regionalSharePct(e, ["North West"]).toFixed(1)}%`,
        fmt(e.areas.London.supportedAsylum),
        `${regionalSharePct(e, ["London"]).toFixed(1)}%`,
        fmt(e.areas["United Kingdom"].supportedAsylum)
      ]);
    }
    const first = regionalEdition(`${rows[0][0]}-09-30`)!;
    const last = regionalEdition(`${rows.at(-1)![0]}-09-30`)!;
    const fall = (r: string) => fmt(first.areas[r].supportedAsylum - last.areas[r].supportedAsylum);
    expect(flat).toContain(`The UK total fell by ${fall("United Kingdom")} over those three years. London fell by ${fall("London")} and the North West by ${fall("North West")}`);
    expect(flat).toContain(`includes ${unallocated(first)} people the Home Office assigned to no region`);
    // Every other September in the table either allocates everyone or says how many it does not.
    for (const [year] of rows.slice(1)) {
      const gap = unallocated(regionalEdition(`${year}-09-30`)!);
      if (gap > 0) expect(flat, year).toContain(`the ${year} shares of one that includes ${fmt(gap)}`);
    }
  });

  it("sets the North East's rate beside the North West's, from the same edition", () => {
    expect(flat).toContain(
      `the North East is slightly higher: ${regionalRate(edition, "North East")} people on asylum support per 10,000 residents against ${regionalRate(edition, "North West")!.toFixed(1)} in the North West`
    );
    expect(regionalRate(edition, "North East")!).toBeGreaterThan(regionalRate(edition, "North West")!);
  });
});
