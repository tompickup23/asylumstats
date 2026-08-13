import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * This site is published anonymously. It is cited by people who do not know or care who
 * runs it, and that is the point: the neutral register is the product.
 *
 * The site itself has always been clean, but on 13 Aug 2026 two tracked research notes
 * in this public repository carried "Owner: Tom Pickup", and a third that had never been
 * committed carried "Action Owner: Tom Pickup (Councillor/Tech Lead)". Nothing checked,
 * so nothing caught it.
 *
 * The GitHub account name is deliberately not covered here. It appears throughout the
 * data as the source of the Lancashire transparency files
 * (raw.githubusercontent.com/tompickup23/lancashire/...), removing it would break the
 * provenance chain the whole site rests on, and it cannot be concealed while the
 * repository lives under that account anyway. That is a hosting question, not a content
 * one.
 */
describe("publication anonymity", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);

  // Personal-name attribution, not the account handle. Spaced and separated forms both,
  // since "Tom Pickup", "Tom  Pickup" and "Pickup, Tom" all read the same to a reader.
  const NAME_PATTERNS = [/\btom\s+pickup\b/i, /\bpickup,\s*tom\b/i];

  it("names no individual in any tracked file", () => {
    const offenders: string[] = [];

    for (const file of trackedFiles) {
      // Skip anything not plausibly text, and skip large data files: the attribution
      // risk is in prose, and reading 11 MB of JSON per pattern is not worth it.
      if (!/\.(md|astro|ts|tsx|js|mjs|json|yml|yaml|txt|html|css|py)$/i.test(file)) continue;

      let contents: string;
      try {
        contents = readFileSync(resolve(ROOT, file), "utf8");
      } catch {
        continue;
      }

      if (NAME_PATTERNS.some((pattern) => pattern.test(contents))) {
        offenders.push(file);
      }
    }

    expect(offenders, `personal attribution found in:\n${offenders.join("\n")}`).toEqual([]);
  });
});
