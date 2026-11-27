import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadLocalRouteLatest, loadRouteDashboard } from "../src/lib/route-data";

/**
 * Findings that quote one quarter's council and national figures, checked against the
 * data for the quarter they name.
 *
 * Each finding says which quarter end it describes. While that is the quarter the marts
 * hold, every table cell and figure-bearing sentence is recomputed here. Once a refresh
 * moves the marts on, the finding is describing an earlier edition the marts no longer
 * carry in full, so its block is skipped: a dated page that was right for its date is
 * not an error, and a test that failed on it would park the refresh, which is what
 * happened on 26 November 2026. No figure is typed in this file.
 */

const local = loadLocalRouteLatest();
const dynamics = loadRouteDashboard().nationalSystemDynamics;
const areas = local.areas;
const fmt = (n: number) => n.toLocaleString("en-GB");
const halfUp = (rate: number) => (Math.floor(rate * 10 + 0.5) / 10).toFixed(1);
const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
};
const MONTHS: Record<string, string> = { March: "03", June: "06", September: "09", December: "12" };
const longDate = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-");
  return `${Number(d)} ${Object.keys(MONTHS).find((k) => MONTHS[k] === m)} ${y}`;
};
const CURRENT = longDate(local.snapshotDate);

function read(slug: string) {
  const md = readFileSync(join(process.cwd(), "src/content/findings", `${slug}.md`), "utf8");
  const label = /stat_label: "([^"]+)"/.exec(md)![1];
  const body = md.slice(md.indexOf("---", 3) + 3);
  return { md, body, flat: body.replace(/\s+/g, " "), current: label.endsWith(CURRENT) };
}
const cells = (body: string) =>
  body
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((c) => c.replace(/\*\*/g, "").trim()));
const byName = (name: string) => areas.find((a) => a.areaName === name)!;
const rateRank = (name: string) =>
  areas.filter((a) => (a.supportedAsylumRate ?? 0) > (byName(name).supportedAsylumRate ?? 0)).length + 1;
const countRank = (name: string) =>
  areas.filter((a) => a.supportedAsylum > byName(name).supportedAsylum).length + 1;
const total = areas.reduce((t, a) => t + a.supportedAsylum, 0);
const latest = dynamics.latestQuarter;

describe("one in five is in ten councils", () => {
  const f = read("concentration-top-10-areas");
  it.skipIf(!f.current)("prints the ten largest councils, their sum and their share", () => {
    const top = [...areas].sort((a, b) => b.supportedAsylum - a.supportedAsylum).slice(0, 10);
    const rows = cells(f.body).filter((c) => c.length === 2 && c[0] !== "Council");
    expect(rows).toEqual(top.map((a) => [a.areaName, fmt(a.supportedAsylum)]));
    const held = top.reduce((t, a) => t + a.supportedAsylum, 0);
    const share = (Math.round((held / total) * 1000) / 10).toFixed(1);
    expect(f.flat).toContain(`**${fmt(held)} of the ${fmt(total)} people on asylum support** at ${CURRENT}`);
    expect(f.flat).toContain(`**${share}%** of the UK total in ten places out of ${areas.length}`);
    expect(f.flat).toContain(`They now hold ${share}%`);
    expect(f.md).toContain(`headline: "${fmt(total)} on asylum support.`);
    const none = areas.filter((a) => a.supportedAsylum === 0).length;
    expect(f.flat).toContain(`${none} of the ${areas.length} councils have nobody on asylum support`);
  });

  it.skipIf(!f.current)("names the councils that are in both top tens", () => {
    const byCount = [...areas].sort((a, b) => b.supportedAsylum - a.supportedAsylum).slice(0, 10);
    const both = byCount.filter((a) => rateRank(a.areaName) <= 10).map((a) => a.areaName);
    for (const name of both) expect(f.flat).toContain(name);
    expect(both).toHaveLength(3);
    expect(f.flat).toContain("are in both lists");
  });
});

describe("Lancashire per head table", () => {
  const f = read("lancashire-rate-table-top-nine");
  it.skipIf(!f.current)("prints the ten highest rates in order, with counts", () => {
    const top = [...areas].sort((a, b) => (b.supportedAsylumRate ?? 0) - (a.supportedAsylumRate ?? 0)).slice(0, 10);
    const rows = cells(f.body).filter((c) => c.length === 4 && /^\d+$/.test(c[0]));
    expect(rows).toEqual(
      top.map((a, i) => [String(i + 1), a.areaName, fmt(a.supportedAsylum), halfUp(a.supportedAsylumRate!)])
    );
  });

  it.skipIf(!f.current)("has four Lancashire authorities in that ten, at the ranks it states", () => {
    const four = ["Hyndburn", "Blackburn with Darwen", "Burnley", "Pendle"];
    for (const name of four) expect(rateRank(name), name).toBeLessThanOrEqual(10);
    expect(f.flat).toContain(
      `Burnley is ${ordinal(countRank("Burnley"))} of ${areas.length} and Hyndburn ${ordinal(countRank("Hyndburn"))}`
    );
    expect(f.flat).toContain(`they are ${ordinal(rateRank("Burnley"))} and ${ordinal(rateRank("Hyndburn"))}`);
    const line = (name: string) => `${ordinal(rateRank(name))}`;
    expect(f.flat).toContain(
      `Preston is ${line("Preston")} by rate on ${halfUp(byName("Preston").supportedAsylumRate!)} per 10,000, Blackpool ${line("Blackpool")} on ${halfUp(byName("Blackpool").supportedAsylumRate!)}, and Ribble Valley ${line("Ribble Valley")} on ${halfUp(byName("Ribble Valley").supportedAsylumRate!)}`
    );
  });
});

describe("Ribble Valley and Hyndburn", () => {
  const f = read("ribble-valley-vs-blackpool");
  it.skipIf(!f.current)("prints each council's count, rate and rank", () => {
    const rows = cells(f.body).filter((c) => c.length === 4 && c[0] !== "Council");
    expect(rows.length).toBe(6);
    for (const [name, count, rate, rank] of rows) {
      const a = byName(name);
      expect([name, count, rate, rank]).toEqual([
        name,
        fmt(a.supportedAsylum),
        halfUp(a.supportedAsylumRate!),
        ordinal(rateRank(name))
      ]);
    }
  });

  it.skipIf(!f.current)("states the ratio the two rates give", () => {
    const ratio = (byName("Hyndburn").supportedAsylumRate! / byName("Ribble Valley").supportedAsylumRate!).toFixed(1);
    expect(f.md).toContain(`stat_value: "${ratio}x"`);
    expect(f.flat).toContain(`so the gap is ${ratio} times`);
  });
});

describe("backlog finding", () => {
  const f = read("backlog-awaiting-decision");
  const series = dynamics.stockSeries.awaitingInitialDecision;
  it.skipIf(!f.current)("prints the series values for the dates it lists", () => {
    const rows = cells(f.body).filter((c) => c.length === 2 && /^\d/.test(c[0]));
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const [date, value] of rows) {
      const [d, m, y] = date.split(" ");
      const point = series.find((p) => p.periodEnd === `${y}-${MONTHS[m]}-${d.padStart(2, "0")}`);
      expect(point, date).toBeTruthy();
      expect(value.replace(" (the peak)", ""), date).toBe(fmt(point!.value));
    }
    const peak = series.reduce((a, b) => (b.value > a.value ? b : a));
    expect(rows.find((r) => r[1].includes("(the peak)"))![1]).toBe(`${fmt(peak.value)} (the peak)`);
  });

  it.skipIf(!f.current)("states the latest quarter's claims, decisions and outcomes", () => {
    const prev = series[series.length - 2].value;
    expect(f.flat).toContain(`**${fmt(latest.awaitingInitialDecision)} people** were waiting`);
    expect(f.flat).toContain(`That is ${fmt(latest.awaitingInitialDecision - prev)} more than three months earlier`);
    expect(f.flat).toContain(
      `**${fmt(latest.claims)} new claims** against **${fmt(latest.initialDecisions)} initial decisions**, a gap of ${fmt(latest.claims - latest.initialDecisions)}`
    );
    expect(f.flat).toContain(
      `${fmt(latest.initialGrants)} were grants of protection, ${fmt(latest.initialRefusals)} refusals, ${fmt(latest.initialWithdrawals)} withdrawals and ${fmt(latest.initialAdministrativeOutcomes)} administrative outcomes`
    );
    expect(f.flat).toContain(`${fmt(latest.supportedAsylum)} people were on asylum support at the same date`);
    // Falls before the latest rise, counted from the series.
    let falls = 0;
    for (let i = series.length - 2; i > 0 && series[i].value < series[i - 1].value; i--) falls++;
    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
    expect(f.flat).toContain(`each of the ${words[falls]} quarters before`);
  });
});

describe("military sites piece", () => {
  const f = read("military-sites-asylum-accommodation");
  it.skipIf(!f.current)("sets the two sites against the national totals of the same date", () => {
    const other = dynamics.latestSupportBreakdown.find((b) => b.metricId === "other")!.value;
    const rows = cells(f.body).filter((c) => c.length === 4 && /Wethersfield|Crowborough/.test(c[0]));
    const sites = rows.reduce((t, r) => t + Number(r[1].replace(/,/g, "")), 0);
    expect(sites).toBe(other);
    expect(f.flat).toContain(`**${fmt(other)} people on two sites.** At ${CURRENT}`);
    expect(f.flat).toContain(
      `**${((other / latest.supportedAsylum) * 100).toFixed(1)}% of the ${fmt(latest.supportedAsylum)} people on asylum support**, against ${fmt(latest.hotelAccommodation)} in hotels`
    );
    expect(f.flat).toContain(`that category held ${fmt(other)}, the same as the two sites combined`);
  });
});
