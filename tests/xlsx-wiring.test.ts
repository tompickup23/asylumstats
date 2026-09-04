import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * This file exists because of a real outage, not a hypothetical one.
 *
 * The npm `xlsx` package is frozen at 0.18.5 and its advisories are only fixed in builds
 * from cdn.sheetjs.com, so that is where this project takes it from. Those builds do not
 * bundle Node's `fs`: `XLSX.readFile()` throws "Cannot access file <path>" for a file
 * that plainly exists until `XLSX.set_fs(fs)` has been called. `XLSX.read(buffer)` is
 * unaffected, which is precisely why it hides.
 *
 * Upgrading to 0.20.3 on 3 September 2026 broke six transforms this way. The site kept
 * serving, `npm test` passed, `npm run build` passed, and the twice-daily data refresh
 * failed for a day before anyone looked — because `validate` does not run the transforms
 * and the first ingest in the chain aborts the rest.
 *
 * These two tests are the cheapest thing that would have caught it.
 */
function scriptFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...scriptFiles(path));
    else if (entry.name.endsWith(".mjs")) out.push(path);
  }
  return out;
}

describe("xlsx wiring", () => {
  it("routes every script through the shim rather than importing xlsx directly", () => {
    // A direct import compiles, runs, and silently loses readFile. The only way to keep
    // that from coming back is to make the direct import itself the failure.
    const offenders = scriptFiles("scripts")
      .filter((path) => path !== "scripts/lib/xlsx.mjs")
      .filter((path) => /from\s+["']xlsx["']/.test(readFileSync(resolve(ROOT, path), "utf8")));

    expect(
      offenders,
      `import xlsx from "../lib/xlsx.mjs" instead of "xlsx" in: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("can read a workbook off disk through the shim", async () => {
    // The actual failure mode: readFile on a file that exists.
    const XLSX = (await import("../scripts/lib/xlsx.mjs")).default;
    const dir = mkdtempSync(join(tmpdir(), "xlsx-wiring-"));
    const file = join(dir, "probe.xlsx");

    const sheet = XLSX.utils.aoa_to_sheet([["header"], ["value"]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
    XLSX.writeFile(book, file);

    const readBack = XLSX.readFile(file);
    expect(readBack.SheetNames).toContain("Sheet1");
    expect(XLSX.utils.sheet_to_json(readBack.Sheets.Sheet1, { header: 1 })[0]).toEqual(["header"]);
  });
});
