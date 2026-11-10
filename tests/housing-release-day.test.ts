import { describe, expect, it } from "vitest";
import manifest from "../data/raw/manifests/mhclg_homelessness.json";
import { findAttachment } from "../scripts/fetch/fetch-housing-release.mjs";

/**
 * R177: the housing panel's next sources are written into its manifest, read once from
 * their GOV.UK landing pages, so release day is a fetch of a named page for a named
 * title. Shape only; the dates move every quarter.
 */

const releaseDay = (manifest as any).releaseDay;

describe("housing release-day sources", () => {
  it("name each source's page, title, stated date and GOV.UK state", () => {
    expect(releaseDay.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    for (const source of releaseDay.sources) {
      expect(source.title).toBeTruthy();
      expect(source.announcement).toMatch(/^https:\/\/www\.gov\.uk\/government\/statistics\/announcements\//);
      expect(source.statedDate).toBeTruthy();
      expect(["confirmed", "provisional"]).toContain(source.state);
      expect(Number.isFinite(Date.parse(source.releaseTimestamp))).toBe(true);
    }
  });

  it("give the H-CLIC fetch an exact page and title, and the period it will cover", () => {
    const hclic = releaseDay.sources.find((source: any) => source.releaseId === "hclic");
    expect(hclic.onReleaseDay).toBe("fetch");
    expect(hclic.tablesPage).toMatch(/^https:\/\/www\.gov\.uk\/government\/statistical-data-sets\//);
    expect(hclic.attachmentTitle).toContain(hclic.periodLabel);
    expect(hclic.stockDate > manifest.coverageEnd).toBe(true);
  });
});

describe("findAttachment", () => {
  const page = {
    details: {
      attachments: [
        { title: "Detailed local authority level tables: January to March 2026", url: "https://assets.example/202603.ods" },
        { title: "Detailed local authority level tables: April to June 2026 (revised)", url: "https://assets.example/x.ods" },
        { title: "Multiple Disadvantage Detailed Local Authority Data: January to March 2026", url: "https://assets.example/m.ods" }
      ]
    }
  };
  const fetchImpl = async () => new Response(JSON.stringify(page), { status: 200 });

  it("matches the exact title only, never a near one", async () => {
    const hit = await findAttachment("https://www.gov.uk/government/statistical-data-sets/x", "Detailed local authority level tables: January to March 2026", { fetchImpl });
    expect(hit.attachment?.url).toBe("https://assets.example/202603.ods");
    const miss = await findAttachment("https://www.gov.uk/government/statistical-data-sets/x", "Detailed local authority level tables: April to June 2026", { fetchImpl });
    expect(miss.attachment).toBeNull();
    expect(miss.nearest.length).toBe(2);
  });

  it("asks the Content API for the page", async () => {
    let asked = "";
    await findAttachment("https://www.gov.uk/government/statistical-data-sets/x", "t", {
      fetchImpl: async (url: string) => ((asked = url), new Response(JSON.stringify(page)))
    } as any);
    expect(asked).toBe("https://www.gov.uk/api/content/government/statistical-data-sets/x");
  });
});
