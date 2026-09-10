import { describe, it, expect } from "vitest";
import {
  pixelWidth, titleWidth, descriptionWidth, firstThatFits,
  buildPlaceTitle, buildPlaceDescription,
  TITLE_LIMIT_PX, DESCRIPTION_LIMIT_PX, BRAND_SUFFIX
} from "../src/lib/serp";
import { loadLocalRouteLatest } from "../src/lib/route-data";

describe("pixel measurement", () => {
  it("matches Chromium's measureText on a real title", () => {
    // Measured in headless Chromium at 20px Arial when the table was generated. If this
    // drifts the table has been edited by hand or the normalisation is wrong.
    expect(titleWidth("How many asylum seekers are in Birmingham?")).toBeCloseTo(417.93, 1);
  });

  it("scales linearly with font size", () => {
    const text = "Asylum seekers in Blackburn with Darwen";
    expect(pixelWidth(text, 14)).toBeCloseTo(pixelWidth(text, 20) * 14 / 20, 2);
  });

  it("separates strings a character count cannot", () => {
    // Same length, 30px apart. This is the argument for measuring rather than counting.
    expect("Wiltshire".length).toBe("illllllll".length);
    expect(titleWidth("Wiltshire") - titleWidth("illllllll")).toBeGreaterThan(25);
  });

  it("falls back for characters outside the table rather than measuring them as zero", () => {
    expect(pixelWidth("字", 20)).toBeGreaterThan(0);
  });
});

describe("firstThatFits", () => {
  it("takes the first candidate within budget", () => {
    expect(firstThatFits(["a".repeat(200), "short"], TITLE_LIMIT_PX)).toBe("short");
  });

  it("returns the last candidate when none fit, rather than truncating", () => {
    const all = ["a".repeat(300), "b".repeat(200)];
    expect(firstThatFits(all, TITLE_LIMIT_PX)).toBe("b".repeat(200));
  });
});

describe("place titles", () => {
  const areas = loadLocalRouteLatest().areas;

  it("fits every one of the real area names", () => {
    const over = areas
      .map((a) => buildPlaceTitle({ areaName: a.areaName, supportedAsylum: a.supportedAsylum }))
      .filter((t) => titleWidth(t) > TITLE_LIMIT_PX);
    expect(over).toEqual([]);
  });

  it("keeps the count on every area, however long the name", () => {
    const withoutCount = areas
      .map((a) => buildPlaceTitle({ areaName: a.areaName, supportedAsylum: a.supportedAsylum }))
      .filter((t) => !/\d/.test(t));
    expect(withoutCount).toEqual([]);
  });

  it("asks the question on the great majority of areas", () => {
    const asking = areas.filter((a) =>
      buildPlaceTitle({ areaName: a.areaName, supportedAsylum: a.supportedAsylum }).startsWith("How many")
    );
    expect(asking.length / areas.length).toBeGreaterThan(0.85);
  });

  it("says 'person' rather than 'people' for a single supported person", () => {
    expect(buildPlaceTitle({ areaName: "West Devon", supportedAsylum: 1 })).toContain("1 person on support");
  });

  it("would not fit if the brand suffix came back", () => {
    // Documents why place pages pass brandTitle={false}. If this ever passes, the suffix
    // could be restored.
    const title = buildPlaceTitle({ areaName: "Birmingham", supportedAsylum: 2136 });
    expect(titleWidth(title + BRAND_SUFFIX)).toBeGreaterThan(TITLE_LIMIT_PX);
  });
});

describe("place descriptions", () => {
  const areas = loadLocalRouteLatest().areas;

  it("fits every area, with or without an MP", () => {
    const over = areas
      .map((a, i) => buildPlaceDescription({
        areaName: a.areaName,
        supportedAsylum: a.supportedAsylum,
        rank: i + 1,
        areaCount: areas.length,
        ratePer10k: a.supportedAsylumRate,
        mp: "Wilhelmina Featherstonehaugh-Cholmondeley (Liberal Democrats)"
      }))
      .filter((d) => descriptionWidth(d) > DESCRIPTION_LIMIT_PX);
    expect(over).toEqual([]);
  });

  it("keeps the count and the rank even when everything else is dropped", () => {
    const d = buildPlaceDescription({
      areaName: "Bournemouth, Christchurch and Poole",
      supportedAsylum: 333, rank: 93, areaCount: 361, ratePer10k: 8.21,
      mp: "Wilhelmina Featherstonehaugh-Cholmondeley (Liberal Democrats)"
    });
    expect(d).toContain("333 people");
    expect(d).toContain("93rd highest");
  });
});
