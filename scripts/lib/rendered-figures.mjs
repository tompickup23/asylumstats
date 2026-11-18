import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const decode = (text) => text.replace(/&(?:amp|quot|apos|lt|gt|#39|#34);/g, (entity) => ({
  "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&#34;": '"', "&lt;": "<", "&gt;": ">"
})[entity]);

/** Markers sit on leaf elements, so the checked text is the figure the reader sees. */
export function extractFigures(html, page) {
  const rows = [];
  for (const match of html.matchAll(/<(span|strong|p|div)\b([^>]*\bdata-figure-key="[^"]+"[^>]*)>([\s\S]*?)<\/\1>/g)) {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
    const value = JSON.parse(attrs["data-figure-value"]);
    if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${page}: invalid figure value`);
    const digits = Number(attrs["data-figure-decimals"]);
    if (![0, 1].includes(digits)) throw new Error(`${page}: unsupported figure precision`);
    const text = decode(match[3].replace(/<[^>]+>/g, "")).trim();
    const expected = value === null ? "n/a" : value.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    const visible = text.replace(/%$|\s+per 10,000$/g, "");
    const displayValue = visible === "n/a" ? null : Number(visible.replaceAll(",", ""));
    const localeValue = value === null ? null : Number(expected.replaceAll(",", ""));
    const fixedValue = value === null ? null : Number(value.toFixed(digits));
    if (displayValue !== localeValue && displayValue !== fixedValue) throw new Error(`${page}: ${attrs["data-figure-key"]} renders ${text}, expected ${expected}`);
    rows.push({ page, metricKey: attrs["data-figure-key"], value, basis: attrs["data-figure-basis"], sourceUrl: attrs["data-figure-source"], displayValue, displayDecimals: digits });
  }
  const markerCount = [...html.matchAll(/\bdata-figure-key="/g)].length;
  if (markerCount !== rows.length) throw new Error(`${page}: uncollected figure marker`);
  return rows;
}

export function collectFigures(dist) {
  const rows = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith(".html")) {
        const page = "/" + relative(dist, path).replaceAll("\\", "/").replace(/index\.html$/, "");
        rows.push(...extractFigures(readFileSync(path, "utf8"), page));
      }
    }
  }
  visit(dist);
  if (!rows.length) throw new Error("No rendered figures found");
  return rows;
}

/** A key identifies one measure, geography and period basis, never two competing totals. */
export function figureConflicts(rows) {
  const seen = new Map();
  const conflicts = [];
  const displays = new Map();
  for (const row of rows) {
    const previous = seen.get(row.metricKey);
    if (previous && (previous.value !== row.value || previous.basis !== row.basis)) {
      conflicts.push(`${row.metricKey}: ${previous.page} (${previous.value}; ${previous.basis}) differs from ${row.page} (${row.value}; ${row.basis})`);
    } else seen.set(row.metricKey, row);
    if (row.displayDecimals !== undefined) {
      const displayKey = `${row.metricKey}:${row.displayDecimals}`;
      const priorDisplay = displays.get(displayKey);
      if (priorDisplay && priorDisplay.displayValue !== row.displayValue) {
        conflicts.push(`${row.metricKey}: ${priorDisplay.page} displays ${priorDisplay.displayValue}, ${row.page} displays ${row.displayValue}, both at ${row.displayDecimals} decimals`);
      } else displays.set(displayKey, row);
    }
  }
  return conflicts;
}
