import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * No sentence in the built site may run into the next one.
 *
 * Astro 7 changed the default `compressHTML` from `true` to `'jsx'`, which applies JSX
 * whitespace rules and strips the newline between a text node and an expression that
 * follows it on the next line. Across the site that fixed 364 spurious spaces that
 * Astro 6 had been emitting (`chain s`, `19.2 %`, `+ 1,396`), and broke four sentences
 * in the other direction:
 *
 *   "So we built a model that does.318 local authorities across England and Wales."
 *   "107 nationalities assessed (2020-2025).10 with 75%+ grant rate,41 with under 25%."
 *   "trajectory from Census 2021 base.93 areas projected below 50% White British"
 *
 * Every one was on a high-traffic page, every one was a source line of the shape
 * `text.` newline `{expression}`, and nothing would have caught them: the build was
 * green, the types checked, and 306 unit tests passed. They were only visible by
 * diffing the rendered text of all 478 pages against the previous major.
 *
 * This reads the built site rather than the source, because the defect exists only
 * after compilation. It is `skipIf(!built)` for local runs and is wired into deploy.yml
 * after the build step, alongside the support-vs-accommodation guards.
 */

const DIST = resolve(import.meta.dirname ?? __dirname, "../dist");
const built = existsSync(DIST);

/**
 * A run-on: a letter or closing bracket, then a full stop or comma, then something that
 * has to be the start of a new word.
 *
 * Deliberately narrow, and narrow in one specific way: the character BEFORE the
 * punctuation is never a digit. A first attempt at this allowed one, and matched every
 * thousands separator on the site, `£15,300,000,000` included. It reported 40 offences,
 * all of them numbers, which is the failure mode this whole file exists to avoid. A
 * check that cries wolf gets muted, and then it is not a check.
 *
 * Both halves fire on the four sentences that were actually broken, and neither fires
 * anywhere on the site as it stands.
 */
const RUN_ON = /[a-zA-Z)\]][.,][0-9£$€]|[a-z][.,][A-Z]/g;

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

function visibleText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe.skipIf(!built)("built pages have no sentence run-ons", () => {
  const pages = htmlFiles(DIST);

  it("has a built site to read, so this guard is actually running", () => {
    expect(pages.length).toBeGreaterThan(100);
  });

  it("finds no run-on anywhere in the rendered text", () => {
    const offences: string[] = [];

    for (const page of pages) {
      const text = visibleText(readFileSync(page, "utf8"));
      for (const match of text.matchAll(RUN_ON)) {
        const index = match.index ?? 0;
        const context = text.slice(Math.max(0, index - 60), index + 60);
        offences.push(`${page.replace(`${DIST}/`, "")}: ...${context}...`);
      }
    }

    expect(offences, offences.slice(0, 20).join("\n")).toEqual([]);
  });

  /**
   * The guard has to be able to fail, or it is decoration.
   *
   * This is the exact string the homepage shipped before the fix. If the pattern is ever
   * loosened into something that cannot catch it, this fixture fails first and says so.
   */
  it("would have caught the defect it was written for", () => {
    const regression = visibleText(
      "<p>The ONS will not project ethnic composition at local authority level. " +
        "So we built a model that does.318 local authorities across England and Wales.</p>"
    );
    expect([...regression.matchAll(RUN_ON)].length).toBeGreaterThan(0);

    const corrected = visibleText(
      "<p>The ONS will not project ethnic composition at local authority level. " +
        "So we built a model that does. 318 local authorities across England and Wales.</p>"
    );
    expect([...corrected.matchAll(RUN_ON)].length).toBe(0);
  });
});
