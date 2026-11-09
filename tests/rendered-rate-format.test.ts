import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const DIST = resolve(import.meta.dirname ?? __dirname, "../dist");
const EXCESS_PRECISION = /\b[\d,]+\.\d{2,}\s*(?:(?:people\s+)?per\s+10,000|\/\s*10k)\b/g;

function visibleText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith(".html") ? [path] : [];
  });
}

it("catches excess rate precision across HTML elements", () => {
  expect(visibleText("<b>46.66</b><span>per 10,000</span>").match(EXCESS_PRECISION)).toEqual(["46.66 per 10,000"]);
  expect(visibleText("<b>46.7</b><span>per 10,000</span>").match(EXCESS_PRECISION)).toBeNull();
});

describe.skipIf(!existsSync(DIST))("rendered support rates", () => {
  it("shows no rate per 10,000 to two or more decimal places", () => {
    const offences: string[] = [];
    let pagesWithRates = 0;
    for (const path of htmlFiles(DIST)) {
      const text = visibleText(readFileSync(path, "utf8"));
      if (/\d\.\d\s+per 10,000/.test(text)) pagesWithRates += 1;
      for (const match of text.matchAll(EXCESS_PRECISION)) {
        offences.push(`${relative(DIST, path)}: ${match[0]}`);
      }
    }
    expect(pagesWithRates).toBeGreaterThan(0);
    expect(offences).toEqual([]);
  });
});
