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
 * in this public repository carried an "Owner:" line naming the author, and a third that
 * had never been committed named him with his council role attached. Nothing checked, so
 * nothing caught it.
 *
 * This file deliberately does not spell out the name it looks for. An earlier draft did,
 * in this very comment, and the test failed on itself the moment it was committed and
 * became a tracked file. Excluding the test from its own scan would have been the wrong
 * fix: it would leave a file where an attribution could hide.
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

  // Personal-name attribution, not the account handle. Built from parts so this file
  // does not itself contain the string it searches for. Both orders, because
  // "<first> <last>" and "<last>, <first>" read the same to a reader.
  const FIRST = "tom";
  const LAST = "pickup";
  const NAME_PATTERNS = [
    new RegExp(`\\b${FIRST}\\s+${LAST}\\b`, "i"),
    new RegExp(`\\b${LAST},\\s*${FIRST}\\b`, "i")
  ];

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
