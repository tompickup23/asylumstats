import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { buildLocalAuthorityCsv } from "../src/lib/datasets";
import { loadLocalRouteLatest } from "../src/lib/route-data";

/** One CSV line, honouring double-quoted fields ("Bristol, City of"). No field spans lines. */
function parseLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { cells.push(cell); cell = ""; }
    else cell += char;
  }
  cells.push(cell);
  return cells;
}

describe("local authority CSV", () => {
  const [header, ...rows] = buildLocalAuthorityCsv().trimEnd().split("\n");
  const columns = parseLine(header);
  const records = rows.map((row) => Object.fromEntries(parseLine(row).map((cell, i) => [columns[i], cell])));
  const { areas } = loadLocalRouteLatest();

  it("has one row per authority and no combined stock-plus-flow total", () => {
    expect(records.length).toBe(areas.length);
    expect(new Set(records.map((r) => r.area_code)).size).toBe(areas.length);
    expect(columns.join(" ")).not.toMatch(/pathway|homes_for_ukraine|share_of_population/);
  });

  it("reproduces the published counts, and the breakdown sums to the total", () => {
    for (const row of rows) expect(parseLine(row).length).toBe(columns.length);
    expect(records.find((r) => r.area_code === "E06000023")?.area_name).toBe("Bristol, City of");
    const byCode = new Map(areas.map((area) => [area.areaCode, area]));
    for (const record of records) {
      const area = byCode.get(record.area_code)!;
      expect(Number(record.supported_asylum)).toBe(area.supportedAsylum);
      const parts = ["initial_accommodation", "dispersal_accommodation", "contingency_accommodation", "other_accommodation", "subsistence_only"]
        .reduce((sum, column) => sum + Number(record[column] || 0), 0);
      expect(parts).toBe(area.supportedAsylum);
    }
  });
});

/**
 * Every Dataset the built site declares is one Google Dataset Search can list: named,
 * described, licensed, with a named creator, and any download it promises actually built.
 * Reads dist, so it runs in the built-site guards step of deploy.yml and site-checks.yml.
 */
const DIST = resolve(import.meta.dirname ?? __dirname, "../dist");

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

function nodes(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [record, ...Object.values(record).flatMap(nodes)];
  }
  return [];
}

describe.skipIf(!existsSync(DIST))("Dataset markup in the built site", () => {
  it("is complete on every page that declares one, and every download exists", () => {
    const problems: string[] = [];
    let datasets = 0;
    for (const file of htmlFiles(DIST)) {
      const html = readFileSync(file, "utf8");
      const page = relative(DIST, file);
      for (const [, json] of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
        // Only top-level Datasets; isBasedOn sources are described, not published, here.
        const top = ([] as unknown[]).concat(JSON.parse(json)) as Array<Record<string, unknown>>;
        for (const dataset of top.filter((n) => n["@type"] === "Dataset")) {
          datasets += 1;
          const description = String(dataset.description ?? "");
          const creator = dataset.creator as Record<string, unknown> | undefined;
          if (!dataset.name) problems.push(`${page}: no name`);
          if (description.length < 50 || description.length > 5000) problems.push(`${page}: description ${description.length} chars`);
          if (!dataset.license) problems.push(`${page}: no licence`);
          if (!creator?.name) problems.push(`${page}: creator has no name`);
          if (!dataset.isBasedOn) problems.push(`${page}: no source (isBasedOn)`);
          for (const download of nodes(dataset.distribution).filter((n) => n["@type"] === "DataDownload")) {
            const path = new URL(String(download.contentUrl)).pathname;
            if (!existsSync(join(DIST, path))) problems.push(`${page}: download ${path} not built`);
          }
        }
      }
    }
    expect(datasets).toBeGreaterThan(300);
    expect(problems).toEqual([]);
  });
});
