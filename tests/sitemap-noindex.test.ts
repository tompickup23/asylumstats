import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getIndexableSitePaths } from "../src/lib/site";

/**
 * The sitemap and the robots meta tag must agree.
 *
 * Listing a URL in sitemap.xml asks a search engine to index it. `noIndex` on the page
 * tells the same engine not to. Sent together they are a contradiction, and the usual
 * outcome is that neither signal is trusted for that URL.
 *
 * This drifted for real: /councils/, /spending/ and /entities/ were noIndex in their page
 * source and listed in the sitemap at the same time, because the sitemap list is
 * maintained by hand in one file and noIndex is set in another. It was resolved per page
 * rather than as a block, /spending/ and /entities/ opened up and /councils/ kept out.
 */
const PAGES_DIR = join(process.cwd(), "src/pages");

function sourceFileForPath(path: string): string | undefined {
  const trimmed = path.replace(/^\/|\/$/g, "");
  const candidates = trimmed
    ? [join(PAGES_DIR, `${trimmed}.astro`), join(PAGES_DIR, trimmed, "index.astro")]
    : [join(PAGES_DIR, "index.astro")];
  return candidates.find((candidate) => existsSync(candidate));
}

function declaresNoIndex(file: string): boolean {
  return /noIndex=\{true\}/.test(readFileSync(file, "utf8"));
}

describe("sitemap and noindex agree", () => {
  it("lists no page that sets noIndex", () => {
    const offenders: string[] = [];
    for (const path of getIndexableSitePaths()) {
      const file = sourceFileForPath(path);
      // Dynamic routes (places, counties, regions) have no one-to-one static file here.
      if (!file) continue;
      if (declaresNoIndex(file)) offenders.push(`${path} -> ${file.replace(process.cwd(), "")}`);
    }
    expect(
      offenders,
      `these paths are in the sitemap and noIndex at once:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("actually resolves the static paths it checks, so the test can fail", () => {
    // Guard on the guard. If sourceFileForPath resolved nothing the loop above would skip
    // every path and pass no matter what the sitemap contained.
    const resolved = getIndexableSitePaths().filter((path) => sourceFileForPath(path));
    expect(resolved.length).toBeGreaterThan(5);
  });

  it("keeps /councils/ noIndex and out of the sitemap together", () => {
    // The two halves of that decision have to move as a pair. If someone opens the page
    // up they must drop the noIndex and add the path back in the same change.
    const councils = sourceFileForPath("/councils/");
    expect(councils).toBeDefined();
    expect(declaresNoIndex(councils!)).toBe(true);
    expect(getIndexableSitePaths()).not.toContain("/councils/");
  });

  it("has /spending/ and /entities/ indexable on both signals", () => {
    for (const path of ["/spending/", "/entities/"]) {
      const file = sourceFileForPath(path);
      expect(file, `no source file for ${path}`).toBeDefined();
      expect(declaresNoIndex(file!), `${path} still sets noIndex`).toBe(false);
      expect(getIndexableSitePaths()).toContain(path);
    }
  });
});
