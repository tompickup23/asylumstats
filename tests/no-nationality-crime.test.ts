import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * House rule: no claim or juxtaposition linking nationality, migration status or
 * asylum to crime, offending or prison. On 12 October 2026 a section of the
 * true-cost finding that set the prison population by nationality against the top
 * asylum nationalities was withdrawn, with a sentence in its criminal justice cost
 * line that did the same. This fails if prose of that kind comes back into any
 * finding, outside a dated correction notice (which records what was withdrawn).
 *
 * The pattern looks for a nationality or prison-population term and a crime term
 * in the same paragraph. It is a tripwire, not a classifier: a new hit needs a
 * human read, and an allowed paragraph is listed below with its reason.
 */
const FINDINGS = join(process.cwd(), "src/content/findings");

const CRIME = /\b(crime|crimes|criminal|offend\w*|offence\w*|prison\w*|prisoner\w*|convict\w*|arrest\w*|FNOs?)\b/i;
const NATIONALITY = /\b(nationalit\w*|foreign nationals?|Albanian|Iraqi|Iranian|Vietnamese|Eritrean|Afghan|Syrian|Sudanese|Pakistani|Jamaican|Polish|Romanian|asylum (?:seeker|nationalit)\w*)\b/i;

/** Paragraphs allowed to carry both kinds of term, with the reason. */
const ALLOWED: Array<{ file: string; contains: string; reason: string }> = [
  // The criminal justice line of the cost estimate. Its figure (£127m to £203m)
  // is a share of foreign national offender prison costs judged from nationality
  // overlap, and is part of the published £8.0 billion total. Removing it changes
  // the headline (central £7.8 billion, £229 per income taxpayer), so it is left
  // for Tom's decision, listed in the PR. The prose naming nationalities was
  // removed on 12 October 2026. When the line is decided, delete these entries.
  ...[
    "### Criminal justice / Foreign National Offenders",
    "10,772 foreign nationals are held in UK prisons",
    "We estimate 30-35% of FNO prison costs",
    "Source: Ministry of Justice Offender Management Statistics Quarterly (prison population by nationality). Home Office",
    "**Core government sources:**"
  ].map((contains) => ({
    file: "true-cost-of-asylum.md",
    contains,
    reason: "Criminal justice cost line: judgement call pending, see above."
  })),
  {
    file: "pakistan-asylum-17x-surge.md",
    contains: "Imran Khan",
    reason: "Names the arrest and sentence of a former prime minister as political context for claims, not offending by claimants."
  }
];

const paragraphs = (text: string) =>
  text
    .replace(/^---[\s\S]*?\n---\n/, "")
    .split(/\n\s*\n/)
    .filter((p) => !p.trimStart().startsWith(">"));

describe("no nationality-to-crime prose in findings", () => {
  it("finds no paragraph pairing a nationality or asylum term with a crime or prison term", () => {
    const hits: string[] = [];
    for (const file of readdirSync(FINDINGS).filter((f) => f.endsWith(".md"))) {
      for (const p of paragraphs(readFileSync(join(FINDINGS, file), "utf8"))) {
        if (!CRIME.test(p) || !NATIONALITY.test(p)) continue;
        if (ALLOWED.some((a) => a.file === file && p.includes(a.contains))) continue;
        hits.push(`${file}: ${p.slice(0, 120).replace(/\s+/g, " ")}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("can fire: a planted paragraph is caught", () => {
    const planted = "Albanian nationals in the prison population correlate with the top asylum nationalities.";
    expect(CRIME.test(planted) && NATIONALITY.test(planted)).toBe(true);
  });
});
