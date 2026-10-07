#!/usr/bin/env node
// Lists the figures a data refresh moved by a large amount, for a human to glance at
// before the refresh goes live.
//
// Advisory only: it always exits 0. A test that pinned a figure would fail on every
// legitimate release (Birmingham's asylum support count fell from 2,637 to 2,142 in
// the March 2026 quarter, a real fall, and two pinned tests then blocked every deploy
// for a week). A large move is not a fault; it is something worth a second look.
//
// Usage: node scripts/audit/figure-changes.mjs [--base HEAD] [--threshold 15] [--min 100]
// Compares every JSON file under src/data/live/ in the working tree against --base.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const base = option("base", "HEAD");
const thresholdPct = Number(option("threshold", "15"));
const minValue = Number(option("min", "100"));
const liveDir = "src/data/live";

// Arrays of records are keyed by their identity rather than their position, so a new
// area or a new quarter does not shift every later element and report them all as changed.
const KEY_FIELDS = ["areaCode", "periodEnd", "date", "id", "slug", "key", "code", "label", "name"];

function recordKey(item, index) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) return `#${index}`;
  const parts = KEY_FIELDS.filter((field) => typeof item[field] === "string" || typeof item[field] === "number").map(
    (field) => `${field}=${item[field]}`
  );
  return parts.length > 0 ? `[${parts.join(",")}]` : `#${index}`;
}

function flatten(value, path, out) {
  if (typeof value === "number" && Number.isFinite(value)) {
    out.set(path, value);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${path}${recordKey(item, index)}`, out));
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) flatten(child, path ? `${path}.${key}` : key, out);
  }
  return out;
}

function readBase(file) {
  try {
    return JSON.parse(
      execFileSync("git", ["show", `${base}:${file}`], {
        encoding: "utf8",
        maxBuffer: 512 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"]
      })
    );
  } catch {
    return null;
  }
}

const changes = [];
for (const name of readdirSync(liveDir).filter((entry) => entry.endsWith(".json")).sort()) {
  const file = join(liveDir, name);
  const before = readBase(file);
  if (before === null) continue;
  const after = JSON.parse(readFileSync(file, "utf8"));
  const beforeFlat = flatten(before, "", new Map());
  const afterFlat = flatten(after, "", new Map());
  for (const [path, oldValue] of beforeFlat) {
    if (!afterFlat.has(path) || /generated_?at/i.test(path)) continue;
    const newValue = afterFlat.get(path);
    if (Math.max(Math.abs(oldValue), Math.abs(newValue)) < minValue || oldValue === 0) continue;
    const pct = ((newValue - oldValue) / Math.abs(oldValue)) * 100;
    if (Math.abs(pct) >= thresholdPct) changes.push({ file: name, path, oldValue, newValue, pct });
  }
}

changes.sort((left, right) => Math.abs(right.pct) - Math.abs(left.pct));
const shown = changes.slice(0, 40);
const lines = [
  `### Figures moved by ${thresholdPct}% or more against ${base}`,
  "",
  changes.length === 0
    ? `None of the figures of ${minValue} or more moved that far.`
    : `${changes.length} figure(s). Largest ${shown.length} shown. A large move is not an error; check it is real before deploying.`,
  ""
];
if (shown.length > 0) {
  lines.push("| File | Figure | Before | After | Change |", "|---|---|---:|---:|---:|");
  for (const change of shown) {
    lines.push(
      `| ${change.file} | \`${change.path}\` | ${change.oldValue} | ${change.newValue} | ${change.pct > 0 ? "+" : ""}${change.pct.toFixed(1)}% |`
    );
  }
}
console.log(lines.join("\n"));
