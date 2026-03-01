import { describe, expect, it } from "vitest";
import { getPublicPlaceAreas } from "../src/lib/site";
import { getPublicSearchEntries } from "../src/lib/site-search";

describe("site search index", () => {
  it("returns static pages and public place profiles", () => {
    const entries = getPublicSearchEntries();
    const publicPlaces = getPublicPlaceAreas();
    const pageEntries = entries.filter((entry) => entry.kind === "page");
    const placeEntries = entries.filter((entry) => entry.kind === "place");

    expect(pageEntries.map((entry) => entry.href)).toContain("/");
    expect(pageEntries.map((entry) => entry.href)).toContain("/compare/");
    expect(placeEntries).toHaveLength(publicPlaces.length);
    expect(placeEntries.every((entry) => entry.href.startsWith("/places/"))).toBe(true);
    expect(placeEntries.some((entry) => entry.searchText.includes("local authority"))).toBe(true);
    expect(placeEntries.map((entry) => entry.href)).toContain("/places/E07000072/");
  });
});
