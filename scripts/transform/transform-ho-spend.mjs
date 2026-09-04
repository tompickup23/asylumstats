#!/usr/bin/env node
/**
 * Normalise the Home Office spend-over-£25,000 corpus and build the asylum marts.
 *
 * Reads data/raw/ho_spend/, writes data/marts/ho_spend/.
 *
 * WHAT THIS DATASET IS, AND IS NOT
 * --------------------------------
 * It is every transaction over £25,000 that the Home Office recorded against an asylum
 * classification, taken from its own published transparency files. It is NOT total
 * asylum spending: the National Audit Office puts actual 2024-25 Home Office and MoJ
 * asylum spend at around £4.9 billion, against roughly £540 million visible here. The
 * difference is money reported in aggregate elsewhere and not itemised in this
 * publication. It is not missing, wasted or hidden, and nothing built on this mart may
 * imply that it is.
 *
 * FOUR THINGS THAT WILL BITE ANYONE EDITING THIS
 * ----------------------------------------------
 * 1. The Home Office tags asylum in TWO independent fields, not one: `Expense Area`
 *    (the directorate: UKASRA, UKAP and nine other labels since 2010) and `Expense
 *    Type` (the product: INITIAL ACCOMMODATION, CASH SUPPORT, ASYLUM PROVISION and
 *    about forty more). Filtering on Area alone returns £2.85bn and misses £1.47bn.
 *    The Area label disappeared entirely between 2017 and 2020; the Type codes did not,
 *    which is the only reason the series has no empty years.
 * 2. Extensions lie. April_2011.xls is a CSV; November_2012.xls is a ZIP. Files are
 *    sniffed by magic bytes, never by suffix.
 * 3. Two header spellings, `Total Line Spend` and `Transaction_ID`, appear in exactly
 *    one file each. Those two files are the ONLY main-department returns for December
 *    2018 and September 2019, so dropping them silently deletes two whole months.
 * 4. Eighteen months appear in more than one publication and some transactions repeat
 *    in adjacent monthly files: £3.23bn of cross-file republication. Repeated lines
 *    WITHIN one file are kept, because an invoice legitimately splits across lines.
 *
 * Licence: source data is Crown copyright under the Open Government Licence v3.0.
 *
 *   node scripts/transform/transform-ho-spend.mjs
 *   node scripts/transform/transform-ho-spend.mjs --check   # verify, write nothing
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "../lib/xlsx.mjs";
import { parseCsvGrid, readCsv } from "../lib/csv-parser.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const RAW = resolve(ROOT, "data/raw/ho_spend");
const OUT = resolve(ROOT, "data/marts/ho_spend");
const MANUAL = resolve(ROOT, "data/manual");

const checkOnly = process.argv.includes("--check");

/* ---------------------------------------------------------------- headers */

const HEADER_ALIASES = new Map(Object.entries({
  "department": "department", "department family": "department",
  "entity": "entity",
  "date": "date", "transaction date": "date", "date of payment": "date",
  "expense type": "expenseType",
  "expense area": "expenseArea",
  "supplier": "supplier", "supplier name": "supplier", "name": "supplier",
  "transaction number": "txn", "ref no": "txn", "account code": "txn",
  // Present in exactly one file each. See note 3 above.
  "transaction_id": "txn", "transaction id": "txn", "payment number": "txn",
  "amount": "amount", "spend": "amount", "base amount": "amount",
  "total line spend": "amount", "amount in sterling": "amount"
}));
const REQUIRED_ROLES = ["expenseArea", "supplier", "amount"];

function roleOf(cell) {
  const key = String(cell ?? "").replace(/﻿/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  return HEADER_ALIASES.get(key) ?? null;
}

/* ------------------------------------------------------------------ money */

function parseAmount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let s = String(value).trim()
    .replace(/[££]/g, "")
    .replace(/,/g, "")
    .replace(/−/g, "-")
    .replace(/�/g, "");
  if (s.startsWith("(") && s.endsWith(")")) s = `-${s.slice(1, -1)}`;
  if (!s || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------- date */

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  const s = String(value ?? "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));

  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})$/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return new Date(Date.UTC(year, +m[2] - 1, +m[1]));
  }

  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2}|\d{4})$/);
  if (m) {
    const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mo === undefined) return null;
    let year = +m[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return new Date(Date.UTC(year, mo, +m[1]));
  }
  return null;
}

/** UK financial year, April to March, as "2024/25". */
function financialYear(date) {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const start = date.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/* ------------------------------------------------------------- file reading */

/** Content sniffing. See note 2 above: never trust the extension. */
function sniff(buf) {
  if (buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b) return "zip";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "biff";
  return "text";
}

function decode(buf) {
  const utf8 = buf.toString("utf8");
  // A lone 0xA3 (£ in cp1252) decodes to U+FFFD. Fall back rather than lose the pound.
  return utf8.includes("�") ? buf.toString("latin1") : utf8.replace(/^﻿/, "");
}

/**
 * Returns { values, labels }: the same sheet twice.
 *
 * `values` keeps native types, so an amount stays a number at full precision.
 * `labels` is what the cell DISPLAYS, and the header row is read from it.
 *
 * The reason is a genuine trap. In the 2013 ODS files the header cell containing the
 * word "Date" is typed as a date by the spreadsheet, and SheetJS coerces it to the
 * string "Invalid Date". The date column then matches no header alias, every row in
 * the file loses its date, and because the dedupe key falls back to the raw string
 * those rows stop deduplicating — which silently moved the asylum total by £33m when
 * the library was upgraded. The data cells were fine throughout; only the header was
 * mangled. Reading labels for the header and values for the data fixes it without
 * costing numeric precision.
 */
function gridFromBuffer(buf) {
  const kind = sniff(buf);
  if (kind === "text") {
    const grid = parseCsvGrid(decode(buf));
    return { values: grid, labels: grid };
  }
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return {
    values: XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }),
    labels: XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" })
  };
}

function findHeader(labels) {
  for (let i = 0; i < Math.min(labels.length, 40); i += 1) {
    const roles = (labels[i] ?? []).map(roleOf);
    const present = new Set(roles.filter(Boolean));
    if (REQUIRED_ROLES.every((r) => present.has(r))) return { index: i, roles };
  }
  return null;
}

/* ----------------------------------------------------------------- reading */

function loadRows() {
  const manifestPath = resolve(RAW, "_manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("data/raw/ho_spend/_manifest.json missing. Run: npm run fetch:hospend");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  // One entry per (publication, attachment title). Where a month is published in more
  // than one format, prefer whichever sibling actually parses; CSV is tried first.
  const byTitle = new Map();
  for (const entry of manifest) {
    const key = `${entry.publication}\u0000${(entry.title ?? "").trim().toLowerCase()}`;
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(entry);
  }

  const rows = [];
  const report = [];
  for (const [key, entries] of byTitle) {
    const ordered = [...entries].sort((a, b) => {
      const ac = a.file.endsWith(".csv") ? 0 : 1;
      const bc = b.file.endsWith(".csv") ? 0 : 1;
      return ac - bc || a.file.localeCompare(b.file);
    });

    let parsed = false;
    for (const entry of ordered) {
      const path = resolve(RAW, entry.file);
      if (!existsSync(path)) { report.push([entry.file, 0, "missing on disk"]); continue; }
      let grid;
      try {
        grid = gridFromBuffer(readFileSync(path));
      } catch (err) {
        report.push([entry.file, 0, `unreadable: ${err.message}`]);
        continue;
      }
      const header = findHeader(grid.labels);
      if (!header) { report.push([entry.file, 0, "no header row found"]); continue; }

      let kept = 0;
      for (let r = header.index + 1; r < grid.values.length; r += 1) {
        const cells = grid.values[r] ?? [];
        if (!cells.some((c) => String(c ?? "").trim())) continue;
        const rec = {};
        header.roles.forEach((role, col) => {
          if (role && rec[role] === undefined && col < cells.length) rec[role] = cells[col];
        });
        const amount = parseAmount(rec.amount);
        if (amount === null) continue;
        rows.push({
          file: entry.file,
          publication: entry.publication,
          date: rec.date instanceof Date ? rec.date.toISOString().slice(0, 10) : String(rec.date ?? "").trim(),
          expenseType: String(rec.expenseType ?? "").trim(),
          expenseArea: String(rec.expenseArea ?? "").trim(),
          supplier: String(rec.supplier ?? "").trim(),
          txn: String(rec.txn ?? "").trim(),
          amount
        });
        kept += 1;
      }
      report.push([entry.file, kept, kept ? "ok" : "parsed but zero valid rows"]);
      if (kept) { parsed = true; break; }
    }
    if (!parsed) report.push([key.replace("\u0000", " | "), 0, "NO SIBLING PARSED"]);
  }
  return { rows, report, titles: byTitle.size };
}

/* --------------------------------------------------------------- dedupe */

/**
 * Remove cross-file republication only. For each fully-specified line, keep at most the
 * number of times it appears in any SINGLE file: repeats inside one file are a genuine
 * split invoice, repeats across two files are the same transaction published twice.
 */
function dedupe(rows) {
  // Key on the PARSED date, never the raw string. The same transaction is written
  // "01/04/2013" in one month's CSV and as a real date cell in the ODS of the same
  // month, so keying on raw text makes the answer depend on which format parsed first.
  // A NUL joins the parts because it is the one character that cannot occur in a field.
  const key = (r) => {
    const parsed = parseDate(r.date);
    const day = parsed ? parsed.toISOString().slice(0, 10) : `raw:${r.date}`;
    return [day, r.supplier, r.expenseArea, r.expenseType, r.txn, r.amount.toFixed(2)].join("\u0000");
  };
  const perFile = new Map();
  for (const r of rows) {
    const k = key(r);
    if (!perFile.has(k)) perFile.set(k, new Map());
    const files = perFile.get(k);
    files.set(r.file, (files.get(r.file) ?? 0) + 1);
  }
  const cap = new Map();
  for (const [k, files] of perFile) cap.set(k, Math.max(...files.values()));

  const seen = new Map();
  const kept = [];
  for (const r of rows) {
    const k = key(r);
    const n = seen.get(k) ?? 0;
    if (n < cap.get(k)) { kept.push(r); seen.set(k, n + 1); }
  }
  return kept;
}

/* ------------------------------------------------------- asylum classification */

const AREA_RE = /asylum|resettle|resettlment|ukasra|\basra\b/i;
/**
 * Expense TYPES naming an asylum or refugee product. Curated against the actual value
 * list rather than swept by a loose pattern.
 */
const TYPE_RE = new RegExp([
  "asylum",
  "initial accommodation", "dispersed accommodation", "contingency accommodation",
  "cash support", "integration loan",
  "refugee prog", "refugee repatriation", "refugee health", "refugee families",
  "resettle"
].join("|"), "i");
/**
 * Types a naive pattern would catch that are STAFF costs, not asylum support.
 * Excluded by name so the judgement is visible rather than buried in a regex.
 */
const TYPE_EXCLUDE = new Set([
  "ACCOMMODATION, SUBSISTENCE & GENERAL EXPENSES",
  "FOREIGN SUBSISTENCE",
  "SUBSISTENCE"
]);

function asylumTag(row) {
  const byArea = AREA_RE.test(row.expenseArea);
  const type = row.expenseType.toUpperCase().trim();
  const byType = TYPE_RE.test(type) && !TYPE_EXCLUDE.has(type);
  return { byArea, byType, tagged: byArea || byType };
}

/* ------------------------------------------------------------- entities */

function loadAliases() {
  const path = resolve(MANUAL, "entity-aliases.csv");
  const map = new Map();
  const meta = new Map();
  if (!existsSync(path)) return { map, meta };
  for (const row of readCsv(path)) {
    const raw = (row.raw_supplier ?? "").toUpperCase().trim();
    if (!raw) continue;
    map.set(raw, row.entity_id);
    if (!meta.has(row.entity_id)) {
      meta.set(row.entity_id, {
        entityId: row.entity_id,
        name: row.canonical_name,
        companyNumber: row.company_number || null,
        role: row.role || "other",
        mergeBasis: row.merge_basis || null
      });
    }
  }
  return { map, meta };
}

const slug = (s) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "").slice(0, 60);

/**
 * Display name for an entity with no hand-written alias. The source publishes supplier
 * names in block capitals, which is unreadable in running text and shouts on a page
 * about public money. Title-case it, but leave genuine acronyms and company suffixes
 * alone: "G4S CARE & JUSTICE SERVICES (UK) LTD" must not become "G4s Care & Justice
 * Services (Uk) Ltd".
 */
const KEEP_UPPER = new Set([
  "UK", "USA", "EU", "NHS", "HM", "HMRC", "MOD", "MOJ", "DWP", "DfE", "IT", "ICT",
  "PLC", "LLP", "LP", "CIC", "CIO", "T/A", "G4S", "IBM", "BT", "EE", "AWS",
  "PA", "KPMG", "PWC", "EY", "IOM", "ONS", "DVLA", "DBS", "SSE", "BBC", "AECOM"
]);
const LOWER_WORDS = new Set(["for", "and", "of", "the", "in", "on", "to", "at", "by"]);
function displayName(raw) {
  return raw.split(/\s+/).map((word, i) => {
    if (i > 0 && LOWER_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    const bare = word.replace(/[^A-Za-z/&]/g, "");
    if (KEEP_UPPER.has(bare.toUpperCase()) && bare.length <= 5) return word.toUpperCase();
    if (/^\(?[A-Z]&[A-Z]\)?$/.test(word)) return word;          // M&S, B&Q
    if (/\d/.test(word)) return word;                            // 23RED, 4TH
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(" ").replace(/\bMc([a-z])/g, (m, c) => `Mc${c.toUpperCase()}`);
}


/* ------------------------------------------------------- reconciliation */

/**
 * Bodies whose name reads as a local authority. Used to test one specific NAO figure:
 * the Home Office paid councils ~£883m in 2024-25 (£247m dispersal + £636m for
 * unaccompanied children). "Refugee Council" is a charity and is excluded by name,
 * because any name-based search will otherwise count it as a council and roughly
 * treble the answer.
 */
const COUNCIL_RE = /\b(COUNCIL|CNCL|BOROUGH OF|COUNTY BOROUGH|METROPOLITAN BOROUGH|CITY COUNCIL|COUNTY COUNCIL|DISTRICT COUNCIL|MBC|CORPORATION OF LONDON|GREATER LONDON AUTHORITY)\b/i;
const NOT_COUNCIL_RE = /REFUGEE COUNCIL|CORPORATION UK|COMPUTER SCIENCES|ENTRUST|ORACLE|POLICE|FIRE AUTHORITY/i;

const isCouncil = (name) => COUNCIL_RE.test(name) && !NOT_COUNCIL_RE.test(name);

function buildReconciliation(allRows, taggedRows, fy) {
  const componentsPath = resolve(MANUAL, "asylum-cost-components.csv");
  const components = existsSync(componentsPath)
    ? readCsv(componentsPath).filter((c) => c.fy === fy)
    : [];

  const inYear = (rows) => rows.filter((r) => financialYear(parseDate(r.date)) === fy);
  const sum = (rows) => Math.round(rows.reduce((t, r) => t + r.amount, 0) * 100) / 100;

  const taggedInYear = inYear(taggedRows);
  const allInYear = inYear(allRows);

  const typeIs = (rows, re) => rows.filter((r) => re.test(r.expenseType));
  const visible = {
    total: sum(taggedInYear),
    cashSupport: sum(typeIs(taggedInYear, /cash support/i)),
    accommodation: sum(typeIs(taggedInYear, /initial accommodation|dispersed accommodation|contingency accommodation|contract out serv/i)),
    // Council payments are tested against ALL Home Office spend, not just the asylum-
    // tagged subset: a grant to a council would not necessarily carry an asylum code,
    // so restricting to tagged rows would beg the question.
    councils: sum(allInYear.filter((r) => isCouncil(r.supplier))),
    councilsIncludingRefugeeCouncil: sum(allInYear.filter((r) => COUNCIL_RE.test(r.supplier) && !/CORPORATION UK|COMPUTER SCIENCES|ENTRUST|ORACLE|POLICE|FIRE AUTHORITY/i.test(r.supplier)))
  };

  const MEASURED = {
    accommodation_support: null,
    direct_accommodation: visible.accommodation,
    cash_support: visible.cashSupport,
    la_dispersal_grants: null,
    uasc_grants: null
  };

  const rows = components.map((c) => {
    const estimated = Number(c.amount_gbp);
    const published = Object.prototype.hasOwnProperty.call(MEASURED, c.component_id)
      ? MEASURED[c.component_id]
      : null;
    return {
      componentId: c.component_id,
      label: c.label,
      plainLabel: c.plain_label,
      payer: c.payer,
      parentId: c.parent_id || null,
      estimatedGbp: estimated,
      estimatedBasis: c.basis,
      publishedGbp: published,
      publishedBasis: published === null ? null : "published_transaction",
      sourceId: c.source_id,
      sourceTitle: c.source_title,
      sourceUrl: c.source_url,
      sourceLicence: c.source_licence,
      note: c.note || null
    };
  });

  const total = components.find((c) => c.component_id === "TOTAL");
  const totalGbp = total ? Number(total.amount_gbp) : null;

  return {
    generatedAt: new Date().toISOString(),
    fy,
    basisRule:
      "Two figures with different `basis` values may be COMPARED side by side, with both " +
      "bases named. They may never be summed, subtracted into a single total, or drawn as " +
      "one chart series. A ratio between two bases is itself `derived` and must name both " +
      "inputs, which is what `capture` below does.",
    headline: {
      publishedGbp: visible.total,
      publishedBasis: "published_transaction",
      estimatedGbp: totalGbp,
      estimatedBasis: "nao_estimate",
      capture: totalGbp
        ? {
            basis: "derived",
            inputs: ["published_transaction", "nao_estimate"],
            ratio: Math.round((visible.total / totalGbp) * 10000) / 10000,
            perHundredPounds: Math.round((visible.total / totalGbp) * 100),
            // Two short sentences, not one long one. This string is the first thing a
            // reader meets, and a test holds it below Flesch-Kincaid grade 9.
            plain:
              `The Home Office spends £100 on asylum. It shows a receipt for about ` +
              `£${Math.round((visible.total / totalGbp) * 100)}.`
          }
        : null
    },
    councilTest: {
      estimatedGbp: 883000000,
      estimatedNote: "£247m dispersal grants plus £636m for unaccompanied children (NAO, 2024-25).",
      publishedGbp: visible.councils,
      publishedIncludingRefugeeCouncilGbp: visible.councilsIncludingRefugeeCouncil,
      note:
        "Refugee Council is a charity, not a local authority. Counting it, as a naive name " +
        "search would, roughly trebles the published figure and is wrong."
    },
    whatThisIsNot:
      "The difference between the two columns is NOT missing, wasted or hidden money. It is " +
      "money accounted for in aggregate to Parliament and to auditors, and simply not " +
      "itemised in the transparency publication. Any page built on this must say so before " +
      "it shows the numbers.",
    components: rows
  };
}

/* ------------------------------------------------------------------ build */

function build() {
  const { rows: allRows, report, titles } = loadRows();
  if (process.env.HO_DUMP) {
    writeFileSync(process.env.HO_DUMP, JSON.stringify(allRows));
    console.log(`dumped ${allRows.length} pre-dedupe rows to ${process.env.HO_DUMP}`);
  }
  const rows = dedupe(allRows);
  const { map: aliasMap, meta: aliasMeta } = loadAliases();

  const tagged = [];
  for (const r of rows) {
    const tag = asylumTag(r);
    if (!tag.tagged) continue;
    const raw = r.supplier.replace(/\s+/g, " ").toUpperCase().trim();
    const entityId = aliasMap.get(raw) ?? slug(raw);
    tagged.push({ ...r, ...tag, raw, entityId, fy: financialYear(parseDate(r.date)) });
  }

  // --- entities
  const entities = new Map();
  for (const r of tagged) {
    if (!r.raw) continue;
    if (!entities.has(r.entityId)) {
      const meta = aliasMeta.get(r.entityId);
      entities.set(r.entityId, {
        entityId: r.entityId,
        name: meta?.name ?? displayName(r.raw),
        companyNumber: meta?.companyNumber ?? null,
        role: meta?.role ?? "other",
        mergeBasis: meta?.mergeBasis ?? null,
        rawSuppliers: new Set(),
        amountGbp: 0,
        transactions: 0,
        byFy: {},
        expenseTypes: {}
      });
    }
    const e = entities.get(r.entityId);
    e.rawSuppliers.add(r.raw);
    e.amountGbp += r.amount;
    e.transactions += 1;
    if (r.fy) e.byFy[r.fy] = (e.byFy[r.fy] ?? 0) + r.amount;
    const t = r.expenseType.toUpperCase().trim() || "(not stated)";
    e.expenseTypes[t] = (e.expenseTypes[t] ?? 0) + r.amount;
  }

  const entityList = [...entities.values()]
    .map((e) => ({
      ...e,
      rawSuppliers: [...e.rawSuppliers].sort(),
      amountGbp: Math.round(e.amountGbp * 100) / 100,
      byFy: Object.fromEntries(Object.entries(e.byFy)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, Math.round(v * 100) / 100])),
      topExpenseTypes: Object.entries(e.expenseTypes)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([label, value]) => ({ label, amountGbp: Math.round(value * 100) / 100 }))
    }))
    .map(({ expenseTypes, ...rest }) => rest)
    .sort((a, b) => b.amountGbp - a.amountGbp);

  // --- by financial year
  const byFy = new Map();
  for (const r of tagged) {
    if (!r.fy) continue;
    if (!byFy.has(r.fy)) byFy.set(r.fy, { fy: r.fy, amountGbp: 0, transactions: 0, areaLabels: new Set() });
    const y = byFy.get(r.fy);
    y.amountGbp += r.amount;
    y.transactions += 1;
    if (r.byArea && r.expenseArea) y.areaLabels.add(r.expenseArea);
  }
  const yearList = [...byFy.values()]
    .sort((a, b) => a.fy.localeCompare(b.fy))
    .map((y) => ({
      fy: y.fy,
      amountGbp: Math.round(y.amountGbp * 100) / 100,
      transactions: y.transactions,
      areaLabels: [...y.areaLabels].sort()
    }));

  const reconciliation = buildReconciliation(rows, tagged, "2024/25");
  // What the data COVERS, which is not the same thing as when the transform ran. A page
  // that prints its own build date next to a spending figure invites the reader to think
  // the figures are current to that date; they are current to the last month the Home
  // Office has published, which is typically months earlier.
  const transactionDates = tagged
    .map((r) => parseDate(r.date))
    .filter((d) => d && d.getUTCFullYear() > 2005 && d.getUTCFullYear() < 2100)
    .sort((a, b) => a - b);
  const monthLabel = (d) =>
    d ? d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : null;
  const coverage = {
    earliest: transactionDates[0]?.toISOString().slice(0, 10) ?? null,
    latest: transactionDates[transactionDates.length - 1]?.toISOString().slice(0, 10) ?? null,
    earliestLabel: monthLabel(transactionDates[0]),
    latestLabel: monthLabel(transactionDates[transactionDates.length - 1])
  };

  const totalGbp = tagged.reduce((sum, r) => sum + r.amount, 0);
  const parsedOk = report.filter((r) => r[2] === "ok").length;

  return {
    entities: {
      generatedAt: new Date().toISOString(),
      basis: "published_transaction",
      licence: "Open Government Licence v3.0 (Crown copyright)",
      sourceCollection: "https://www.gov.uk/government/collections/home-office-spending",
      whatThisIsNot:
        "Not total asylum spending. Only transactions over £25,000 recorded by the Home " +
        "Office against an asylum classification. The NAO puts actual 2024-25 Home Office " +
        "and MoJ asylum spend at around £4.9 billion. The difference is reported in " +
        "aggregate elsewhere, not missing.",
      coverage,
      summary: {
        transactions: tagged.length,
        totalGbp: Math.round(totalGbp * 100) / 100,
        entities: entityList.length,
        filesInCorpus: titles,
        filesParsed: parsedOk
      },
      entities: entityList
    },
    byYear: {
      generatedAt: new Date().toISOString(),
      basis: "published_transaction",
      noTrendLineRule:
        "Year-on-year comparison of this series is unsafe on its own. The Home Office has " +
        "used at least eleven expense-area labels for asylum since 2010 and none at all " +
        "between 2017 and 2020. A change between two years can be a reclassification. " +
        "areaLabels records which labels were in use each year.",
      years: yearList
    },
    reconciliation,
    diagnostics: {
      generatedAt: new Date().toISOString(),
      titles,
      parsedOk,
      rowsBeforeDedupe: allRows.length,
      rowsAfterDedupe: rows.length,
      republicationRemovedGbp:
        Math.round((allRows.reduce((s, r) => s + r.amount, 0) - rows.reduce((s, r) => s + r.amount, 0)) * 100) / 100,
      fileReport: report.filter((r) => r[2] !== "ok")
    }
  };
}


/* ------------------------------------------------------- regression guard */

/**
 * Refuse to overwrite a good mart with a smaller one.
 *
 * data/raw/ho_spend is gitignored, so CI re-downloads all 402 files on every run. A
 * partial download is the dangerous failure here: the transform would parse what it
 * found, report "180/180 files parsed" and commit a mart missing a third of the money,
 * and every check downstream would pass because the smaller number is internally
 * consistent. Nothing about it looks broken.
 *
 * So compare against the mart already on disk. A real Home Office release only ever adds
 * months, so the total should never fall. Anything below the floor is a fetch problem,
 * not a data story.
 */
const REGRESSION_FLOOR = 0.95;

function assertNoRegression(next) {
  const path = resolve(OUT, "ho-asylum-entities.json");
  if (!existsSync(path)) return null;

  let previous;
  try {
    previous = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  const before = previous?.summary;
  if (!before?.totalGbp || !before?.filesInCorpus) return null;

  const after = next.summary;
  const problems = [];
  if (after.filesInCorpus < before.filesInCorpus) {
    problems.push(
      `corpus shrank: ${before.filesInCorpus} files -> ${after.filesInCorpus}`
    );
  }
  if (after.totalGbp < before.totalGbp * REGRESSION_FLOOR) {
    problems.push(
      `total fell more than ${Math.round((1 - REGRESSION_FLOOR) * 100)}%: ` +
        `£${Math.round(before.totalGbp).toLocaleString()} -> £${Math.round(after.totalGbp).toLocaleString()}`
    );
  }
  return problems.length ? problems : null;
}

/* ------------------------------------------------------------------- main */

const marts = build();

const regression = assertNoRegression(marts.entities);
if (regression && !process.argv.includes("--allow-regression")) {
  console.error("\ntransform-ho-spend: REFUSING to write a smaller mart.");
  for (const problem of regression) console.error(`  ${problem}`);
  console.error(
    "\nThis is almost always an incomplete fetch, not a change in the data. Re-run\n" +
      "  npm run fetch:hospend\n" +
      "and check it reports the full file count. If the drop is genuine, re-run with\n" +
      "  npm run transform:hospend -- --allow-regression"
  );
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const files = {
  "ho-asylum-entities.json": marts.entities,
  "ho-asylum-by-year.json": marts.byYear,
  "asylum-cost-reconciliation.json": marts.reconciliation,
  "ho-spend-diagnostics.json": marts.diagnostics
};

let drift = 0;
for (const [name, payload] of Object.entries(files)) {
  const path = resolve(OUT, name);
  // generatedAt changes every run and must not count as drift.
  const stable = (o) => JSON.stringify({ ...o, generatedAt: undefined }, null, 1);
  if (checkOnly) {
    if (!existsSync(path) || stable(JSON.parse(readFileSync(path, "utf8"))) !== stable(payload)) {
      console.error(`  drift: ${name}`);
      drift += 1;
    }
  } else {
    writeFileSync(path, `${JSON.stringify(payload, null, 1)}\n`);
  }
}

const d = marts.diagnostics;
console.log(
  `transform-ho-spend: ${d.parsedOk}/${d.titles} files parsed, ` +
    `${d.rowsAfterDedupe.toLocaleString()} rows after removing ` +
    `£${Math.round(d.republicationRemovedGbp).toLocaleString()} of republication.`
);
console.log(
  `  asylum: ${marts.entities.summary.transactions.toLocaleString()} transactions, ` +
    `£${Math.round(marts.entities.summary.totalGbp).toLocaleString()}, ` +
    `${marts.entities.summary.entities} entities.`
);
if (d.fileReport.length) {
  console.error(`\n${d.fileReport.length} file(s) did not parse:`);
  for (const [file, , why] of d.fileReport) console.error(`  ${file}: ${why}`);
  process.exitCode = 1;
}
if (checkOnly && drift) {
  console.error(`\n${drift} mart(s) out of date. Run: npm run transform:hospend`);
  process.exitCode = 1;
}
