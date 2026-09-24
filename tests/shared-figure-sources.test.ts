import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Pages and components read shared figures through a helper, never from the data file.
 *
 * This is the audit's priority 1 in the form the site can actually enforce. The failure it
 * exists for has shipped twice. /national/ kept its own inline filter over the projection
 * file through the v8.0 recalibration and published 93 authorities below a 50% White
 * British share where every other surface said 86: it counted Sheffield under both its
 * retired and its current code and included six London boroughs the plausibility guard
 * withholds. The national trajectory chart on the same page aggregated the file directly
 * and plotted 74.5% for 2021 against the 74.4% published everywhere else.
 *
 * Both were one defect: a page computing a shared quantity for itself. Checking that two
 * copies still agree would not have caught either, because each copy was internally
 * consistent and they were compared by nobody. The only durable fix is one implementation,
 * so this asserts there is one rather than asserting the copies match.
 *
 * `src/lib/` is where the dedupe of retired codes, the plausibility guard and the weighting
 * rules live. A file that imports the raw JSON from outside it has opted out of all three
 * without saying so.
 */
const GUARDED_SOURCES = [
  {
    file: "ethnic-projections.json",
    helper: "src/lib/ethnic-projections.ts",
    why:
      "owns distinctAreaCodes (the retired Sheffield and Barnsley codes), the plausibility " +
      "guard, and the population weighting. Use getEthnicProjection, meanWhiteBritishShare, " +
      "nationalGroupShare, areasBelowFiftyBy or countAreasAbove."
  }
];

/**
 * Where a shared source may be read directly.
 *
 * `src/lib/` owns it. `scripts/` builds it. `tests/` checks the helper against it, and a
 * test that could only see the helper could not tell whether the helper was right — that
 * is the one place reading the raw file is the point rather than a bypass.
 */
function isPermitted(file: string): boolean {
  return file.startsWith("src/lib/") || file.startsWith("scripts/") || file.startsWith("tests/");
}

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
  .split("\0")
  .filter((file) => /\.(astro|ts|tsx|mjs|js)$/.test(file));

describe("shared figure sources", () => {
  it("has files to scan", () => {
    expect(trackedFiles.length).toBeGreaterThan(50);
  });

  for (const source of GUARDED_SOURCES) {
    it(`routes ${source.file} through ${source.helper}`, () => {
      const offenders = trackedFiles.filter((file) => {
        if (isPermitted(file)) return false;
        const contents = readFileSync(resolve(ROOT, file), "utf8");
        return new RegExp(`from\\s+["'][^"']*${source.file.replace(".", "\\.")}["']`).test(contents);
      });

      expect(
        offenders,
        `these import ${source.file} directly instead of the helper, which ${source.why}\n` +
          offenders.join("\n")
      ).toEqual([]);
    });

    it(`keeps ${source.helper} present and exporting`, () => {
      // Guard on the guard: if the helper were renamed away, the check above would pass
      // by finding nothing to compare against.
      const helper = readFileSync(resolve(ROOT, source.helper), "utf8");
      expect(helper).toMatch(/export function/);
      expect(helper).toContain(source.file);
    });
  }
});
