import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Compare actual module outputs, including each revision's rates and denominators. */
export function areaCostChanges(base, threshold) {
  const root = process.cwd();
  const temp = mkdtempSync(join(tmpdir(), "asylum-cost-audit-"));
  const run = (cwd, file) => execFileSync(process.execPath, [file], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  try {
    const archive = execFileSync("git", ["archive", base], { maxBuffer: 512 * 1024 * 1024 });
    execFileSync("tar", ["-xf", "-", "-C", temp], { input: archive });
    symlinkSync(join(root, "node_modules"), join(temp, "node_modules"), "dir");
    run(temp, "scripts/build/sync-live.mjs");
    run(root, "scripts/build/sync-live.mjs");
    const worker = join(root, "scripts/audit/area-cost-snapshot.mjs");
    const before = JSON.parse(run(temp, worker));
    const after = JSON.parse(run(root, worker));
    return formatAreaCostChanges(before, after, threshold);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

export function formatAreaCostChanges(before, after, threshold) {
  const old = new Map(before.map(c => [c.code, c]));
  const rows = [];
  const value = v => v === null ? "Unavailable" : String(v);
  for (const next of after) {
    const previous = old.get(next.code);
    if (!previous) { rows.push(`| ${next.name} | New area | Unavailable | ${next.pricedSubtotal} | Review |`); continue; }
    for (const key of ["pricedSubtotal", "burdenShare", "unpricedPeople", "hotelScenario"]) {
      const a = previous[key], b = next[key];
      if (a === b) continue;
      const pct = typeof a === "number" && typeof b === "number" && a !== 0 ? (b - a) / Math.abs(a) * 100 : null;
      if (["unpricedPeople", "hotelScenario"].includes(key) || pct === null || Math.abs(pct) >= threshold) {
        const label = key === "pricedSubtotal" ? "Priced subtotal only, GBP" : key;
        rows.push(`| ${next.name} (${next.code}) | ${label} | ${value(a)} | ${value(b)} | ${pct === null ? "Status changed" : `${pct.toFixed(1)}%`} |`);
      }
    }
    old.delete(next.code);
  }
  for (const removed of old.values()) rows.push(`| ${removed.name} | Removed area | ${removed.pricedSubtotal} | Unavailable | Review |`);
  const dates = c => c ? `count ${c.dates.count}, rates ${c.dates.rate}, taxpayers ${c.dates.taxpayers}` : "unavailable";
  return ["", "### Per-area cost and burden changes", "",
    `Before: ${dates(before[0])}. After: ${dates(after[0])}.`,
    "Annualised priced components only, not complete expenditure. Grants and separate accommodated allowances are excluded. Hotel pricing is a scenario. Missing values remain unavailable.", "",
    ...(rows.length ? ["| Area | Measure | Before | After | Change |", "|---|---|---:|---:|---|", ...rows] : ["No qualifying moves or coverage changes."])].join("\n");
}
