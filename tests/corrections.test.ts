import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCorrections, parseCorrectionDate } from "../src/lib/corrections-parse";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "src/content/findings");
const files = readdirSync(DIR).filter((f) => f.endsWith(".md"));
const bodies = files.map((f) => [f, readFileSync(resolve(DIR, f), "utf8")] as const);

/**
 * /corrections/ is generated from the "**Correction, <date>.**" leads inside the
 * findings. A lead the parser cannot read is a correction the page silently omits,
 * which is the one failure a corrections page must not have. So every lead in the
 * content is checked against what the parser returns.
 */
describe("every correction in the findings reaches the corrections page", () => {
  it("parses each bold Correction lead to a dated record", () => {
    for (const [file, body] of bodies) {
      const leads = body.match(/\*\*Correction, [^*]+\*\*/g) ?? [];
      const parsed = parseCorrections(body);
      expect(parsed.length, file).toBe(leads.length);
      for (const c of parsed) {
        expect(c.date, file).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(c.text.length, file).toBeGreaterThan(80);
        expect(c.text, file).not.toMatch(/^>|\*\*/);
      }
    }
  });

  it("finds the corrections the site is known to carry", () => {
    const total = bodies.reduce((n, [, body]) => n + parseCorrections(body).length, 0);
    expect(total).toBeGreaterThanOrEqual(6);
  });

  it("reads the date format the corrections use", () => {
    expect(parseCorrectionDate("7 September 2026")).toBe("2026-09-07");
    expect(parseCorrectionDate("13 August 2026")).toBe("2026-08-13");
    expect(parseCorrectionDate("August 2026")).toBeUndefined();
  });
});
