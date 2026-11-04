import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { advanceHeldReleases, heldReleaseFromReg02 } from "../scripts/lib/held-releases.mjs";
import {
  changeFirstLine,
  changeSourceLine,
  changeTitleClause,
  heldReleases,
  releaseChange,
  type HeldRelease
} from "../src/lib/release-change";
import { buildPlaceTitle, titleFits } from "../src/lib/serp";
import localRouteLatest from "../data/marts/uk_routes/local-route-latest.json";

/**
 * R505: each place page's title and first line carry the change in the area's asylum
 * support count since the previous Home Office release, from the two releases the site
 * holds. Shape and agreement only: no figure from one release is pinned here, because a
 * pinned figure fails on the next release and blocks every deploy behind it.
 */

function release(snapshotDate: string, areas: HeldRelease["areas"], label = "year ending June 2026"): HeldRelease {
  return {
    snapshotDate,
    release: `Immigration system statistics, ${label}`,
    releaseDate: "2026-08-27",
    releasePage: "https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-june-2026",
    table: "Reg_02",
    fileName: "regional-and-local-authority-dataset-jun-2026.ods",
    sourceUrl: "https://assets.publishing.service.gov.uk/media/x/regional-and-local-authority-dataset-jun-2026.ods",
    fileSha256: "0".repeat(64),
    areas
  };
}

const june = release("2026-06-30", {
  E1: { areaName: "Up", supportedAsylum: 471 },
  E2: { areaName: "Down", supportedAsylum: 1000 },
  E3: { areaName: "Same", supportedAsylum: 12 },
  E4: { areaName: "Withheld before", supportedAsylum: 30 },
  E5: { areaName: "New code", supportedAsylum: 321 }
});
const march = release(
  "2026-03-31",
  {
    E1: { areaName: "Up", supportedAsylum: 455 },
    E2: { areaName: "Down", supportedAsylum: 1003 },
    E3: { areaName: "Same", supportedAsylum: 12 },
    E4: { areaName: "Withheld before", supportedAsylum: null, withheld: "*" },
    E9: { areaName: "Old code", supportedAsylum: 300 }
  },
  "year ending March 2026"
);
const both = [june, march];

describe("change since the last release", () => {
  it("states a rise as count and direction, with both dates", () => {
    const change = releaseChange("E1", both);
    expect(change).toMatchObject({ comparable: true, direction: "up", delta: 16, current: 471, previous: 455 });
    expect(changeTitleClause(change)).toBe("up 16 since March");
    expect(changeFirstLine(change)).toBe("471 on asylum support at 30 June 2026, up 16 from 455 at 31 March 2026.");
  });

  it("states a fall and no change in the same form", () => {
    expect(changeTitleClause(releaseChange("E2", both))).toBe("down 3 since March");
    expect(changeFirstLine(releaseChange("E2", both))).toBe("1,000 on asylum support at 30 June 2026, down 3 from 1,003 at 31 March 2026.");
    expect(changeTitleClause(releaseChange("E3", both))).toBe("unchanged since March");
    expect(changeFirstLine(releaseChange("E3", both))).toBe("12 on asylum support at 30 June 2026, unchanged from 12 at 31 March 2026.");
  });

  it("says not comparable, with no number, where the previous figure was withheld", () => {
    const change = releaseChange("E4", both);
    expect(change.comparable).toBe(false);
    expect(changeTitleClause(change)).toBeNull();
    const line = changeFirstLine(change);
    expect(line).toContain("not comparable");
    expect(line).toContain("withheld");
    expect(line.replace("30 on asylum support at 30 June 2026", "").replace("31 March 2026", "")).not.toMatch(/\d/);
  });

  it("says not comparable where the area's code is not in both releases", () => {
    const change = releaseChange("E5", both);
    expect(change).toMatchObject({ comparable: false, reason: "not_in_both_releases", current: 321 });
    expect(changeFirstLine(change)).toBe(
      "321 on asylum support at 30 June 2026. Change since 31 March 2026: not comparable, because the two releases do not both list this area's code."
    );
  });

  it("says not comparable when only one release is held", () => {
    const change = releaseChange("E1", [june]);
    expect(change.comparable).toBe(false);
    expect(changeTitleClause(change)).toBeNull();
    expect(changeFirstLine(change)).toContain("not comparable");
  });

  it("names what is counted, the table and both releases", () => {
    const line = changeSourceLine(releaseChange("E1", both));
    expect(line).toContain("asylum support");
    expect(line).toContain("Home Office");
    expect(line).toContain("Reg_02");
    expect(line).toContain("year ending June 2026");
    expect(line).toContain("year ending March 2026");
  });

  it("writes no dashes", () => {
    for (const code of ["E1", "E2", "E3", "E4", "E5"]) {
      const change = releaseChange(code, both);
      for (const text of [changeFirstLine(change), changeTitleClause(change) ?? "", changeSourceLine(change)]) {
        expect(text).not.toMatch(/[–—]| - /);
      }
    }
  });
});

describe("the title carries the change", () => {
  it("leads with the change where it fits, and every title fits", () => {
    const title = buildPlaceTitle({ areaName: "Burnley", supportedAsylum: 471, change: "up 16 since March" });
    expect(title).toContain("471");
    expect(title).toContain("up 16 since March");
    expect(titleFits(title)).toBe(true);
  });

  it("is unchanged where there is no comparable change", () => {
    expect(buildPlaceTitle({ areaName: "Burnley", supportedAsylum: 471, change: null })).toBe(
      buildPlaceTitle({ areaName: "Burnley", supportedAsylum: 471 })
    );
  });

  it("keeps the count in every real area's title, and the change in most", () => {
    let withChange = 0;
    let comparable = 0;
    for (const area of localRouteLatest.areas) {
      const clause = changeTitleClause(releaseChange(area.areaCode));
      const title = buildPlaceTitle({ areaName: area.areaName, supportedAsylum: area.supportedAsylum, change: clause });
      expect(titleFits(title) || !title.includes(area.supportedAsylum.toLocaleString("en-GB"))).toBe(true);
      if (clause) comparable += 1;
      if (clause && title.includes(clause)) withChange += 1;
    }
    expect(comparable).toBeGreaterThan(0);
    expect(withChange / comparable).toBeGreaterThan(0.9);
  });
});

describe("the held releases", () => {
  const held = heldReleases();

  it("hold the release on the site first and an earlier one second", () => {
    expect(held.length).toBeGreaterThanOrEqual(1);
    expect(held.length).toBeLessThanOrEqual(2);
    expect(held[0].snapshotDate).toBe(localRouteLatest.snapshotDate);
    if (held[1]) expect(held[1].snapshotDate < held[0].snapshotDate).toBe(true);
    for (const entry of held) {
      expect(entry.table).toBe("Reg_02");
      expect(entry.sourceUrl).toMatch(/^https:\/\/assets\.publishing\.service\.gov\.uk\//);
      expect(entry.releasePage).toMatch(/^https:\/\/www\.gov\.uk\/government\/statistics\/immigration-system-statistics-year-ending-/);
      expect(entry.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("agree with the mart for every area on the site", () => {
    for (const area of localRouteLatest.areas) {
      expect(held[0].areas[area.areaCode]?.supportedAsylum, area.areaCode).toBe(area.supportedAsylum);
    }
  });

  it("give every area a change or a reason, and each change is the difference of two held figures", () => {
    for (const area of localRouteLatest.areas) {
      const change = releaseChange(area.areaCode);
      if (change.comparable) {
        const before = held[1].areas[area.areaCode].supportedAsylum!;
        expect(change.delta).toBe(area.supportedAsylum - before);
      } else {
        expect(changeFirstLine(change)).toContain("not comparable");
      }
    }
  });
});

describe("advancing the held releases", () => {
  const a = release("2026-03-31", {});
  const b = release("2026-06-30", {});
  const c = release("2026-09-30", {});

  it("starts with one, replaces the current release in place, and keeps two", () => {
    expect(advanceHeldReleases(null, b).releases).toEqual([b]);
    const refreshed = { ...b, fileSha256: "1".repeat(64) };
    expect(advanceHeldReleases({ releases: [b, a] }, refreshed).releases).toEqual([refreshed, a]);
    expect(advanceHeldReleases({ releases: [b, a] }, c).releases).toEqual([c, b]);
  });

  it("refuses to move backwards", () => {
    expect(() => advanceHeldReleases({ releases: [c, b] }, a)).toThrow(/older/);
  });

  it("keeps a withheld cell as null with its marker, never zero", () => {
    const rows = [
      ["Barnsley", "Yorkshire and The Humber", "E08000038", 1, 1, 0, 1, 0, 321],
      ["City of London", "London", "E09000001", "*", 6, 0, 6, 0, "*"],
      ["Total", "", "", 0, 0, 0, 0, 0, 999]
    ];
    const held = heldReleaseFromReg02(rows, { snapshotDate: "2026-06-30" }) as unknown as { areas: Record<string, unknown> };
    expect(held.areas.E08000038).toEqual({ areaName: "Barnsley", supportedAsylum: 321 });
    expect(held.areas.E09000001).toEqual({ areaName: "City of London", supportedAsylum: null, withheld: "*" });
    expect(Object.keys(held.areas)).toEqual(["E08000038", "E09000001"]);
  });
});

const DIST = resolve(import.meta.dirname ?? __dirname, "../dist/places");
const built = existsSync(DIST);

describe.skipIf(!built)("built place pages", () => {
  it("print the change, or not comparable, as the first line under the heading", () => {
    const pages = readdirSync(DIST).filter((name) => existsSync(join(DIST, name, "index.html")));
    let read = 0;
    for (const name of pages) {
      const html = readFileSync(join(DIST, name, "index.html"), "utf8");
      const head = /<section class="page-head">([\s\S]*?)<\/section>/.exec(html)?.[1];
      if (!head || !html.includes("<h1>")) continue;
      const first = /<p class="release-change"[^>]*>([\s\S]*?)<\/p>/.exec(head)?.[1]?.replace(/<[^>]+>/g, "");
      expect(first, name).toBeTruthy();
      expect(first, name).toMatch(/on asylum support at|No published count/);
      expect(first, name).toMatch(/\b(up|down|unchanged)\b|not comparable/);
      read += 1;
    }
    expect(read).toBeGreaterThan(100);
  });
});
