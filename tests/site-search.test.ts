import { describe, expect, it } from "vitest";
import { getPublicEntityProfiles, getPublicPlaceAreas } from "../src/lib/site";
import { getPublicSearchEntries } from "../src/lib/site-search";

describe("site search index", () => {
  it("returns static pages, entity profiles, and public place profiles", () => {
    const entries = getPublicSearchEntries();
    const publicPlaces = getPublicPlaceAreas();
    const publicEntities = getPublicEntityProfiles();
    const pageEntries = entries.filter((entry) => entry.kind === "page");
    const entityEntries = entries.filter((entry) => entry.kind === "entity");
    const placeEntries = entries.filter((entry) => entry.kind === "place");

    expect(pageEntries.map((entry) => entry.href)).toContain("/");
    expect(pageEntries.map((entry) => entry.href)).toContain("/entities/");
    expect(pageEntries.map((entry) => entry.href)).toContain("/compare/");
    expect(entityEntries).toHaveLength(publicEntities.length);
    expect(entityEntries.map((entry) => entry.href)).toContain("/entities/supplier_serco/");
    expect(entityEntries.some((entry) => entry.searchText.includes("provider"))).toBe(true);
    expect(placeEntries).toHaveLength(publicPlaces.length);
    expect(placeEntries.every((entry) => entry.href.startsWith("/places/"))).toBe(true);
    expect(placeEntries.some((entry) => entry.searchText.includes("local authority"))).toBe(true);
    expect(placeEntries.map((entry) => entry.href)).toContain("/places/E07000072/");
  });
});
