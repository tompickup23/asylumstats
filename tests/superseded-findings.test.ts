import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A superseded article keeps its URL and declares another page canonical. Two things can
 * go wrong quietly and neither shows up in a page render:
 *
 *   - the canonical points at a slug that does not exist, so every search engine is sent
 *     to a 404 and the article's ranking is thrown away rather than consolidated;
 *   - a chain, A superseded by B superseded by C, where the canonical of A points at a
 *     page that is itself non-canonical, which search engines treat as no signal at all.
 *
 * Both are cheap to assert and expensive to notice in production.
 */
const FINDINGS_DIR = join(process.cwd(), "src/content/findings");

function frontmatter(file: string): Record<string, string> {
  const raw = readFileSync(join(FINDINGS_DIR, file), "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*"?([^"]*)"?\s*$/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

const files = readdirSync(FINDINGS_DIR).filter((f) => f.endsWith(".md"));
const slugs = new Set(files.map((f) => f.replace(/\.md$/, "")));
const superseded = new Map<string, string>();
for (const file of files) {
  const by = frontmatter(file).superseded_by;
  if (by) superseded.set(file.replace(/\.md$/, ""), by);
}

describe("superseded findings", () => {
  it("point their canonical at a finding that exists", () => {
    for (const [slug, target] of superseded) {
      expect(slugs.has(target), `${slug} is superseded_by "${target}", which has no file`).toBe(
        true
      );
    }
  });

  it("never point at another superseded finding", () => {
    for (const [slug, target] of superseded) {
      expect(
        superseded.has(target),
        `${slug} points at ${target}, which is itself superseded. Point it at the current article.`
      ).toBe(false);
    }
  });

  it("does not supersede an article by itself", () => {
    for (const [slug, target] of superseded) {
      expect(target, `${slug} declares itself canonical`).not.toBe(slug);
    }
  });

  it("has the April appeal article pointing at the May one", () => {
    // The case this was built for. If someone removes the marker the two articles start
    // competing for the same query again, which is what the consolidation exists to stop.
    expect(superseded.get("true-grant-rate-appeals")).toBe("home-office-appeal-uplift-may2026");
  });
});
