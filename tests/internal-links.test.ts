import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Every internal link in the built site lands on a page that was built.
 *
 * Written on 7 October 2026, when the eight "Top areas" cards on /places/ and the place
 * links on five supplier pages were found pointing at /places/<area code>/, a path that
 * has never existed. They had been 404s since the cards were added, and the map stages
 * built the same URL in client-side code. Links written by client scripts are not in the
 * HTML and are not checked here; those now go through buildPlacePath or its inline twin.
 */
const DIST = resolve(import.meta.dirname ?? __dirname, "../dist");

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

function built(path: string): boolean {
  const clean = decodeURIComponent(path.split(/[?#]/)[0]);
  if (clean === "" || clean === "/") return true;
  const target = join(DIST, clean);
  return (
    (existsSync(target) && statSync(target).isFile()) ||
    existsSync(join(target, "index.html")) ||
    existsSync(`${target.replace(/\/$/, "")}.html`)
  );
}

describe.skipIf(!existsSync(DIST))("internal links in the built site", () => {
  it("all resolve to a built page or file", () => {
    const broken = new Map<string, string>();
    for (const file of htmlFiles(DIST)) {
      const html = readFileSync(file, "utf8");
      for (const [, href] of html.matchAll(/href="(\/(?!\/)[^"]*)"/g)) {
        if (!built(href) && !broken.has(href)) broken.set(href, relative(DIST, file));
      }
    }
    expect([...broken].map(([href, page]) => `${href} (from ${page})`)).toEqual([]);
  });
});
