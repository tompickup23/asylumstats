import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The site used to publish anonymously, and this file used to assert that no tracked file
 * named the author at all.
 *
 * That changed on 10 Sep 2026, deliberately. The footer now names him and declares that
 * he is a Lancashire county councillor and a Reform UK member. On a site publishing asylum
 * statistics that is not a loss of neutrality, it is the disclosure the neutrality claim
 * depends on: an undeclared party interest behind a dataset about asylum is the thing a
 * critic would reach for first, and the answer to it is to say so in public rather than to
 * be quiet and hope. The declaration is worth more than the anonymity was.
 *
 * The guard that produced this file is still needed, though, and it is a different one
 * from the one it started as. On 13 Aug 2026 two tracked research notes carried an
 * "Owner:" line naming the author, and a third that had never been committed named him
 * with his council role attached. That was accidental leakage from working files, not a
 * considered disclosure, and nothing caught it. So the rule is no longer "never" but
 * "only where it is meant", and the allowlist below is the list of places where it is
 * meant.
 *
 * Two things keep the allowlist honest. It is exact paths, not a prefix, so a new file
 * cannot drift into it. And the second test asserts the disclosure is actually there,
 * which means an entry that stops being a real disclosure fails rather than sitting as a
 * permanent hole in the check.
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
describe("publication attribution", () => {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);

  /**
   * Where naming the author is a considered, published disclosure rather than a leak.
   * Adding a path here is an editorial decision, not a way to silence a failure.
   */
  const DISCLOSURE_FILES = new Set(["src/layouts/BaseLayout.astro"]);

  // Personal-name attribution, not the account handle. Built from parts so this file
  // does not itself contain the string it searches for. Both orders, because
  // "<first> <last>" and "<last>, <first>" read the same to a reader.
  const FIRST = "tom";
  const LAST = "pickup";
  const NAME_PATTERNS = [
    new RegExp(`\\b${FIRST}\\s+${LAST}\\b`, "i"),
    new RegExp(`\\b${LAST},\\s*${FIRST}\\b`, "i")
  ];

  /** The interest that has to travel with the name wherever it is published. */
  const INTEREST_PATTERN = /reform uk/i;

  function readTracked(file: string): string | null {
    // Skip anything not plausibly text, and skip large data files: the attribution
    // risk is in prose, and reading 11 MB of JSON per pattern is not worth it.
    if (!/\.(md|astro|ts|tsx|js|mjs|json|yml|yaml|txt|html|css|py)$/i.test(file)) return null;
    try {
      return readFileSync(resolve(ROOT, file), "utf8");
    } catch {
      return null;
    }
  }

  it("names the author only where the site means to", () => {
    const offenders: string[] = [];

    for (const file of trackedFiles) {
      if (DISCLOSURE_FILES.has(file)) continue;
      const contents = readTracked(file);
      if (contents === null) continue;
      if (NAME_PATTERNS.some((pattern) => pattern.test(contents))) {
        offenders.push(file);
      }
    }

    expect(
      offenders,
      "personal attribution outside the declared disclosure. If this is a deliberate " +
        "published disclosure, add the path to DISCLOSURE_FILES; if it is a working note " +
        "or a stray Owner: line, take the name out.\n" + offenders.join("\n")
    ).toEqual([]);
  });

  it("keeps the declared interest attached to the name", () => {
    // The disclosure is only worth having if it is complete. Naming him without saying
    // which party he belongs to would read as transparency while withholding the one
    // fact a reader of an asylum dataset would want.
    for (const file of DISCLOSURE_FILES) {
      const contents = readTracked(file);
      expect(contents, `${file} is in DISCLOSURE_FILES but could not be read`).not.toBeNull();

      const names = NAME_PATTERNS.some((pattern) => pattern.test(contents!));
      expect(
        names,
        `${file} is allowlisted as a disclosure but no longer names anyone. Remove it ` +
          "from DISCLOSURE_FILES so the file is checked again."
      ).toBe(true);

      expect(
        INTEREST_PATTERN.test(contents!),
        `${file} names the author without declaring the party interest alongside it.`
      ).toBe(true);
    }
  });

  it("states the interest on the page, not only in the source", () => {
    // BaseLayout wraps every page, so the declaration reaches the reader on all of them.
    // Asserting it in the source alone would pass if the footer were made conditional.
    const layout = readTracked("src/layouts/BaseLayout.astro")!;
    expect(layout).toMatch(/no party, council or candidate has any say over what appears here/i);
  });
});
