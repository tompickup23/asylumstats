import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * No em or en dash in anything a reader sees: page text, titles and descriptions.
 *
 * House style since July 2026, applied once by hand and then left to drift. By October,
 * six findings and the /what-the-home-office-publishes/ answer page had picked them up
 * again, one of them with the space after it lost ("files —276"). A rule nobody checks
 * is a preference.
 *
 * Reads the built site, like rendered-text-runons, because a dash can come from Markdown,
 * a template literal or a data file, and only the output shows them all together.
 * `skipIf(!built)` for local runs; wired into deploy.yml after the build.
 *
 * A dash inside a verbatim quotation or a source's own title is allowed, so text between
 * double quotes is ignored.
 */

const DIST = resolve(import.meta.dirname ?? __dirname, "../dist");
const built = existsSync(DIST);
const DASH = /[–—]/;

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

function decode(text: string): string {
  return text
    .replace(/&mdash;|&#8212;|&#x2014;/gi, "—")
    .replace(/&ndash;|&#8211;|&#x2013;/gi, "–")
    .replace(/&quot;|&#34;/g, '"');
}

function readerText(html: string): string {
  const meta = [...html.matchAll(/<meta[^>]+(?:name|property)="(?:description|og:title|og:description)"[^>]*content="([^"]*)"/gi)]
    .map((match) => match[1]);
  const body = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decode([body, ...meta].join(" "))
    .replace(/[“"][^”"]*[”"]/g, " ")
    .replace(/\s+/g, " ");
}

describe.skipIf(!built)("rendered text uses no em or en dashes", () => {
  it("finds none on any built page", () => {
    const offences: string[] = [];
    for (const file of htmlFiles(DIST)) {
      const text = readerText(readFileSync(file, "utf8"));
      const match = DASH.exec(text);
      if (match) {
        const at = match.index;
        offences.push(`${relative(DIST, file)}: ...${text.slice(Math.max(0, at - 40), at + 30)}...`);
      }
    }
    expect(offences).toEqual([]);
  });
});
