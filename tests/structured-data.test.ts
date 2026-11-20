import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ukRoutes from "../data/raw/manifests/uk_routes.json";

/**
 * The structured data a search engine reads agrees with the page a reader sees.
 *
 * Read on the live site on 18 November 2026: explainers, findings, county and region
 * pages showed a breadcrumb trail on screen and declared none in their JSON-LD; the place
 * pages declared one that skipped the region and county their visible trail shows;
 * /national/ described its figures with a bare WebPage; /cost/ carried no dateModified.
 * Each check below reads the built pages, so a template change that drops one fails here.
 * Reads dist, so it runs in the built-site guards step of deploy.yml and site-checks.yml.
 */
const DIST = resolve(import.meta.dirname ?? __dirname, "../dist");
const SITE_URL = "https://asylumstats.co.uk";
const built = existsSync(join(DIST, "sitemap.xml"));

type Node = Record<string, unknown>;

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

/** "places/burnley/index.html" -> "/places/burnley/". */
function pagePath(file: string): string {
  return `/${relative(DIST, file).replace(/index\.html$/, "").replace(/\.html$/, "/")}`;
}

function topLevelNodes(html: string): Node[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(
    ([, json]) => ([] as unknown[]).concat(JSON.parse(json)) as Node[]
  );
}

function decode(text: string): string {
  return text
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/** The trail the Breadcrumbs component draws: Home, each link, then the current page. */
function visibleTrail(html: string): Array<{ label: string; href: string | null }> | null {
  const nav = /<nav class="breadcrumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(html);
  if (!nav) return null;
  return [...nav[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(([, item]) => {
    const link = /<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(item);
    if (link) return { label: decode(link[2].replace(/<[^>]+>/g, "")), href: link[1] };
    const current = /<span aria-current="page"[^>]*>([\s\S]*?)<\/span>/.exec(item);
    return { label: decode((current?.[1] ?? "").replace(/<[^>]+>/g, "")), href: null };
  });
}

const sitemapLastmod = new Map<string, string>(
  built
    ? [...readFileSync(join(DIST, "sitemap.xml"), "utf8").matchAll(/<loc>(.*?)<\/loc>\s*<lastmod>(.*?)<\/lastmod>/g)].map(
        ([, loc, lastmod]) => [loc, lastmod] as [string, string]
      )
    : []
);

describe.skipIf(!built)("structured data in the built site", () => {
  // Redirect stubs for renamed URLs (astro.config.mjs) carry no content and are skipped.
  const pages = built
    ? htmlFiles(DIST)
        .map((file) => {
          const html = readFileSync(file, "utf8");
          return { path: pagePath(file), html, nodes: topLevelNodes(html) };
        })
        .filter((page) => !/<meta http-equiv="refresh"/i.test(page.html))
    : [];

  it("declares the same breadcrumb trail a page shows, on every page that shows one", () => {
    const problems: string[] = [];
    let trails = 0;
    for (const page of pages) {
      const visible = visibleTrail(page.html);
      const lists = page.nodes.filter((node) => node["@type"] === "BreadcrumbList");
      if (!visible) continue;
      trails += 1;
      if (lists.length !== 1) {
        problems.push(`${page.path}: shows a trail but declares ${lists.length} BreadcrumbList nodes`);
        continue;
      }
      const items = lists[0].itemListElement as Node[];
      const names = items.map((item) => item.name);
      if (JSON.stringify(names) !== JSON.stringify(visible.map((step) => step.label))) {
        problems.push(`${page.path}: declares ${JSON.stringify(names)}, shows ${JSON.stringify(visible.map((s) => s.label))}`);
        continue;
      }
      items.forEach((item, index) => {
        const step = visible[index];
        const expected = step.href === null ? `${SITE_URL}${page.path}` : new URL(step.href, SITE_URL).href;
        if (item.position !== index + 1) problems.push(`${page.path}: "${item.name}" at position ${item.position}`);
        if (typeof item.item !== "string" || new URL(item.item).href !== expected) {
          problems.push(`${page.path}: "${item.name}" points at ${String(item.item)}, the page links ${expected}`);
        }
      });
    }
    expect(trails).toBeGreaterThan(400);
    expect(problems).toEqual([]);
  });

  it("gives explainers, findings, counties and regions a trail", () => {
    const sections = [/^\/explained\/[^/]+\/$/, /^\/findings\/[^/]+\/$/, /^\/places\/counties\/[^/]+\/$/, /^\/places\/regions\/[^/]+\/$/];
    for (const section of sections) {
      const inSection = pages.filter((page) => section.test(page.path));
      const without = inSection.filter((page) => !page.nodes.some((node) => node["@type"] === "BreadcrumbList"));
      expect(inSection.length, String(section)).toBeGreaterThan(0);
      expect(without.map((page) => page.path), String(section)).toEqual([]);
    }
  });

  it("describes /national/ as a Dataset of the Home Office release it shows, dated by that release", () => {
    const national = pages.find((page) => page.path === "/national/");
    const dataset = national?.nodes.find((node) => node["@type"] === "Dataset");
    expect(dataset, "no Dataset on /national/").toBeDefined();
    expect(dataset!.dateModified).toBe(ukRoutes.releaseDate);
    expect(dataset!.dateModified).toBe(sitemapLastmod.get(`${SITE_URL}/national/`));
    const sources = dataset!.isBasedOn as Node[];
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(String(source.name)).toContain(ukRoutes.release);
      expect(ukRoutes.files.map((file) => file.sourceUrl)).toContain(source.sameAs);
    }
  });

  it("dates /cost/ in its Dataset and its sitemap entry alike", () => {
    const cost = pages.find((page) => page.path === "/cost/");
    const dataset = cost?.nodes.find((node) => node["@type"] === "Dataset");
    expect(String(dataset?.dateModified)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dataset!.dateModified).toBe(sitemapLastmod.get(`${SITE_URL}/cost/`));
  });

  it("never gives a page one date in its structured data and another in the sitemap", () => {
    const problems: string[] = [];
    for (const page of pages) {
      const lastmod = sitemapLastmod.get(`${SITE_URL}${page.path}`);
      if (!lastmod) continue;
      for (const node of page.nodes) {
        if (typeof node.dateModified === "string" && node.dateModified !== lastmod) {
          problems.push(`${page.path}: ${String(node["@type"])} dateModified ${node.dateModified}, sitemap lastmod ${lastmod}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
