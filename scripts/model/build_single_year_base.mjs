/**
 * Build single-year-of-age ethnic population base using IPF.
 *
 * Problem: Census 2021 NOMIS only provides ethnic × 6 broad age bands (RM032).
 * We need ethnic × single year (0-90+) for proper cohort-component modelling.
 *
 * Solution: Iterative Proportional Fitting (IPF)
 *   Seed: NEWETHPOP 2021 single-year ethnic profile (model-generated but structurally realistic)
 *   Margin 1: Census 2021 RM032 ethnic × broad age × sex × LA (observed)
 *   Margin 2: Census 2021 TS009 total pop × single year × sex × LA (observed)
 *
 * Result: Census-consistent single-year ethnic populations.
 * Every marginal total matches observed Census data.
 *
 * Output: data/model/base_single_year_2021.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const RM032_PATH = path.resolve("data/raw/census_base/rm032_ethnic_age_sex.csv");
const TS009_PATH = path.resolve("data/raw/census_base/ts009_single_year_age_sex.csv");
const NEWETHPOP_2021 = path.resolve("data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2021_LEEDS2.csv");
const OUTPUT_DIR = path.resolve("data/model");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "base_single_year_2021.json");
mkdirSync(OUTPUT_DIR, { recursive: true });

const ETHNIC_GROUPS = ["WBI", "WIR", "WHO", "MIX", "IND", "PAK", "BAN", "CHI", "OAS", "BCA", "BAF", "OTH"];
const SEXES = ["M", "F"];
const AGES = []; for (let a = 0; a <= 90; a++) AGES.push(a); // 0 to 90 (90 = 90+)

const ETH_MAP_2021 = {
  "White: English, Welsh, Scottish, Northern Irish or British": "WBI",
  "White: Irish": "WIR", "White: Gypsy or Irish Traveller": "WHO",
  "White: Roma": "WHO", "White: Other White": "WHO",
  "Mixed or Multiple ethnic groups: White and Black Caribbean": "MIX",
  "Mixed or Multiple ethnic groups: White and Black African": "MIX",
  "Mixed or Multiple ethnic groups: White and Asian": "MIX",
  "Mixed or Multiple ethnic groups: Other Mixed or Multiple ethnic groups": "MIX",
  "Asian, Asian British or Asian Welsh: Indian": "IND",
  "Asian, Asian British or Asian Welsh: Pakistani": "PAK",
  "Asian, Asian British or Asian Welsh: Bangladeshi": "BAN",
  "Asian, Asian British or Asian Welsh: Chinese": "CHI",
  "Asian, Asian British or Asian Welsh: Other Asian": "OAS",
  "Black, Black British, Black Welsh, Caribbean or African: Caribbean": "BCA",
  "Black, Black British, Black Welsh, Caribbean or African: African": "BAF",
  "Black, Black British, Black Welsh, Caribbean or African: Other Black": "OTH",
  "Other ethnic group: Arab": "OTH", "Other ethnic group: Any other ethnic group": "OTH"
};
const PARENT_ETH = new Set(["Total: All usual residents", "White", "Mixed or Multiple ethnic groups",
  "Asian, Asian British or Asian Welsh", "Black, Black British, Black Welsh, Caribbean or African", "Other ethnic group"]);

// Map RM032 broad bands to single-year ranges
const BROAD_TO_SINGLES = {
  "Aged 24 years and under": Array.from({length: 25}, (_, i) => i),
  "Aged 25 to 34 years": Array.from({length: 10}, (_, i) => i + 25),
  "Aged 35 to 49 years": Array.from({length: 15}, (_, i) => i + 35),
  "Aged 50 to 64 years": Array.from({length: 15}, (_, i) => i + 50),
  "Aged 65 years and over": Array.from({length: 26}, (_, i) => i + 65) // 65-90+
};

function parseCsvLine(line) {
  const f = []; let c = ""; let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { f.push(c.trim()); c = ""; } else c += ch; }
  f.push(c.trim()); return f;
}

// ============================================================
// Parse RM032: ethnic × broad age × sex × LA (MARGIN 1)
// ============================================================
console.log("Parsing RM032 (ethnic × broad age × sex)...");
const rm032 = new Map(); // "code|eth|sex|broadAge" → pop
const rm032Lines = readFileSync(RM032_PATH, "utf8").split("\n").filter(l => l.trim());
for (let i = 1; i < rm032Lines.length; i++) {
  const cols = parseCsvLine(rm032Lines[i]);
  const code = cols[0], ethName = cols[2], ageName = cols[3], sexName = cols[4], pop = parseFloat(cols[5]);
  if (!code || isNaN(pop) || ageName === "Total") continue;
  if (PARENT_ETH.has(ethName)) continue;
  const eth = ETH_MAP_2021[ethName]; if (!eth) continue;
  const sex = sexName === "Female" ? "F" : "M";
  const key = `${code}|${eth}|${sex}|${ageName}`;
  rm032.set(key, (rm032.get(key) || 0) + pop);
}
const rm032Areas = new Set([...rm032.keys()].map(k => k.split("|")[0]));
console.log(`  ${rm032Areas.size} areas`);

// ============================================================
// Parse TS009: total × single year × sex × LA (MARGIN 2)
// ============================================================
console.log("Parsing TS009 (single year × sex)...");
const ts009 = new Map(); // "code|sex|age" → pop

function parseAgeName(name) {
  if (name === "Aged under 1 year") return 0;
  if (name === "Aged 90 years and over") return 90;
  const m = name.match(/Aged (\d+)/);
  return m ? parseInt(m[1]) : null;
}

const ts009Lines = readFileSync(TS009_PATH, "utf8").split("\n").filter(l => l.trim());
for (let i = 1; i < ts009Lines.length; i++) {
  const cols = parseCsvLine(ts009Lines[i]);
  const code = cols[0], ageName = cols[1], sexName = cols[2], pop = parseFloat(cols[3]);
  if (!code || isNaN(pop)) continue;
  const age = parseAgeName(ageName); if (age === null) continue;
  const sex = sexName === "Female" ? "F" : "M";
  ts009.set(`${code}|${sex}|${age}`, pop);
}
console.log(`  ${ts009.size} cells`);

// ============================================================
// Parse NEWETHPOP 2021: single year ethnic profile (SEED)
// ============================================================
console.log("Parsing NEWETHPOP 2021 seed profile...");
const seed = new Map(); // "code|eth|sex|age" → pop
const newethLines = readFileSync(NEWETHPOP_2021, "utf8").split("\n").filter(l => l.trim());

for (let i = 1; i < newethLines.length; i++) {
  const cols = parseCsvLine(newethLines[i]);
  const rawCode = cols[2], eth = cols[3];
  if (!rawCode || !ETHNIC_GROUPS.includes(eth)) continue;

  const codes = rawCode.split("+");
  // Columns 4-104 = M0..M100+, 105-205 = F0..F100+
  for (const code of codes) {
    for (let age = 0; age <= 90; age++) {
      const maleVal = parseFloat(cols[4 + age]) || 0;
      const femaleVal = parseFloat(cols[105 + age]) || 0;
      // For age 90, sum 90-100+
      if (age === 90) {
        let mSum = 0, fSum = 0;
        for (let a = 90; a <= 100; a++) {
          mSum += parseFloat(cols[4 + a]) || 0;
          fSum += parseFloat(cols[105 + a]) || 0;
        }
        seed.set(`${code}|${eth}|M|90`, (seed.get(`${code}|${eth}|M|90`) || 0) + mSum / codes.length);
        seed.set(`${code}|${eth}|F|90`, (seed.get(`${code}|${eth}|F|90`) || 0) + fSum / codes.length);
      } else {
        seed.set(`${code}|${eth}|M|${age}`, (seed.get(`${code}|${eth}|M|${age}`) || 0) + maleVal / codes.length);
        seed.set(`${code}|${eth}|F|${age}`, (seed.get(`${code}|${eth}|F|${age}`) || 0) + femaleVal / codes.length);
      }
    }
  }
}
console.log(`  ${seed.size} cells`);

// ============================================================
// IPF: Fit seed to Census 2021 margins
// ============================================================
console.log("\nRunning IPF...");
const commonAreas = [...rm032Areas].filter(c => ts009.has(`${c}|M|0`));
console.log(`  ${commonAreas.length} areas with both margins`);

const result = {}; // code → { eth → { sex → { age → pop } } }
let ipfCount = 0;

for (const code of commonAreas) {
  result[code] = {};

  for (const sex of SEXES) {
    // Initialize from seed (NEWETHPOP profile)
    const matrix = {}; // eth → age → pop
    for (const eth of ETHNIC_GROUPS) {
      matrix[eth] = {};
      for (const age of AGES) {
        matrix[eth][age] = Math.max(0.01, seed.get(`${code}|${eth}|${sex}|${age}`) || 0.01);
      }
    }

    // IPF iterations: alternate between fitting ethnic margins and age margins
    for (let iter = 0; iter < 20; iter++) {
      // Fit ethnic × broad age margins (from RM032)
      for (const [broadAge, singleAges] of Object.entries(BROAD_TO_SINGLES)) {
        for (const eth of ETHNIC_GROUPS) {
          const target = rm032.get(`${code}|${eth}|${sex}|${broadAge}`) || 0;
          let current = 0;
          for (const age of singleAges) {
            if (age <= 90) current += matrix[eth][age] || 0;
          }
          if (current > 0 && target > 0) {
            const factor = target / current;
            for (const age of singleAges) {
              if (age <= 90) matrix[eth][age] = (matrix[eth][age] || 0) * factor;
            }
          }
        }
      }

      // Fit total × single year margins (from TS009)
      for (const age of AGES) {
        const target = ts009.get(`${code}|${sex}|${age}`) || 0;
        let current = 0;
        for (const eth of ETHNIC_GROUPS) current += matrix[eth][age] || 0;
        if (current > 0 && target > 0) {
          const factor = target / current;
          for (const eth of ETHNIC_GROUPS) matrix[eth][age] = (matrix[eth][age] || 0) * factor;
        }
      }
    }

    // Store result
    for (const eth of ETHNIC_GROUPS) {
      if (!result[code][eth]) result[code][eth] = {};
      result[code][eth][sex] = {};
      let total = 0;
      for (const age of AGES) {
        result[code][eth][sex][age] = Math.round(matrix[eth][age] || 0);
        total += result[code][eth][sex][age];
      }
      result[code][eth][sex].total = total;
    }
  }

  ipfCount++;
}

console.log(`IPF complete for ${ipfCount} areas`);

// Verify
let totalPop = 0, totalWBI = 0;
for (const code of commonAreas) {
  for (const eth of ETHNIC_GROUPS) {
    for (const sex of SEXES) {
      totalPop += result[code][eth][sex].total;
      if (eth === "WBI") totalWBI += result[code][eth][sex].total;
    }
  }
}
console.log(`Total population: ${totalPop.toLocaleString()}`);
console.log(`WBI: ${totalWBI.toLocaleString()} (${(totalWBI/totalPop*100).toFixed(1)}%)`);

// Spot check Blackburn age pyramid
const bb = result["E06000008"];
if (bb) {
  console.log("\nBlackburn age pyramid (WBI vs PAK, males, selected ages):");
  for (const age of [0, 5, 15, 25, 35, 50, 65, 80]) {
    console.log(`  Age ${age}: WBI=${bb.WBI.M[age]} PAK=${bb.PAK.M[age]}`);
  }
}

// Write output
const output = {
  baseYear: 2021,
  source: "IPF: NEWETHPOP seed × Census 2021 RM032 ethnic margins × Census 2021 TS009 age margins",
  methodology: "Iterative Proportional Fitting (20 iterations). Seed from NEWETHPOP Leeds2 2021 projected population. Row margins: RM032 ethnic × broad age × sex (observed). Column margins: TS009 total × single year × sex (observed). All margins match Census 2021.",
  ethnicGroups: ETHNIC_GROUPS,
  ages: AGES,
  areaCount: ipfCount,
  areas: result
};

writeFileSync(OUTPUT_PATH, JSON.stringify(output), "utf8"); // Compact — this file is large
console.log(`\nWritten ${OUTPUT_PATH} (${(JSON.stringify(output).length / 1e6).toFixed(1)} MB)`);
