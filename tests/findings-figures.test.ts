import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { areasBelowFiftyBy, distinctAreaCodes } from "../src/lib/ethnic-projections";
import { plausibleThrough } from "../src/lib/projection-plausibility";
import rawProjections from "../src/data/live/ethnic-projections.json";
import areaSeries from "../src/data/live/area-series.json";
import migration from "../src/data/live/migration-ethnicity.json";

/**
 * Figures quoted in findings prose, checked against the data file each comes
 * from, in the pattern of tests/published-projection-figures.test.ts: each check
 * reads the number out of the sentence and compares it with the file, so a
 * refresh passes if the prose moves with it and fails, naming the sentence, if it
 * does not. No release figure is typed here.
 *
 * Added with the corrections of 12 October 2026. Dated correction notices
 * (markdown blockquotes) are left out: they record what was true on their date.
 */

const read = (slug: string) => readFileSync(join(process.cwd(), "src", "content", "findings", `${slug}.md`), "utf8");

const prose = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ");

const grab = (text: string, re: RegExp, label: string): string[] => {
  const m = text.match(re);
  if (!m) throw new Error(`${label}: sentence not found (${re}). Update this test with the prose.`);
  return m.slice(1);
};

const areas = (rawProjections as any).areas as Record<string, any>;
const series = areaSeries as Array<{ areaCode: string; periodEnd: string; value: number }>;
const supported = (code: string, periodEnd: string) =>
  series.find((p) => p.areaCode === code && p.periodEnd === periodEnd)?.value;
const latest = (code: string) =>
  series.filter((p) => p.areaCode === code).sort((a, b) => a.periodEnd.localeCompare(b.periodEnd)).at(-1)!;

const WORDS: Record<string, number> = { four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

describe("86-areas finding: areas withheld from the count", () => {
  it("names the number and the areas the plausibility guard withholds at 2051", () => {
    const text = prose(read("86-areas-minority-wbi-2051"));
    const [word, names] = grab(text, /cuts that to (\w+) areas whose 2051 is still withheld: ([^.]+)\./, "withheld");
    const withheld = distinctAreaCodes().filter((c) => {
      const a = areas[c];
      const wb = a?.projections?.["2051"]?.white_british;
      const through = plausibleThrough(a);
      return wb != null && wb < 50 && !(through != null && through >= 2051);
    });
    expect(WORDS[word] ?? Number(word)).toBe(withheld.length);
    expect(WORDS[word] ?? Number(word)).toBe(areasBelowFiftyBy(2051).withheld);
    const quoted = names.split(/, | and /).map((s) => s.trim()).sort();
    expect(quoted).toEqual(withheld.map((c) => areas[c].areaName).sort());
  });
});

describe("Blackburn finding", () => {
  const text = prose(read("blackburn-minority-wb-2027"));

  it("quotes the 2011 White British share from the Census baseline", () => {
    const [share] = grab(text, /Down from ([\d.]+)% in 2011/, "2011 share");
    expect(share).toBe(areas.E06000008.baseline.groups.white_british.toFixed(1));
  });

  it("quotes Preston's and Burnley's asylum support from the Home Office series", () => {
    for (const [name, code] of [["Preston", "E07000123"], ["Burnley", "E07000117"]] as const) {
      const [dec, jun] = grab(
        text,
        new RegExp(`${name}\\.[^]*?(\\d+) on asylum support at 31 December 2025, (\\d+) at 30 June 2026`),
        name
      );
      expect(Number(dec)).toBe(supported(code, "2025-12-31"));
      expect(Number(jun)).toBe(supported(code, "2026-06-30"));
      // "at 30 June 2026" must stay the latest quarter, or the sentence is stale.
      expect(latest(code).periodEnd).toBe("2026-06-30");
    }
  });
});

describe("Birmingham finding", () => {
  const raw = read("birmingham-demographic-transformation");
  const text = prose(raw);
  const b = areas.E08000025;

  it("quotes the projection table from the projection data", () => {
    for (const year of ["2031", "2041", "2051", "2061"]) {
      const [share] = grab(text, new RegExp(`\\| ${year} \\| ([\\d.]+)% \\|`), `row ${year}`);
      expect(share).toBe(b.projections[year].white_british.toFixed(1));
    }
    const badge = raw.match(/^stat_value: "(\d+)% → (\d+)%"$/m);
    expect(badge).not.toBeNull();
    expect(Number(badge![1])).toBe(Math.round(b.current.groups.white_british));
    expect(Number(badge![2])).toBe(Math.round(b.projections["2051"].white_british));
  });

  it("quotes religion shares and the crossing from the religion series", () => {
    const [muslim, christian] = grab(text, /Muslim population: ([\d.]+)% in 2021\. Christian: ([\d.]+)%/, "religion 2021");
    expect(muslim).toBe(b.religion["2021"].Muslim.toFixed(1));
    expect(christian).toBe(b.religion["2021"].Christian.toFixed(1));
    const [m41, m51] = grab(text, /Muslim at ([\d.]+)% in 2041 and ([\d.]+)% in 2051/, "religion projection");
    expect(m41).toBe(b.religion["2041"].Muslim.toFixed(1));
    expect(m51).toBe(b.religion["2051"].Muslim.toFixed(1));
  });

  it("quotes international arrivals and the White British count change from the data", () => {
    const [pct] = grab(text, /([\d.]+)% of the population had moved to it from outside the UK/, "arrivals");
    expect(Number(pct)).toBe((migration as any).areas.E08000025.internationalMigrantsPct);
    const [gain, loss, from, to] = grab(text, /gained ([\d,]+) residents between the two Censuses and lost ([\d,]+) White British ones, from ([\d,]+) to ([\d,]+)/, "counts");
    const n = (s: string) => Number(s.replace(/,/g, ""));
    expect(n(gain)).toBe(b.current.total_population - b.baseline.total_population);
    expect(n(from)).toBe(b.baseline.groups_absolute.white_british);
    expect(n(to)).toBe(b.current.groups_absolute.white_british);
    expect(n(loss)).toBe(n(from) - n(to));
  });
});
