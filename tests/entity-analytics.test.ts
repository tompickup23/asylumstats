import { describe, expect, test } from "vitest";

import {
  getEntityExposureSummary,
  getEntityLinkedPlaceRankings,
  getEntityRegionSpread
} from "../src/lib/entity-analytics";
import { getEntityProfile } from "../src/lib/entities";

describe("entity analytics helpers", () => {
  test("summarizes non-resolved exposure for named-estate profiles", () => {
    const serco = getEntityProfile("supplier_serco");

    expect(serco).toBeTruthy();

    const summary = getEntityExposureSummary(serco!);

    expect(summary.currentSiteCount).toBe(2);
    expect(summary.nonResolvedCurrentSiteCount).toBe(2);
    expect(summary.unresolvedCurrentSiteCount).toBe(1);
    expect(summary.partialCurrentSiteCount).toBe(1);
    expect(summary.resolvedCurrentSiteCount).toBe(0);
    expect(summary.leadArea?.areaName).toBe("Epping Forest");
  });

  test("groups named-estate footprint by region", () => {
    const mears = getEntityProfile("supplier_mears");

    expect(mears).toBeTruthy();

    const spread = getEntityRegionSpread(mears!);

    expect(spread.length).toBeGreaterThanOrEqual(1);
    expect(spread[0]?.regionName).toBe("Yorkshire and The Humber");
    expect(spread[0]?.currentSiteCount).toBe(2);
    expect(spread[0]?.areaNames).toEqual(expect.arrayContaining(["North Yorkshire", "Wakefield"]));
  });

  test("ranks linked places and stays empty for money-only profiles", () => {
    const serco = getEntityProfile("supplier_serco");
    const publicBodies = getEntityProfile("supplier_participating_local_authorities");

    expect(serco).toBeTruthy();
    expect(publicBodies).toBeTruthy();

    const sercoRankings = getEntityLinkedPlaceRankings(serco!);
    const publicBodyRankings = getEntityLinkedPlaceRankings(publicBodies!);

    expect(sercoRankings[0]?.areaName).toBe("Epping Forest");
    expect(sercoRankings[0]?.rank).toBe(1);
    expect(publicBodyRankings).toHaveLength(0);
  });
});
