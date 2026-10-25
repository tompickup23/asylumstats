#!/usr/bin/env node
/**
 * Build the housing pressure mart from three banked MHCLG files: the statutory
 * homelessness detailed local authority tables (H-CLIC), the autumn rough sleeping
 * snapshot, and the RO4 housing services revenue outturn.
 *
 * Every value keeps the sheet and cell it was read from, so the independent reader in
 * scripts/audit/verify-housing-pressure.py can check each one against the ODS XML. Columns
 * are found by their header text and the header row is asserted, so a moved column fails
 * the build instead of publishing the wrong figure.
 *
 * Units differ and are carried, never reconciled: temporary accommodation and duties
 * count households, children in TA and rough sleeping count people, RO4 is £ thousand.
 * [c] (suppressed, fewer than 5) and [x] (not submitted) stay null with a status.
 *
 *   node scripts/transform/transform-housing-pressure.mjs
 */

import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "../lib/xlsx.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = resolve(ROOT, "data/raw/mhclg_homelessness");
const MART = resolve(ROOT, "data/marts/mhclg_homelessness/housing-pressure.json");
const MANIFEST = resolve(ROOT, "data/raw/manifests/mhclg_homelessness.json");
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const fileFor = (id) => {
  const entry = manifest.files.find((file) => file.releaseId === id);
  if (!entry) throw new Error(`Manifest has no file for ${id}`);
  const bytes = readFileSync(resolve(RAW_DIR, entry.file));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== entry.sha256) throw new Error(`${entry.file}: sha256 ${sha256} does not match the manifest`);
  return { entry, workbook: XLSX.read(bytes, { type: "buffer" }) };
};

const STATUS = { "[c]": "suppressed", "[x]": "not_submitted", "[z]": "not_applicable", "[n]": "not_applicable", M: "not_submitted" };

/** A sheet as rows, with a lookup from header text to column index. */
function table(workbook, sheet, headerRow, codeCol) {
  const ws = workbook.Sheets[sheet];
  if (!ws) throw new Error(`Sheet ${sheet} missing`);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const header = rows[headerRow].map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim());
  const col = (pattern) => {
    const hits = header.flatMap((text, i) => (pattern.test(text) ? [i] : []));
    if (hits.length !== 1) throw new Error(`${sheet}: ${hits.length} headers match ${pattern}`);
    return hits[0];
  };
  const byCode = new Map();
  rows.forEach((row, i) => {
    if (i > headerRow && row?.[codeCol]) byCode.set(String(row[codeCol]).trim(), i);
  });
  /** One cell as { value, status, cell }; cell is the A1 reference, e.g. "TA1!C57". */
  const read = (rowIndex, colIndex, scale = 1) => {
    const raw = rows[rowIndex]?.[colIndex];
    const cell = `${sheet}!${XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })}`;
    if (typeof raw === "number") return { value: scale === 1 ? raw : Math.round(raw * scale), status: "published", cell };
    const status = STATUS[String(raw ?? "").trim()];
    if (!status) throw new Error(`${cell}: unexpected value ${JSON.stringify(raw)}`);
    return { value: null, status, cell };
  };
  return { rows, header, col, byCode, read };
}

const hclic = fileFor("hclic");
const rough = fileFor("rough_sleeping");
const ro4 = fileFor("ro4");

const ta1 = table(hclic.workbook, "TA1", 5, 0);
const a2p = table(hclic.workbook, "A2P", 5, 0);
const a2r = table(hclic.workbook, "A2R", 5, 0);
const rs = table(rough.workbook, "Table_1_Total", 4, 0);
const ro = table(ro4.workbook, "RO4_LA_Data_202526", 6, 1);

const COLS = {
  taHouseholds: ta1.col(/^Households in TA Total \[note 34\]$/),
  taWithChildren: ta1.col(/^Households in TA with children Total$/),
  taChildren: ta1.col(/^Children in TA Total$/),
  preventionTotal: a2p.col(/^Owed a prevention duty Total$/),
  preventionAsylum: a2p.col(/^Required to leave accommodation provided by Home Office as asylum support$/),
  reliefTotal: a2r.col(/^Owed a relief duty Total$/),
  reliefAsylum: a2r.col(/^Required to leave accommodation provided by Home Office as asylum support$/),
  roughSleeping: rs.col(/^2025$/),
  homelessnessNet: ro.col(/^TOTAL HOMELESSNESS - Net Current Expenditure \(C7 = C3 - C6\)$/)
};

function figures(code, roRowOverride) {
  const at = (t, label) => {
    const row = t.byCode.get(code);
    if (row === undefined) throw new Error(`${label}: no row for ${code}`);
    return row;
  };
  const ta = at(ta1, "TA1"), p = at(a2p, "A2P"), r = at(a2r, "A2R"), s = at(rs, "Table_1_Total");
  const o = roRowOverride ?? at(ro, "RO4");
  return {
    temporaryAccommodation: {
      households: ta1.read(ta, COLS.taHouseholds),
      householdsWithChildren: ta1.read(ta, COLS.taWithChildren),
      children: ta1.read(ta, COLS.taChildren)
    },
    duties: {
      prevention: a2p.read(p, COLS.preventionTotal),
      relief: a2r.read(r, COLS.reliefTotal),
      preventionLeavingAsylumSupport: a2p.read(p, COLS.preventionAsylum),
      reliefLeavingAsylumSupport: a2r.read(r, COLS.reliefAsylum)
    },
    roughSleeping: rs.read(s, COLS.roughSleeping),
    // RO4 reports £ thousand; stored in pounds so callers never rescale.
    homelessnessNetSpend: o === null ? null : ro.read(o, COLS.homelessnessNet, 1000)
  };
}

const areas = JSON.parse(readFileSync(resolve(ROOT, "data/marts/uk_routes/local-route-latest.json"), "utf8"))
  .areas.filter((area) => area.countryName === "England");
const out = {};
for (const area of areas) out[area.areaCode] = { areaName: area.areaName, ...figures(area.areaCode) };

const roEngland = ro.rows.findIndex((row) => row?.[2] === "ENGLAND");
if (roEngland < 0) throw new Error("RO4: no ENGLAND row");
const englandRough = rs.rows.findIndex((row) => row?.[2] === "E92000001");
rs.byCode.set("E92000001", englandRough);
const england = figures("E92000001", roEngland);

const source = ({ entry }) => ({
  title: entry.label, url: entry.sourceUrl, landing: entry.landing, released: entry.released,
  period: entry.period, periodLabel: entry.periodLabel, stockDate: entry.stockDate ?? null,
  status: entry.statisticsStatus, file: entry.file, sha256: entry.sha256
});
const mart = {
  dataset: "mhclg_homelessness",
  description: "Homelessness pressure for English local authorities, read cell by cell from banked MHCLG files. Values are null where the source cell is suppressed ([c]), not submitted ([x]) or not applicable.",
  units: {
    "temporaryAccommodation.households": "households, at the end of the quarter",
    "temporaryAccommodation.householdsWithChildren": "households, at the end of the quarter",
    "temporaryAccommodation.children": "children (people), at the end of the quarter",
    duties: "households assessed as owed the duty during the quarter",
    roughSleeping: "people, single night snapshot",
    homelessnessNetSpend: "pounds, net current expenditure after income, financial year"
  },
  sources: { hclic: source(hclic), roughSleeping: source(rough), ro4: source(ro4) },
  england,
  areas: out
};
mkdirSync(dirname(MART), { recursive: true });
writeFileSync(MART, `${JSON.stringify(mart, null, 2)}\n`);
console.log(`housing-pressure: ${Object.keys(out).length} English areas written to ${MART.replace(`${ROOT}/`, "")}`);
