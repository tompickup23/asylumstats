import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import localRouteLatest from "../src/data/live/local-route-latest.json";
import { slugifyAreaName } from "../src/lib/site-identity";

/**
 * Being on asylum support is not the same as being accommodated.
 *
 * `supportedAsylum` is the Home Office total for an area and it includes people on
 * Section 95 subsistence only, who receive money and not accommodation. Nationally that is
 * 3,866 of 97,519, about 4 per cent, but it is not spread evenly: 295 of the 344 areas
 * with any support have some, and in eight of them it is the whole figure. Cambridge's
 * place page said "14 people housed on asylum support" when the number housed was zero.
 *
 * The same conflation was caught in a Facebook post drafted from this data on the same
 * day, which is why it gets a test rather than a correction.
 */
describe("asylum support is not described as accommodation", () => {
  const areas = localRouteLatest.areas as Array<{
    areaName: string;
    supportedAsylum: number;
    subsistenceOnly: number;
    initialAccommodation: number;
    dispersalAccommodation: number;
    contingencyAccommodation: number;
    otherAccommodation: number;
  }>;

  it("has areas where nobody on support is accommodated, so the distinction is load-bearing", () => {
    const allSubsistence = areas.filter(
      (a) => a.supportedAsylum > 0 && a.subsistenceOnly === a.supportedAsylum
    );
    expect(allSubsistence.length).toBeGreaterThan(0);
  });

  it("reconciles supportedAsylum to its components in every area", () => {
    const broken: string[] = [];
    for (const a of areas) {
      const parts =
        a.initialAccommodation +
        a.dispersalAccommodation +
        a.contingencyAccommodation +
        a.otherAccommodation +
        a.subsistenceOnly;
      if (parts !== a.supportedAsylum) {
        broken.push(`${a.areaName}: ${a.supportedAsylum} vs components ${parts}`);
      }
    }
    expect(broken).toEqual([]);
  });

  const dist = join(__dirname, "..", "dist", "places");
  const built = existsSync(dist);

  it.skipIf(!built)("never calls people on support 'housed' on a place page", () => {
    const slugs = readdirSync(dist).filter(
      (n) => n !== "index.html" && n !== "regions" && n !== "counties"
    );
    expect(slugs.length).toBeGreaterThan(50);
    const offenders = slugs.filter((slug) => {
      const f = join(dist, slug, "index.html");
      return existsSync(f) && /housed on asylum support/.test(readFileSync(f, "utf8"));
    });
    expect(offenders).toEqual([]);
  });

  it.skipIf(!built)("states the subsistence split on every area that is entirely subsistence", () => {
    // Cambridge was the case that made this concrete: 14 on support at 31 March 2026, none
    // accommodated. The count is read from the data, not typed here: it was 15 at
    // 30 September 2026, and the typed 14 would have failed that deploy after the data
    // had already been committed.
    const cases = areas.filter(
      (a) =>
        a.supportedAsylum > 1 &&
        a.subsistenceOnly === a.supportedAsylum &&
        existsSync(join(dist, slugifyAreaName(a.areaName), "index.html"))
    );
    expect(cases.length).toBeGreaterThan(0);
    for (const a of cases) {
      const page = readFileSync(join(dist, slugifyAreaName(a.areaName), "index.html"), "utf8");
      const n = a.supportedAsylum.toLocaleString("en-GB");
      expect(page, a.areaName).toContain(`${n} people on asylum support in ${a.areaName}`);
      expect(page, a.areaName).toContain(`${n} of them receive subsistence only`);
    }
  });
});
