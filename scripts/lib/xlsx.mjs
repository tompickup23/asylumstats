/**
 * SheetJS, wired up for Node.
 *
 * Import xlsx from HERE, never directly from "xlsx".
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The npm `xlsx` package is frozen at 0.18.5 and its published advisories are only
 * fixed in builds distributed from cdn.sheetjs.com, so that is where this project takes
 * it from. Those builds do not bundle Node's `fs`: `XLSX.readFile()` throws
 * "Cannot access file <path>" for a file that plainly exists until `XLSX.set_fs(fs)`
 * has been called. `XLSX.read(buffer)` is unaffected, which is exactly why the problem
 * hides — a script that reads its own bytes keeps working while every script using
 * readFile stops.
 *
 * That is not hypothetical. Upgrading to 0.20.3 on 3 September 2026 broke six
 * transforms this way and the twice-daily data refresh failed silently for a day: the
 * site kept serving, the build kept passing, and only the refresh workflow went red.
 * `npm test` and `npm run build` do not run the transforms, so nothing caught it.
 *
 * Calling set_fs twice is harmless, and this module is evaluated once per process.
 */
import * as fs from "node:fs";
import * as XLSX from "xlsx";

XLSX.set_fs(fs);

export default XLSX;
export * from "xlsx";
