import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The site carries two copies of its Content-Security-Policy: a <meta> tag in
 * BaseLayout, which is what actually applies on GitHub Pages, and public/_headers,
 * which is inert here but is the configuration a move to Cloudflare Pages would use.
 *
 * They had drifted. `connect-src` in _headers omitted https://api.postcodes.io, which
 * the homepage postcode lookup calls. When both a header and a meta CSP are present a
 * browser enforces the intersection, so on the first Cloudflare deploy the site's
 * primary call to action would have stopped working with no code change to point at.
 *
 * Parsing rather than string-comparing, so reordering directives or reformatting the
 * file does not fail the test; only a real difference in policy does.
 */
function parseCsp(policy: string): Map<string, Set<string>> {
  const directives = new Map<string, Set<string>>();
  for (const chunk of policy.split(";")) {
    const parts = chunk.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const [name, ...values] = parts;
    directives.set(name.toLowerCase(), new Set(values));
  }
  return directives;
}

function metaCsp(): string {
  const layout = readFileSync(resolve(ROOT, "src/layouts/BaseLayout.astro"), "utf8");
  const match = layout.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i
  );
  if (!match) throw new Error("no meta CSP found in BaseLayout.astro");
  return match[1];
}

function headersCsp(): string {
  const headers = readFileSync(resolve(ROOT, "public/_headers"), "utf8");
  const line = headers
    .split("\n")
    .filter((row) => !row.trimStart().startsWith("#"))
    .find((row) => /Content-Security-Policy:/i.test(row));
  if (!line) throw new Error("no CSP found in public/_headers");
  return line.replace(/.*Content-Security-Policy:\s*/i, "");
}

describe("CSP parity between the meta tag and _headers", () => {
  const meta = parseCsp(metaCsp());
  const headers = parseCsp(headersCsp());

  it("declares the same directives in both", () => {
    expect([...headers.keys()].sort()).toEqual([...meta.keys()].sort());
  });

  it("allows the same sources for every directive", () => {
    for (const [directive, metaValues] of meta) {
      const headerValues = headers.get(directive) ?? new Set<string>();
      expect(
        [...headerValues].sort(),
        `${directive} differs between the meta CSP and _headers`
      ).toEqual([...metaValues].sort());
    }
  });

  it("still allows the postcode lookup the homepage depends on", () => {
    // Named explicitly because this is the one that had already drifted, and its
    // failure mode is a dead call to action rather than an error anyone would see.
    for (const [label, policy] of [["meta", meta], ["_headers", headers]] as const) {
      expect(
        [...(policy.get("connect-src") ?? [])],
        `${label} connect-src must allow api.postcodes.io`
      ).toContain("https://api.postcodes.io");
    }
  });
});
