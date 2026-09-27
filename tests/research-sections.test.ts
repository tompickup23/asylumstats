import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { arrangeResearch, type ResearchItem } from "../src/lib/research-sections";

// Read the frontmatter directly: the content collection is only available inside Astro.
const dir = join(process.cwd(), "src/content/findings");
const items: ResearchItem[] = readdirSync(dir).map((file) => {
  const front = readFileSync(join(dir, file), "utf8").split("---")[1];
  const field = (name: string) => new RegExp(`^${name}:\\s*"?([^"\\n]+)"?`, "m").exec(front)?.[1];
  return {
    id: file,
    data: {
      category: field("category") as ResearchItem["data"]["category"],
      date: field("date")!,
      updated: field("updated"),
      featured: field("featured") ? Number(field("featured")) : undefined,
      content_type: (field("content_type") ?? "finding") as ResearchItem["data"]["content_type"],
      superseded_by: field("superseded_by")
    }
  };
});

describe("research page order", () => {
  const { latest, featured, groups } = arrangeResearch(items);
  const live = items.filter((item) => !item.data.superseded_by);

  it("leads with the three most recently published or revised pieces", () => {
    const newest = [...live]
      .map((item) => item.data.updated ?? item.data.date)
      .sort()
      .reverse()
      .slice(0, 3);
    expect(latest.map((item) => item.data.updated ?? item.data.date)).toEqual(newest);
  });

  it("puts today's news ahead of an older piece refreshed the same day", () => {
    const newestDate = latest[0].data.updated ?? latest[0].data.date;
    const newsThatDay = live.filter((item) => item.data.content_type === "news" && item.data.date === newestDate);
    for (const item of newsThatDay.slice(0, 3)) expect(latest.map((l) => l.id)).toContain(item.id);
  });

  it("lists featured investigations in their set order", () => {
    expect(featured.length).toBeGreaterThan(0);
    const ranks = featured.map((item) => item.data.featured);
    expect(ranks).toEqual([...ranks].sort((a, b) => a! - b!));
  });

  it("shows every live piece, and never a superseded one", () => {
    const shown = [...latest, ...featured, ...groups.flatMap((group) => group.items)].map((item) => item.id);
    for (const item of live) expect(shown, item.id).toContain(item.id);
    for (const item of items.filter((i) => i.data.superseded_by)) expect(shown).not.toContain(item.id);
  });

  it("puts demographics last, after the asylum topics", () => {
    expect(groups.at(-1)?.id).toBe("demographics");
    expect(groups[0].id).toBe("money");
  });
});
