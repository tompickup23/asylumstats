/**
 * Regional totals of people on asylum support, one row per region per edition.
 *
 * Source: Home Office, Immigration system statistics, regional and local authority
 * dataset, table Reg_01 ("Immigration groups, by Region"). Each edition is a quarter-end
 * stock, so editions can be compared with each other and must never be added together.
 *
 * Why this exists. Until 27 November 2026 the site held regional totals for the current
 * edition only, so a finding that said a region had risen or fallen over a year was
 * prose with nothing behind it that a test could read. The per-council history the site
 * does hold comes from a regional partnership's workbook and undercounted Yorkshire and
 * The Humber at 30 September 2025 by 1,584, because some council codes in it could not
 * be matched to a region. Regional claims are read from the Home Office's own regional
 * table instead.
 *
 * How it stays current. A plain run reads the mart as committed, adds or replaces the
 * edition the routes fetch currently holds, and writes it back. It needs no network, so
 * it cannot park a refresh. `--backfill` also downloads the earlier editions listed in
 * data/manual/regional-history-editions.json and records each file's SHA-256.
 *
 *   node scripts/transform/transform-regional-history.mjs
 *   node scripts/transform/transform-regional-history.mjs --backfill
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "../lib/xlsx.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = path.join(ROOT, "data/raw/uk_routes");
const MART = path.join(ROOT, "data/marts/uk_routes/regional-support-history.json");
const ROUTES_MANIFEST = path.join(ROOT, "data/raw/manifests/uk_routes.json");
const EDITIONS = path.join(ROOT, "data/manual/regional-history-editions.json");
const LANDING =
  "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-regional-and-local-authority-data";

const MONTHS = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12"
};

/** Reg_01 row label -> the name used across the site. Rows not listed here are dropped. */
const AREAS = {
  "England - East Midlands": "East Midlands",
  "England - East of England": "East of England",
  "England - London": "London",
  "England - North East": "North East",
  "England - North West": "North West",
  "England - South East": "South East",
  "England - South West": "South West",
  "England - West Midlands": "West Midlands",
  "England - Yorkshire and The Humber": "Yorkshire and The Humber",
  "Scotland - total": "Scotland",
  "Wales - total": "Wales",
  "Northern Ireland - total": "Northern Ireland",
  "England - total": "England",
  "United Kingdom - total": "United Kingdom"
};

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

function toNumber(cell) {
  const text = String(cell ?? "").replace(/,/g, "").trim();
  if (text === "" || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

function readEdition(file, sourceUrl) {
  const workbook = xlsx.read(readFileSync(file), { raw: false });
  const sheet = workbook.Sheets.Reg_01;
  if (!sheet) throw new Error(`${path.basename(file)} has no Reg_01 sheet`);

  // The snapshot date is in the title of Reg_02 ("... as at 30 September 2026"); Reg_01's
  // own title carries none in most editions.
  const titles = ["Reg_02", "Reg_01"]
    .map((name) => workbook.Sheets[name])
    .filter(Boolean)
    .flatMap((s) => xlsx.utils.sheet_to_json(s, { header: 1, raw: false, defval: "" }).slice(0, 3))
    .map((row) => row.join(" "));
  const dated = titles.map((t) => /as at (\d{1,2}) ([A-Za-z]+) (\d{4})/.exec(t)).find(Boolean);
  if (!dated) throw new Error(`${path.basename(file)}: no "as at" date in the Reg_02 or Reg_01 title`);
  const month = MONTHS[dated[2].toLowerCase()];
  if (!month) throw new Error(`${path.basename(file)}: unreadable month "${dated[2]}"`);
  const snapshotDate = `${dated[3]}-${month}-${dated[1].padStart(2, "0")}`;

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const headerIndex = rows.findIndex((row) => String(row[0]).trim() === "Location");
  if (headerIndex < 0) throw new Error(`${path.basename(file)}: Reg_01 has no "Location" header row`);
  const header = rows[headerIndex].map((cell) => String(cell).trim());
  // Columns are found by their heading, never by position: the Afghan columns were
  // renamed between the 2023 and 2025 editions and a later edition may add one.
  const find = (pattern) => header.findIndex((h) => pattern.test(h));
  const supported = find(/^Supported Asylum/i);
  if (supported < 0) throw new Error(`${path.basename(file)}: Reg_01 has no Supported Asylum column`);
  // The accommodation breakdown was not published in the earliest editions (March 2023
  // has the total only). Those cells are left null, never derived.
  const contingency = find(/Contingency Accommodation/i);
  const dispersal = find(/Dispersal Accommodation/i);
  const population = find(/^Population$/i);
  const cell = (row, index) => (index < 0 ? null : toNumber(row[index]));

  const areas = {};
  for (const row of rows.slice(headerIndex + 1)) {
    const name = AREAS[String(row[0]).trim()];
    if (!name) continue;
    areas[name] = {
      supportedAsylum: cell(row, supported),
      contingencyAccommodation: cell(row, contingency),
      dispersalAccommodation: cell(row, dispersal),
      population: cell(row, population)
    };
  }
  const missing = Object.values(AREAS).filter((name) => areas[name]?.supportedAsylum == null);
  if (missing.length) throw new Error(`${path.basename(file)}: Reg_01 is missing ${missing.join(", ")}`);

  return {
    snapshotDate,
    table: "Reg_01",
    fileName: path.basename(file),
    sourceUrl,
    sha256: sha256(file),
    areas
  };
}

async function download(url) {
  const file = path.join(RAW_DIR, path.basename(new URL(url).pathname));
  if (!existsSync(file)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    mkdirSync(RAW_DIR, { recursive: true });
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  return file;
}

const existing = existsSync(MART) ? JSON.parse(readFileSync(MART, "utf8")).editions : [];
const byDate = new Map(existing.map((edition) => [edition.snapshotDate, edition]));

if (process.argv.includes("--backfill")) {
  for (const url of JSON.parse(readFileSync(EDITIONS, "utf8")).editions) {
    const edition = readEdition(await download(url), url);
    byDate.set(edition.snapshotDate, edition);
  }
}

const manifest = JSON.parse(readFileSync(ROUTES_MANIFEST, "utf8"));
const current = manifest.files.find((file) => file.sourceId === "local_immigration_groups");
if (!current) throw new Error("uk_routes manifest has no local_immigration_groups file");
const currentEdition = readEdition(path.join(RAW_DIR, current.fileName), current.sourceUrl);
if (currentEdition.sha256 !== current.fileSha256) {
  throw new Error(`${current.fileName} does not match the SHA-256 in the uk_routes manifest`);
}
byDate.set(currentEdition.snapshotDate, currentEdition);

const editions = [...byDate.values()].sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
writeFileSync(
  MART,
  `${JSON.stringify(
    {
      publisher: "Home Office",
      dataset: "Immigration system statistics, regional and local authority data",
      table: "Reg_01",
      measure: "People in receipt of asylum support at the quarter end. A stock, not a flow.",
      landing: LANDING,
      licence: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      latestSnapshotDate: editions.at(-1).snapshotDate,
      editions
    },
    null,
    2
  )}\n`
);
console.log(
  `Regional history: ${editions.length} editions, ${editions[0].snapshotDate} to ${editions.at(-1).snapshotDate}.`
);
