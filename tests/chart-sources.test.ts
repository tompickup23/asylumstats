import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import routeDashboard from "../src/data/live/route-dashboard.json";

const routesPage = readFileSync(join(__dirname, "..", "src/pages/routes.astro"), "utf8");

/**
 * The page's own comment says every chart carries a source line. Nothing enforced it.
 *
 * chartSource() returns {} when the id is not in the payload's registry, so a chart pointed
 * at a retired id renders with no attribution and the build stays green. Two charts were in
 * that state: they show MOJ tribunal data and were pointed at asylum_appeals_mar_2023, the
 * discontinued Home Office series the transform deliberately drops.
 *
 * The same shape nearly cost nine charts their source lines when source_id stopped carrying
 * the release period, so this is the second time a silent {} has been the failure mode.
 */
describe("every chart source id resolves", () => {
  const registry = new Set((routeDashboard.sources as { source_id: string }[]).map((s) => s.source_id));
  const used = [...routesPage.matchAll(/chartSource\("([^"]+)"\)/g)].map((m) => m[1]);

  it("finds the chartSource calls to check", () => {
    expect(used.length).toBeGreaterThan(5);
  });

  it("resolves every id against the payload registry", () => {
    const unresolved = [...new Set(used)].filter((id) => !registry.has(id));
    expect(unresolved).toEqual([]);
  });

  it("names every id in the dataset-name map, so no chart is credited by raw id", () => {
    const named = new Set(
      [...routesPage.matchAll(/^\s{2}([a-z_]+):\s"/gm)].map((m) => m[1])
    );
    const unnamed = [...new Set(used)].filter((id) => !named.has(id));
    expect(unnamed).toEqual([]);
  });
});

describe("source ids carry no release period", () => {
  /**
   * moj_tribunals_q4_2025_26 would have stopped resolving on 10 September, taking the source
   * line off both tribunal charts with no error. The routes ids were fixed for this reason in
   * #62; the tribunal one was missed.
   */
  it("has no period-stamped id in the payload", () => {
    const stamped = [...registryIds()].filter((id) =>
      /_(q[1-4]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[_0-9]|_\d{4}(_\d{2})?$/.test(id)
    );
    expect(stamped).toEqual([]);
  });

  function registryIds() {
    return (routeDashboard.sources as { source_id: string }[]).map((s) => s.source_id);
  }
});
