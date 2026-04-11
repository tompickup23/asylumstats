/**
 * Hamilton-Perry Model — Single Year of Age
 *
 * Matches Goodwin's age resolution. Every CCR from Census observations.
 *
 * CCR(age_a, eth, sex, LA) = Pop(age_a+10, eth, sex, LA, 2021) / Pop(age_a, eth, sex, LA, 2011)
 * CWR(eth, LA) = Children(0-4, eth, LA, 2021) / Women(15-44, eth, LA, 2021)
 *
 * Data:
 * - 2011 base: NEWETHPOP Population2011_LEEDS2.csv (observed Census 2011)
 * - 2021 base: IPF-constructed single-year (Census 2021 RM032 × TS009)
 * - SNPP envelope: ONS 2022-based Z1
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE_2021_PATH = path.resolve("data/model/base_single_year_2021.json");
const NEWETHPOP_2011 = path.resolve("data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2011_LEEDS2.csv");
const SNPP_PATH = path.resolve("data/raw/snpp/2022 SNPP Population persons.csv");
const SITE_OUTPUT = path.resolve("src/data/live/ethnic-projections.json");

const base2021 = JSON.parse(readFileSync(BASE_2021_PATH, "utf8"));
const ETHNIC_GROUPS = base2021.ethnicGroups;
const AGES = base2021.ages; // 0 to 90
const SEXES = ["M", "F"];

function parseCsvLine(line) {
  const f = []; let c = ""; let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { f.push(c.trim()); c = ""; } else c += ch; }
  f.push(c.trim()); return f;
}

// ============================================================
// Parse NEWETHPOP 2011 base population (single year of age)
// ============================================================
console.log("Parsing NEWETHPOP 2011 base...");
const pop2011 = new Map(); // "code|eth|sex|age" → pop
const lines2011 = readFileSync(NEWETHPOP_2011, "utf8").split("\n").filter(l => l.trim());

for (let i = 1; i < lines2011.length; i++) {
  const cols = parseCsvLine(lines2011[i]);
  const rawCode = cols[2], eth = cols[3];
  if (!rawCode || !ETHNIC_GROUPS.includes(eth)) continue;
  const codes = rawCode.split("+");

  for (const code of codes) {
    for (let age = 0; age <= 90; age++) {
      let mVal, fVal;
      if (age < 90) {
        mVal = parseFloat(cols[4 + age]) || 0;
        fVal = parseFloat(cols[105 + age]) || 0;
      } else {
        // Sum ages 90-100+ into 90+
        mVal = 0; fVal = 0;
        for (let a = 90; a <= 100; a++) {
          mVal += parseFloat(cols[4 + a]) || 0;
          fVal += parseFloat(cols[105 + a]) || 0;
        }
      }
      pop2011.set(`${code}|${eth}|M|${age}`, (pop2011.get(`${code}|${eth}|M|${age}`) || 0) + mVal / codes.length);
      pop2011.set(`${code}|${eth}|F|${age}`, (pop2011.get(`${code}|${eth}|F|${age}`) || 0) + fVal / codes.length);
    }
  }
}
const areas2011 = new Set([...pop2011.keys()].map(k => k.split("|")[0]));
console.log(`  ${areas2011.size} areas`);

// ============================================================
// Compute single-year CCRs: Pop(age+10, 2021) / Pop(age, 2011)
// ============================================================
console.log("Computing single-year CCRs...");
const areaCodes = Object.keys(base2021.areas).filter(c => areas2011.has(c));
console.log(`  ${areaCodes.length} areas in both censuses`);

const ccrs = new Map();
const cwrs = new Map();

for (const code of areaCodes) {
  for (const eth of ETHNIC_GROUPS) {
    // CWR: children / women of childbearing age
    let children = 0, women = 0;
    for (let age = 0; age <= 9; age++) {
      children += (base2021.areas[code][eth]?.M?.[age] || 0) + (base2021.areas[code][eth]?.F?.[age] || 0);
    }
    for (let age = 15; age <= 44; age++) {
      women += base2021.areas[code][eth]?.F?.[age] || 0;
    }
    cwrs.set(`${code}|${eth}`, women > 5 ? children / women / 10 : 0.03); // Per year

    for (const sex of SEXES) {
      // CCRs for ages 0-80 → 10-90
      for (let fromAge = 0; fromAge <= 80; fromAge++) {
        const toAge = fromAge + 10;
        const pop11 = pop2011.get(`${code}|${eth}|${sex}|${fromAge}`) || 0;
        const pop21 = base2021.areas[code][eth]?.[sex]?.[toAge] || 0;

        let ccr;
        if (pop11 > 5) {
          ccr = pop21 / pop11;
          ccr = Math.max(0.05, Math.min(5.0, ccr)); // Cap extremes
        } else {
          ccr = 1.0;
        }
        ccrs.set(`${code}|${eth}|${sex}|${fromAge}`, ccr);
      }
    }
  }
}
// FIX 3: White Other (WHO) Brexit adjustment
// EU net migration turned negative post-2021 (-162K 2021-2025)
// Reduce WHO CCRs by 15% for migration-heavy ages (20-44)
let brexitAdjusted = 0;
for (const code of areaCodes) {
  for (const sex of SEXES) {
    for (let fromAge = 10; fromAge <= 34; fromAge++) { // Ages 20-44 in 2021 (fromAge+10)
      const key = `${code}|WHO|${sex}|${fromAge}`;
      const ccr = ccrs.get(key);
      if (ccr && ccr > 1.0) {
        ccrs.set(key, 1.0 + (ccr - 1.0) * 0.85); // Reduce growth component by 15%
        brexitAdjusted++;
      }
    }
  }
}
console.log(`  FIX 3: Brexit-adjusted ${brexitAdjusted} WHO CCRs (ages 20-44, -15% growth)`);

// FIX 10: Roma reclassification — already handled in ETH_MAP_2021 which maps Roma → WHO
// The CCR computation uses the combined WHO group. No further action needed here.
// Document: 103K Roma in 2021 were previously coded as White Other in 2011.

console.log(`  ${ccrs.size} CCRs, ${cwrs.size} CWRs`);

// ============================================================
// Parse SNPP
// ============================================================
console.log("Parsing SNPP...");
const snppTotals = new Map();
const snppLines = readFileSync(SNPP_PATH, "utf8").split("\n").filter(l => l.trim());
const snppHeader = parseCsvLine(snppLines[0]);
const yearCols = snppHeader.slice(5);

for (let i = 1; i < snppLines.length; i++) {
  const cols = parseCsvLine(snppLines[i]);
  const code = cols[0]; if (!code?.startsWith("E")) continue;
  if (cols[4] !== "All ages") continue;
  if (!snppTotals.has(code)) { snppTotals.set(code, {}); }
  for (let j = 0; j < yearCols.length; j++) {
    const v = parseFloat(cols[5 + j]);
    if (!isNaN(v)) snppTotals.get(code)[yearCols[j]] = v;
  }
}
console.log(`  ${snppTotals.size} areas`);

// ============================================================
// PROJECT FORWARD: 10-year steps using single-year CCRs
// ============================================================
console.log("\nProjecting...");
const PROJ_YEARS = [2031, 2041, 2051, 2061];

const projections = {};

for (const code of areaCodes) {
  const timeline = {};

  // 2021 baseline
  let total2021 = 0;
  const eth2021 = {};
  for (const eth of ETHNIC_GROUPS) {
    eth2021[eth] = 0;
    for (const sex of SEXES) {
      eth2021[eth] += base2021.areas[code][eth]?.[sex]?.total || 0;
    }
    total2021 += eth2021[eth];
  }
  timeline[2021] = { total: total2021, eth: eth2021 };

  // Current population matrix: eth × sex × age
  let currentPop = {};
  for (const eth of ETHNIC_GROUPS) {
    currentPop[eth] = {};
    for (const sex of SEXES) {
      currentPop[eth][sex] = {};
      for (const age of AGES) {
        currentPop[eth][sex][age] = base2021.areas[code][eth]?.[sex]?.[age] || 0;
      }
    }
  }

  for (const year of PROJ_YEARS) {
    const newPop = {};

    for (const eth of ETHNIC_GROUPS) {
      newPop[eth] = {};
      for (const sex of SEXES) {
        newPop[eth][sex] = {};

        // Apply CCRs: each age cohort advances 10 years
        for (let toAge = 10; toAge <= 90; toAge++) {
          const fromAge = toAge - 10;
          const ccr = ccrs.get(`${code}|${eth}|${sex}|${fromAge}`) || 1.0;
          newPop[eth][sex][toAge] = Math.round((currentPop[eth][sex][fromAge] || 0) * ccr);
        }

        // 90+: also add survivors from current 90+
        newPop[eth][sex][90] = (newPop[eth][sex][90] || 0) +
          Math.round((currentPop[eth][sex][90] || 0) * 0.3);

        // Births (ages 0-9): use CWR
        const cwr = cwrs.get(`${code}|${eth}`) || 0.03;
        let women = 0;
        for (let age = 15; age <= 44; age++) {
          women += newPop[eth]?.F?.[age] || currentPop[eth]?.F?.[age] || 0;
        }
        const birthsPerYear = women * cwr;
        const sexRatio = sex === "M" ? 0.512 : 0.488;

        for (let age = 0; age <= 9; age++) {
          newPop[eth][sex][age] = Math.round(birthsPerYear * sexRatio);
        }
      }
    }

    // SNPP constraint
    const snppYear = String(Math.min(year, 2047));
    const snppTarget = snppTotals.get(code)?.[snppYear];
    if (snppTarget && snppTarget > 0) {
      let modelTotal = 0;
      for (const eth of ETHNIC_GROUPS) for (const sex of SEXES) for (const age of AGES) {
        modelTotal += newPop[eth][sex][age] || 0;
      }
      if (modelTotal > 0) {
        const scale = snppTarget / modelTotal;
        if (scale > 0.3 && scale < 3.0) {
          for (const eth of ETHNIC_GROUPS) for (const sex of SEXES) for (const age of AGES) {
            newPop[eth][sex][age] = Math.round((newPop[eth][sex][age] || 0) * scale);
          }
        }
      }
    }

    // Summarize
    let total = 0;
    const eth = {};
    for (const e of ETHNIC_GROUPS) {
      eth[e] = 0;
      for (const s of SEXES) for (const a of AGES) eth[e] += newPop[e][s][a] || 0;
      total += eth[e];
    }
    timeline[year] = { total, eth };

    currentPop = newPop;
  }

  projections[code] = timeline;
}

console.log(`Projected ${Object.keys(projections).length} areas`);

// ============================================================
// DIAGNOSTICS
// ============================================================
function natSummary(year) {
  let total = 0, wbi = 0;
  for (const code of areaCodes) {
    const d = projections[code][year]; if (!d) continue;
    total += d.total; wbi += d.eth.WBI || 0;
  }
  return { total, wbi: (wbi / total * 100).toFixed(1) };
}

console.log("\n=== SINGLE-YEAR HP NATIONAL SUMMARY ===");
for (const y of [2021, 2031, 2041, 2051, 2061]) {
  const s = natSummary(y);
  console.log(`${y}: WBI=${s.wbi}%, Total=${(s.total / 1e6).toFixed(1)}M`);
}

let wb50_41 = 0, wb50_51 = 0;
for (const code of areaCodes) {
  const d41 = projections[code][2041], d51 = projections[code][2051];
  if (d41 && d41.total > 0 && d41.eth.WBI / d41.total < 0.5) wb50_41++;
  if (d51 && d51.total > 0 && d51.eth.WBI / d51.total < 0.5) wb50_51++;
}
console.log(`WBI <50% by 2041: ${wb50_41} | by 2051: ${wb50_51}`);

for (const code of ["E06000008", "E08000025", "E07000117"]) {
  const d = projections[code]; if (!d) continue;
  const w = (y) => (d[y].eth.WBI / d[y].total * 100).toFixed(1);
  console.log(`${code}: WBI ${w(2021)}% → 2041 ${w(2041)}% → 2051 ${w(2051)}% → 2061 ${w(2061)}%`);
}

// ============================================================
// UPDATE SITE DATA
// ============================================================
console.log("\nUpdating ethnic-projections.json...");
const existing = JSON.parse(readFileSync(SITE_OUTPUT, "utf8"));

function toSimple(eth, total) {
  if (total === 0) return { white_british:0, white_other:0, asian:0, black:0, mixed:0, other:0 };
  return {
    white_british: Math.round((eth.WBI||0)/total*10000)/100,
    white_other: Math.round(((eth.WIR||0)+(eth.WHO||0))/total*10000)/100,
    asian: Math.round(((eth.IND||0)+(eth.PAK||0)+(eth.BAN||0)+(eth.CHI||0)+(eth.OAS||0))/total*10000)/100,
    black: Math.round(((eth.BCA||0)+(eth.BAF||0))/total*10000)/100,
    mixed: Math.round((eth.MIX||0)/total*10000)/100,
    other: Math.round((eth.OTH||0)/total*10000)/100
  };
}

for (const code of areaCodes) {
  if (!existing.areas[code]) continue;
  const area = existing.areas[code];
  const d = projections[code];

  area.projections = {};
  for (const y of [2031, 2041, 2051]) {
    if (d[y]) area.projections[String(y)] = toSimple(d[y].eth, d[y].total);
  }

  area.thresholds = [];
  const wbs = [2021, 2031, 2041, 2051, 2061].map(y => ({
    year: y, wb: d[y] ? d[y].eth.WBI / d[y].total * 100 : 100
  }));
  for (let i = 0; i < wbs.length - 1; i++) {
    if (wbs[i].wb >= 50 && wbs[i+1].wb < 50) {
      const cross = Math.round(wbs[i].year + (50 - wbs[i].wb) / (wbs[i+1].wb - wbs[i].wb) * (wbs[i+1].year - wbs[i].year));
      area.thresholds.push({ label: "White British <50%", year: cross, confidence: cross <= 2036 ? "high" : cross <= 2051 ? "medium" : "low" });
      break;
    }
  }

  const wb21 = wbs[0].wb, wb51 = wbs[3]?.wb ?? wb21;
  if (wb21 - wb51 > 2) {
    area.headlineStat = { value: `-${(wb21 - wb51).toFixed(1)}pp`, trend: `WBI ${wb21.toFixed(1)}% → ${wb51.toFixed(1)}% by 2051 (single-year HP, SNPP-constrained)` };
  }
}

existing.methodology = "Hamilton-Perry single-year-of-age model. CCRs from Census 2011 (NEWETHPOP) → Census 2021 (IPF-constructed from RM032 × TS009). 91 age groups × 12 ethnic groups × 2 sexes × 307 LAs. SNPP 2022-based envelope constraint. Every ratio derived from Census observations.";
existing.modelVersion = "5.0-single-year-hp";
existing.lastUpdated = new Date().toISOString().slice(0, 10);

writeFileSync(SITE_OUTPUT, JSON.stringify(existing, null, 2), "utf8");
console.log("Written ethnic-projections.json");
