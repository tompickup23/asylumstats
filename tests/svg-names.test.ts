import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Every SVG a page draws is either named, so a screen reader can say what the chart shows,
 * or hidden, so it is not announced as an unnamed image.
 *
 * Counted in a browser on 18 November 2026: the share buttons and the Plain English note
 * icon carried neither, five SVGs on the Burnley page and two each on the hotels explainer
 * and /cost/, and 2,045 across the site. Every data chart was already named; this keeps
 * them so. A named SVG also carries role="img", so assistive technology reads it as one
 * picture rather than walking its paths.
 *
 * Reads the built HTML with a small tag scanner, because an SVG hidden by an aria-hidden
 * parent (the header carets) is hidden too. SVGs that scripts draw after load are not in
 * the built HTML and are not checked here; the maps build their shapes inside an SVG that
 * is. Reads dist, so it runs in the built-site guards step of deploy.yml and site-checks.yml.
 */
const DIST = resolve(import.meta.dirname ?? __dirname, "../dist");
const built = existsSync(DIST);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? (match[2] ?? match[3]) : null;
}

interface SvgFinding {
  named: boolean;
  hidden: boolean;
  role: string | null;
  context: string;
}

function scanSvgs(source: string): SvgFinding[] {
  const html = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "<$1></$1>");
  const stack: Array<{ name: string; hidden: boolean; cls: string | null }> = [];
  const found: SvgFinding[] = [];
  for (const match of html.matchAll(/<\/?([a-zA-Z][\w:-]*)\b[^>]*?\/?>/g)) {
    const [tag, rawName] = match;
    const name = rawName.toLowerCase();
    if (tag.startsWith("</")) {
      const at = stack.map((open) => open.name).lastIndexOf(name);
      if (at >= 0) stack.length = at;
      continue;
    }
    const hiddenHere = attr(tag, "aria-hidden") === "true";
    if (name === "svg") {
      const role = attr(tag, "role");
      const following = html.slice(match.index + tag.length, match.index + tag.length + 40);
      const parent = stack.at(-1);
      found.push({
        named: (attr(tag, "aria-label") ?? "").trim() !== "" || attr(tag, "aria-labelledby") !== null || /^\s*<title>/i.test(following),
        hidden: hiddenHere || role === "presentation" || role === "none" || stack.some((open) => open.hidden),
        role,
        context: `${parent?.name ?? "?"}.${parent?.cls ?? ""}`
      });
    }
    if (!tag.endsWith("/>") && !VOID.has(name)) stack.push({ name, hidden: hiddenHere, cls: attr(tag, "class") });
  }
  return found;
}

describe("the SVG scanner", () => {
  it("tells named, hidden and bare SVGs apart, including one hidden by its parent", () => {
    const found = scanSvgs(
      '<svg role="img" aria-label="Line chart"></svg><span aria-hidden="true"><svg></svg></span>' +
        '<svg aria-hidden="true"></svg><button aria-label="Share"><svg><path d="M0 0"/></svg></button>'
    );
    expect(found.map((svg) => [svg.named, svg.hidden])).toEqual([[true, false], [false, true], [false, true], [false, false]]);
  });
});

describe.skipIf(!built)("SVG names in the built site", () => {
  const pages = built ? htmlFiles(DIST).map((file) => ({ page: relative(DIST, file), svgs: scanSvgs(readFileSync(file, "utf8")) })) : [];

  it("names every chart and hides every decorative SVG", () => {
    const bare = new Map<string, { count: number; example: string }>();
    let total = 0;
    for (const { page, svgs } of pages) {
      for (const svg of svgs) {
        total += 1;
        if (svg.named || svg.hidden) continue;
        const seen = bare.get(svg.context) ?? { count: 0, example: page };
        bare.set(svg.context, { count: seen.count + 1, example: seen.example });
      }
    }
    expect(total).toBeGreaterThan(5000);
    expect([...bare].map(([context, { count, example }]) => `${count} unnamed, unhidden SVGs in ${context}, first on ${example}`)).toEqual([]);
  });

  it("gives every named SVG role=img", () => {
    const missing = pages.flatMap(({ page, svgs }) =>
      svgs.filter((svg) => svg.named && !svg.hidden && svg.role !== "img").map((svg) => `${page}: ${svg.context}`)
    );
    expect([...new Set(missing)].slice(0, 20)).toEqual([]);
  });
});
