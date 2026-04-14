/**
 * Backcast Validation — Hamilton-Perry Model
 *
 * Validates the ACTUAL projection model (not a simplified CC substitute).
 * Replicates the exact HP methodology from run_hp_single_year.mjs:
 *
 * 1. Parse NEWETHPOP 2011 single-year base (same source as forward model)
 * 2. Parse IPF-constructed 2021 base (same source as forward model)
 * 3. Compute CCRs and CWRs identically to the forward model
 * 4. Project from 2011 → 2021 using one 10-year HP step
 * 5. Compare to Census 2021 actuals (from ethnic-projections.json)
 * 6. Also run national-CCR-only variant as baseline
 * 7. Compare against NEWETHPOP's own 2021 prediction
 *
 * Output: src/data/live/model-validation.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// ============================================================
// FILE PATHS — same inputs as run_hp_single_year.mjs
// ============================================================
const BASE_2021_PATH = path.resolve("data/model/base_single_year_2021.json");
const NEWETHPOP_2011 = path.resolve("data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2011_LEEDS2.csv");
const NEWETHPOP_2021 = path.resolve("data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2021_LEEDS2.csv");
const CENSUS_PATH = path.resolve("src/data/live/ethnic-projections.json");
const OUTPUT_PATH = path.resolve("src/data/live/model-validation.json");

const base2021 = JSON.parse(readFileSync(BASE_2021_PATH, "utf8"));
const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8"));
const ETHNIC_GROUPS = base2021.ethnicGroups;
const AGES = base2021.ages; // 0 to 90
const SEXES = ["M", "F"];

// Census grouping (matches run_hp_single_year.mjs toSimple) — supports both 12 and 20 group modes
const GROUP_MAP_SIMPLE = {
  WBI: "white_british",
  WIR: "white_other", WGT: "white_other", WRO: "white_other", WHO: "white_other",
  MWA: "mixed", MWF: "mixed", MWC: "mixed", MOM: "mixed", MIX: "mixed",
  IND: "asian", PAK: "asian", BAN: "asian", CHI: "asian", OAS: "asian",
  BAF: "black", BCA: "black", OBL: "black",
  ARB: "other", OOT: "other", OTH: "other",
  BLA: "black", BLC: "black" // NEWETHPOP codes
};
const SIMPLE_GROUPS = ["white_british", "white_other", "asian", "black", "mixed", "other"];

function parseCsvLine(line) {
  const f = []; let c = ""; let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { f.push(c.trim()); c = ""; } else c += ch; }
  f.push(c.trim()); return f;
}

function r(n) { return Math.round(n * 100) / 100; }

// ============================================================
// 1. Parse NEWETHPOP 2011 base (12 groups) and split to 20
//    (identical methodology to run_hp_single_year.mjs)
// ============================================================
console.log("Parsing NEWETHPOP 2011 base (12 groups)...");
const NEWETHPOP_GROUPS = ["WBI", "WIR", "WHO", "MIX", "IND", "PAK", "BAN", "CHI", "OAS", "BLA", "BLC", "OBL", "OTH"];
const pop2011_12 = new Map();

const lines2011 = readFileSync(NEWETHPOP_2011, "utf8").split("\n").filter(l => l.trim());
for (let i = 1; i < lines2011.length; i++) {
  const cols = parseCsvLine(lines2011[i]);
  const rawCode = cols[2], eth = cols[3];
  if (!rawCode) continue;
  const codes = rawCode.split("+");

  for (const code of codes) {
    for (let age = 0; age <= 90; age++) {
      let mVal, fVal;
      if (age < 90) {
        mVal = parseFloat(cols[4 + age]) || 0;
        fVal = parseFloat(cols[105 + age]) || 0;
      } else {
        mVal = 0; fVal = 0;
        for (let a = 90; a <= 100; a++) {
          mVal += parseFloat(cols[4 + a]) || 0;
          fVal += parseFloat(cols[105 + a]) || 0;
        }
      }
      pop2011_12.set(`${code}|${eth}|M|${age}`, (pop2011_12.get(`${code}|${eth}|M|${age}`) || 0) + mVal / codes.length);
      pop2011_12.set(`${code}|${eth}|F|${age}`, (pop2011_12.get(`${code}|${eth}|F|${age}`) || 0) + fVal / codes.length);
    }
  }
}
const areas2011 = new Set([...pop2011_12.keys()].map(k => k.split("|")[0]));
console.log(`  ${areas2011.size} areas from 2011 (12-group)`);

// Split 2011 from 12 to 20 groups using 2021 proportions
console.log("Splitting 2011 data to 20 groups...");
const NEWETHPOP_TO_CHILDREN = {
  WBI: ["WBI"], WIR: ["WIR"],
  WHO: ["WGT", "WRO", "WHO"],
  MIX: ["MWA", "MWF", "MWC", "MOM"],
  IND: ["IND"], PAK: ["PAK"], BAN: ["BAN"], CHI: ["CHI"], OAS: ["OAS"],
  BLA: ["BAF"], BLC: ["BCA"], OBL: ["OBL"],
  OTH: ["ARB", "OOT"]
};

const pop2011 = new Map();
for (const code of Object.keys(base2021.areas)) {
  if (!areas2011.has(code)) continue;
  for (const sex of SEXES) {
    for (let age = 0; age <= 90; age++) {
      for (const [parentEth, children] of Object.entries(NEWETHPOP_TO_CHILDREN)) {
        const parentPop = pop2011_12.get(`${code}|${parentEth}|${sex}|${age}`) || 0;
        if (parentPop <= 0) {
          for (const child of children) pop2011.set(`${code}|${child}|${sex}|${age}`, 0);
          continue;
        }
        if (children.length === 1) {
          pop2011.set(`${code}|${children[0]}|${sex}|${age}`, parentPop);
          continue;
        }
        let parentTotal2021 = 0;
        for (const child of children) parentTotal2021 += base2021.areas[code]?.[child]?.[sex]?.[age] || 0;
        if (parentTotal2021 <= 0) {
          for (const child of children) pop2011.set(`${code}|${child}|${sex}|${age}`, parentPop / children.length);
        } else {
          for (const child of children) {
            const share = (base2021.areas[code]?.[child]?.[sex]?.[age] || 0) / parentTotal2021;
            pop2011.set(`${code}|${child}|${sex}|${age}`, parentPop * share);
          }
        }
      }
    }
  }
}
console.log(`  Split complete`);

// ============================================================
// 2. Parse NEWETHPOP 2021 prediction (for comparison)
// ============================================================
console.log("Parsing NEWETHPOP 2021 prediction...");
const newethpop2021 = new Map(); // code → { eth → totalPop, total }
const lines2021n = readFileSync(NEWETHPOP_2021, "utf8").split("\n").filter(l => l.trim());
for (let i = 1; i < lines2021n.length; i++) {
  const cols = parseCsvLine(lines2021n[i]);
  const rawCode = cols[2], ethGroup = cols[3];
  if (!rawCode) continue;
  let totalPop = 0;
  for (let j = 4; j < cols.length; j++) {
    const val = parseFloat(cols[j]);
    if (!isNaN(val)) totalPop += val;
  }
  const areaCodes = rawCode.split("+");
  const popPerCode = totalPop / areaCodes.length;
  for (const code of areaCodes) {
    if (!newethpop2021.has(code)) newethpop2021.set(code, { total: 0 });
    const area = newethpop2021.get(code);
    area[ethGroup] = (area[ethGroup] || 0) + popPerCode;
    area.total += popPerCode;
  }
}
console.log(`  ${newethpop2021.size} areas`);

// ============================================================
// 3. Compute CCRs and CWRs
//    (identical to run_hp_single_year.mjs lines 70-131)
// ============================================================
console.log("Computing CCRs and CWRs...");
const areaCodes = Object.keys(base2021.areas).filter(c => areas2011.has(c));
console.log(`  ${areaCodes.length} areas in both censuses`);

const ccrs = new Map();
const cwrs = new Map();

for (const code of areaCodes) {
  for (const eth of ETHNIC_GROUPS) {
    // CWR
    let children = 0, women = 0;
    for (let age = 0; age <= 9; age++) {
      children += (base2021.areas[code][eth]?.M?.[age] || 0) + (base2021.areas[code][eth]?.F?.[age] || 0);
    }
    for (let age = 15; age <= 44; age++) {
      women += base2021.areas[code][eth]?.F?.[age] || 0;
    }
    cwrs.set(`${code}|${eth}`, women > 5 ? children / women / 10 : 0.03);

    for (const sex of SEXES) {
      for (let fromAge = 0; fromAge <= 80; fromAge++) {
        const toAge = fromAge + 10;
        const pop11 = pop2011.get(`${code}|${eth}|${sex}|${fromAge}`) || 0;
        const pop21 = base2021.areas[code][eth]?.[sex]?.[toAge] || 0;

        let ccr;
        if (pop11 > 5) {
          ccr = pop21 / pop11;
          ccr = Math.max(0.05, Math.min(5.0, ccr));
        } else {
          ccr = 1.0;
        }
        ccrs.set(`${code}|${eth}|${sex}|${fromAge}`, ccr);
      }
    }
  }
}

// Brexit WHO adjustment (identical to run_hp_single_year.mjs lines 109-124)
let brexitAdjusted = 0;
for (const code of areaCodes) {
  for (const sex of SEXES) {
    for (let fromAge = 10; fromAge <= 34; fromAge++) {
      const key = `${code}|WHO|${sex}|${fromAge}`;
      const ccr = ccrs.get(key);
      if (ccr && ccr > 1.0) {
        ccrs.set(key, 1.0 + (ccr - 1.0) * 0.85);
        brexitAdjusted++;
      }
    }
  }
}
console.log(`  ${ccrs.size} CCRs, ${cwrs.size} CWRs (${brexitAdjusted} Brexit-adjusted)`);

// ============================================================
// 4. Compute NATIONAL-AVERAGE CCRs (population-weighted)
//    For baseline comparison
// ============================================================
console.log("Computing national-average CCRs...");
const natNumerator = new Map(); // "eth|sex|fromAge" → sum of pop21
const natDenominator = new Map(); // "eth|sex|fromAge" → sum of pop11
const natCWR_children = new Map(); // "eth" → total children
const natCWR_women = new Map(); // "eth" → total women

for (const code of areaCodes) {
  for (const eth of ETHNIC_GROUPS) {
    let children = 0, women = 0;
    for (let age = 0; age <= 9; age++) {
      children += (base2021.areas[code][eth]?.M?.[age] || 0) + (base2021.areas[code][eth]?.F?.[age] || 0);
    }
    for (let age = 15; age <= 44; age++) {
      women += base2021.areas[code][eth]?.F?.[age] || 0;
    }
    natCWR_children.set(eth, (natCWR_children.get(eth) || 0) + children);
    natCWR_women.set(eth, (natCWR_women.get(eth) || 0) + women);

    for (const sex of SEXES) {
      for (let fromAge = 0; fromAge <= 80; fromAge++) {
        const toAge = fromAge + 10;
        const key = `${eth}|${sex}|${fromAge}`;
        const pop11 = pop2011.get(`${code}|${eth}|${sex}|${fromAge}`) || 0;
        const pop21 = base2021.areas[code][eth]?.[sex]?.[toAge] || 0;
        natNumerator.set(key, (natNumerator.get(key) || 0) + pop21);
        natDenominator.set(key, (natDenominator.get(key) || 0) + pop11);
      }
    }
  }
}

const nationalCCRs = new Map();
const nationalCWRs = new Map();
for (const eth of ETHNIC_GROUPS) {
  const w = natCWR_women.get(eth) || 1;
  const c = natCWR_children.get(eth) || 0;
  nationalCWRs.set(eth, w > 5 ? c / w / 10 : 0.03);

  for (const sex of SEXES) {
    for (let fromAge = 0; fromAge <= 80; fromAge++) {
      const key = `${eth}|${sex}|${fromAge}`;
      const num = natNumerator.get(key) || 0;
      const den = natDenominator.get(key) || 1;
      let ccr = den > 5 ? num / den : 1.0;
      ccr = Math.max(0.05, Math.min(5.0, ccr));
      nationalCCRs.set(key, ccr);
    }
  }
}
// Apply Brexit adjustment to national WHO CCRs
for (const sex of SEXES) {
  for (let fromAge = 10; fromAge <= 34; fromAge++) {
    const key = `WHO|${sex}|${fromAge}`;
    const ccr = nationalCCRs.get(key);
    if (ccr && ccr > 1.0) {
      nationalCCRs.set(key, 1.0 + (ccr - 1.0) * 0.85);
    }
  }
}

// ============================================================
// 5. Run HP backcast: 2011 → 2021
// ============================================================
function runHPBackcast(useNationalCCRs) {
  const results = new Map(); // code → { simple group → percentage }

  for (const code of areaCodes) {
    // Build 2011 population matrix
    const currentPop = {};
    for (const eth of ETHNIC_GROUPS) {
      currentPop[eth] = {};
      for (const sex of SEXES) {
        currentPop[eth][sex] = {};
        for (const age of AGES) {
          currentPop[eth][sex][age] = pop2011.get(`${code}|${eth}|${sex}|${age}`) || 0;
        }
      }
    }

    // One 10-year HP step
    const newPop = {};
    for (const eth of ETHNIC_GROUPS) {
      newPop[eth] = {};
      for (const sex of SEXES) {
        newPop[eth][sex] = {};

        // Apply CCRs: each age cohort advances 10 years
        for (let toAge = 10; toAge <= 90; toAge++) {
          const fromAge = toAge - 10;
          let ccr;
          if (useNationalCCRs) {
            ccr = nationalCCRs.get(`${eth}|${sex}|${fromAge}`) || 1.0;
          } else {
            ccr = ccrs.get(`${code}|${eth}|${sex}|${fromAge}`) || 1.0;
          }
          newPop[eth][sex][toAge] = Math.round((currentPop[eth][sex][fromAge] || 0) * ccr);
        }

        // 90+: add survivors from current 90+
        newPop[eth][sex][90] = (newPop[eth][sex][90] || 0) +
          Math.round((currentPop[eth][sex][90] || 0) * 0.3);

        // Births (ages 0-9): use CWR
        const cwr = useNationalCCRs
          ? (nationalCWRs.get(eth) || 0.03)
          : (cwrs.get(`${code}|${eth}`) || 0.03);
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

    // No SNPP constraint for backcast — SNPP starts at 2022, and using
    // Census 2021 totals would be circular. The backcast tests the
    // unconstrained HP model accuracy.

    // Summarize into simple groups
    let total = 0;
    const groupCounts = {};
    for (const g of SIMPLE_GROUPS) groupCounts[g] = 0;
    for (const eth of ETHNIC_GROUPS) {
      let ethTotal = 0;
      for (const sex of SEXES) for (const age of AGES) ethTotal += newPop[eth][sex][age] || 0;
      total += ethTotal;
      const sg = GROUP_MAP_SIMPLE[eth];
      if (sg) groupCounts[sg] += ethTotal;
    }

    const groupPcts = {};
    for (const g of SIMPLE_GROUPS) {
      groupPcts[g] = total > 0 ? r(groupCounts[g] / total * 100) : 0;
    }
    results.set(code, { total, groupCounts, groupPcts });
  }

  return results;
}

console.log("\nRunning HP backcast (local CCRs): 2011 → 2021...");
const localResults = runHPBackcast(false);

console.log("Running HP backcast (national CCRs): 2011 → 2021...");
const nationalResults = runHPBackcast(true);

// ============================================================
// 6. Compare to Census 2021 actuals
// ============================================================
console.log("\nComparing to Census 2021 actuals...");

const validation = {
  generatedAt: new Date().toISOString(),
  methodology: "Hamilton-Perry backcast: projected from Census 2011 base (NEWETHPOP, split from 12 to 20 groups using 2021 proportions) to 2021 using the same single-year CCR/CWR methodology as the forward model v6.0 (run_hp_single_year.mjs). 20 ethnic groups. No SNPP constraint (starts 2022). No DfE calibration (would be circular). Compared against Census 2021 actuals (direct observations from custom dataset). National-CCR baseline uses population-weighted average CCRs. NEWETHPOP comparison uses their own 2021 projection from their 2011 cohort-component model. NOTE: backcast is partially circular — CCRs derived from the same 2011→2021 endpoints being validated. The national-CCR baseline (which removes local information) is the better measure of genuine predictive ability.",
  models: {
    hp_local: "Hamilton-Perry with per-area CCRs (same as forward projection model)",
    hp_national: "Hamilton-Perry with national-average CCRs only (baseline)",
    newethpop: "NEWETHPOP cohort-component model (University of Leeds, Rees/Wohland et al.)"
  },
  summary: {},
  perGroupMetrics: {},
  areas: {},
  errorDistribution: {
    hp_local: [],
    hp_national: [],
    newethpop: []
  }
};

// Accumulators
const metrics = {
  hp_local: { absErr: 0, sqErr: 0, overPredict: 0, count: 0 },
  hp_national: { absErr: 0, sqErr: 0, overPredict: 0, count: 0 },
  newethpop: { absErr: 0, sqErr: 0, overPredict: 0, count: 0 }
};

// Per-group accumulators
const groupMetrics = {};
for (const g of SIMPLE_GROUPS) {
  groupMetrics[g] = {
    hp_local: { absErr: 0, sqErr: 0, count: 0 },
    hp_national: { absErr: 0, sqErr: 0, count: 0 }
  };
}

let compared = 0;

for (const [areaCode, censusArea] of Object.entries(census.areas)) {
  const actualGroups = censusArea.current?.groups;
  if (!actualGroups) continue;
  const actualWB = actualGroups.white_british;

  const localPred = localResults.get(areaCode);
  const nationalPred = nationalResults.get(areaCode);
  const newethpopPred = newethpop2021.get(areaCode);

  if (!localPred || !nationalPred || localPred.total < 100) continue;

  // HP local model
  const localWB = localPred.groupPcts.white_british;
  const localErr = localWB - actualWB;

  // HP national model
  const nationalWB = nationalPred.groupPcts.white_british;
  const nationalErr = nationalWB - actualWB;

  // NEWETHPOP
  let newethpopWB = null, newethpopErr = null;
  if (newethpopPred && newethpopPred.total > 100) {
    const nWBCount = newethpopPred.WBI || 0;
    newethpopWB = r(nWBCount / newethpopPred.total * 100);
    newethpopErr = r(newethpopWB - actualWB);

    metrics.newethpop.absErr += Math.abs(newethpopErr);
    metrics.newethpop.sqErr += newethpopErr * newethpopErr;
    if (newethpopErr > 0) metrics.newethpop.overPredict++;
    metrics.newethpop.count++;
    validation.errorDistribution.newethpop.push(newethpopErr);
  }

  metrics.hp_local.absErr += Math.abs(localErr);
  metrics.hp_local.sqErr += localErr * localErr;
  if (localErr > 0) metrics.hp_local.overPredict++;
  metrics.hp_local.count++;
  validation.errorDistribution.hp_local.push(r(localErr));

  metrics.hp_national.absErr += Math.abs(nationalErr);
  metrics.hp_national.sqErr += nationalErr * nationalErr;
  if (nationalErr > 0) metrics.hp_national.overPredict++;
  metrics.hp_national.count++;
  validation.errorDistribution.hp_national.push(r(nationalErr));

  // Per-group errors
  for (const g of SIMPLE_GROUPS) {
    const actual = actualGroups[g];
    if (actual == null) continue;
    const lErr = localPred.groupPcts[g] - actual;
    const nErr = nationalPred.groupPcts[g] - actual;
    groupMetrics[g].hp_local.absErr += Math.abs(lErr);
    groupMetrics[g].hp_local.sqErr += lErr * lErr;
    groupMetrics[g].hp_local.count++;
    groupMetrics[g].hp_national.absErr += Math.abs(nErr);
    groupMetrics[g].hp_national.sqErr += nErr * nErr;
    groupMetrics[g].hp_national.count++;
  }

  compared++;

  validation.areas[areaCode] = {
    areaName: censusArea.areaName,
    actualWB: r(actualWB),
    hp_local: { predictedWB: localWB, error: r(localErr) },
    hp_national: { predictedWB: nationalWB, error: r(nationalErr) },
    ...(newethpopWB != null ? { newethpop: { predictedWB: newethpopWB, error: newethpopErr } } : {}),
    bestModel: Math.abs(localErr) <= Math.abs(nationalErr) ? "hp_local" : "hp_national"
  };
}

// Compute summary metrics
function computeSummary(m) {
  if (m.count === 0) return { mae: 0, rmse: 0, count: 0 };
  return {
    mae: r(m.absErr / m.count),
    rmse: r(Math.sqrt(m.sqErr / m.count)),
    overPredictWBCount: m.overPredict,
    underPredictWBCount: m.count - m.overPredict,
    count: m.count
  };
}

validation.summary = {
  areasCompared: compared,
  hp_local: computeSummary(metrics.hp_local),
  hp_national: computeSummary(metrics.hp_national),
  newethpop: computeSummary(metrics.newethpop),
  localBetterCount: Object.values(validation.areas).filter(a => a.bestModel === "hp_local").length,
  nationalBetterCount: Object.values(validation.areas).filter(a => a.bestModel === "hp_national").length
};

// Per-group summary
for (const g of SIMPLE_GROUPS) {
  const gm = groupMetrics[g];
  validation.perGroupMetrics = validation.perGroupMetrics || {};
  validation.perGroupMetrics[g] = {
    hp_local: {
      mae: gm.hp_local.count > 0 ? r(gm.hp_local.absErr / gm.hp_local.count) : 0,
      rmse: gm.hp_local.count > 0 ? r(Math.sqrt(gm.hp_local.sqErr / gm.hp_local.count)) : 0
    },
    hp_national: {
      mae: gm.hp_national.count > 0 ? r(gm.hp_national.absErr / gm.hp_national.count) : 0,
      rmse: gm.hp_national.count > 0 ? r(Math.sqrt(gm.hp_national.sqErr / gm.hp_national.count)) : 0
    }
  };
}

// Confidence intervals from HP local error distribution
const sortedErrors = [...validation.errorDistribution.hp_local].sort((a, b) => a - b);
const n = sortedErrors.length;
validation.confidenceIntervals = {
  description: "Empirical WBI error distribution from HP 2011→2021 backcast. Apply to forward projections as ±uncertainty.",
  p2_5: sortedErrors[Math.floor(n * 0.025)],
  p5: sortedErrors[Math.floor(n * 0.05)],
  p25: sortedErrors[Math.floor(n * 0.25)],
  median: sortedErrors[Math.floor(n * 0.50)],
  p75: sortedErrors[Math.floor(n * 0.75)],
  p95: sortedErrors[Math.floor(n * 0.95)],
  p97_5: sortedErrors[Math.floor(n * 0.975)]
};

// Sigma recommendation for stochastic model
const hpMAE = validation.summary.hp_local.mae;
const sigmaRecommendation = r(hpMAE / 100); // Convert pp to proportion
validation.sigmaRecommendation = {
  value: sigmaRecommendation,
  description: `CCR_SIGMA_BASE should be ${sigmaRecommendation} (MAE ${hpMAE}pp / 100). v6.0 current: 0.02 (from HP backcast MAE 2.45pp).`
};

// ============================================================
// 7. Output
// ============================================================
console.log("\n=== HP BACKCAST VALIDATION RESULTS ===");
console.log(`Areas compared: ${compared}`);
console.log(`\nHP Local CCRs:    MAE=${validation.summary.hp_local.mae}pp  RMSE=${validation.summary.hp_local.rmse}pp`);
console.log(`HP National CCRs: MAE=${validation.summary.hp_national.mae}pp  RMSE=${validation.summary.hp_national.rmse}pp`);
if (validation.summary.newethpop.count > 0) {
  console.log(`NEWETHPOP:        MAE=${validation.summary.newethpop.mae}pp  RMSE=${validation.summary.newethpop.rmse}pp`);
}
console.log(`\nLocal CCRs better in ${validation.summary.localBetterCount}/${compared} areas`);

console.log("\nPer-group MAE (local / national):");
for (const g of SIMPLE_GROUPS) {
  const pgm = validation.perGroupMetrics[g];
  console.log(`  ${g.padEnd(16)} ${pgm.hp_local.mae}pp / ${pgm.hp_national.mae}pp`);
}

console.log(`\n90% CI: [${validation.confidenceIntervals.p5}pp, +${validation.confidenceIntervals.p95}pp]`);
console.log(`95% CI: [${validation.confidenceIntervals.p2_5}pp, +${validation.confidenceIntervals.p97_5}pp]`);
console.log(`Median error: ${validation.confidenceIntervals.median}pp`);

console.log(`\nSigma recommendation: CCR_SIGMA_BASE = ${sigmaRecommendation} (v6.0 current: 0.02)`);

// Top improvements / worst areas
const areaList = Object.entries(validation.areas)
  .map(([code, a]) => ({ code, ...a }));
const worstLocal = areaList.sort((a, b) => Math.abs(b.hp_local.error) - Math.abs(a.hp_local.error)).slice(0, 5);
console.log("\nTop 5 worst areas (local CCRs):");
for (const a of worstLocal) {
  console.log(`  ${a.areaName}: error ${a.hp_local.error > 0 ? "+" : ""}${a.hp_local.error}pp (actual WB ${a.actualWB}%)`);
}

const localWins = areaList
  .filter(a => a.newethpop)
  .map(a => ({ ...a, improvement: Math.abs(a.newethpop.error) - Math.abs(a.hp_local.error) }))
  .sort((a, b) => b.improvement - a.improvement);
if (localWins.length > 0) {
  console.log("\nTop 5 improvements over NEWETHPOP:");
  for (const a of localWins.slice(0, 5)) {
    console.log(`  ${a.areaName}: HP ${a.hp_local.error > 0 ? "+" : ""}${a.hp_local.error}pp vs NEWETHPOP ${a.newethpop.error > 0 ? "+" : ""}${a.newethpop.error}pp`);
  }
}

writeFileSync(OUTPUT_PATH, JSON.stringify(validation, null, 2), "utf8");
console.log(`\nWritten ${OUTPUT_PATH}`);
