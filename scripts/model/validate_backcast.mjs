/**
 * Phase 6: Backcast Validation
 *
 * 1. Parse NEWETHPOP 2011 base population (Population2011_LEEDS2.csv)
 * 2. Run our cohort-component model forward 10 years (2 × 5-year steps)
 * 3. Compare our 2021 prediction to Census 2021 actuals
 * 4. Compare against NEWETHPOP's own 2021 prediction
 * 5. Generate error distribution for confidence intervals on forward projections
 *
 * Output: src/data/live/model-validation.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const NEWETHPOP_2011 = path.resolve("data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2011_LEEDS2.csv");
const NEWETHPOP_2021 = path.resolve("data/raw/newethpop/extracted/2DataArchive/OutputData/Population/Population2021_LEEDS2.csv");
const CENSUS_PATH = path.resolve("src/data/live/ethnic-projections.json");
const COMPONENTS_PATH = path.resolve("data/model/components.json");
const VALIDATION_PATH = path.resolve("src/data/live/newethpop-validation.json");
const OUTPUT_PATH = path.resolve("src/data/live/model-validation.json");

const census = JSON.parse(readFileSync(CENSUS_PATH, "utf8"));
const components = JSON.parse(readFileSync(COMPONENTS_PATH, "utf8"));
const existingValidation = JSON.parse(readFileSync(VALIDATION_PATH, "utf8"));

const GROUP_MAP = {
  WBI: "white_british", WIR: "white_other", WHO: "white_other",
  MIX: "mixed", IND: "asian", PAK: "asian", BAN: "asian",
  CHI: "asian", OAS: "asian", BCA: "black", BAF: "black", OTH: "other"
};
const ETHNIC_GROUPS = ["WBI", "WIR", "WHO", "MIX", "IND", "PAK", "BAN", "CHI", "OAS", "BCA", "BAF", "OTH"];
const AGE_BANDS = [
  "0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34",
  "35-39", "40-44", "45-49", "50-54", "55-59", "60-64",
  "65-69", "70-74", "75-79", "80-84", "85+"
];

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; }
    else current += ch;
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse NEWETHPOP CSV into simplified structure: { areaCode → { ethGroup → totalPop } }
 */
function parseNewethpopToSimplified(filePath) {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split("\n").filter(l => l.trim());
  const areas = new Map();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const rawCode = cols[2]; // LAD.code
    const ethGroup = cols[3]; // ETH.group
    if (!rawCode || !ETHNIC_GROUPS.includes(ethGroup)) continue;

    let totalPop = 0;
    for (let j = 4; j < cols.length; j++) {
      const val = parseFloat(cols[j]);
      if (!isNaN(val)) totalPop += val;
    }

    const areaCodes = rawCode.split("+");
    const popPerCode = totalPop / areaCodes.length;

    for (const code of areaCodes) {
      if (!areas.has(code)) areas.set(code, { total: 0 });
      const area = areas.get(code);
      area[ethGroup] = (area[ethGroup] || 0) + popPerCode;
      area.total += popPerCode;
    }
  }
  return areas;
}

/**
 * Run simplified cohort-component forward from 2011 base for 10 years (2 steps of 5).
 */
function runBackcast(base2011) {
  const result = new Map();

  for (const [areaCode, areaPop] of base2011) {
    let pop = { ...areaPop };

    for (const step of [2016, 2021]) {
      const newPop = { total: 0 };

      for (const eth of ETHNIC_GROUPS) {
        const currentPop = pop[eth] || 0;

        // Survival (use an average rate for the whole population — simplified)
        const avgSurvival = components.mortality[eth]
          ? Object.values(components.mortality[eth]).reduce((a, b) => a + b, 0) / Object.keys(components.mortality[eth]).length
          : 0.95;
        let survived = currentPop * avgSurvival;

        // Fertility contribution (simplified — estimate births)
        const tfr = components.fertility.constant?.[2025]?.[eth] ?? 1.6;
        // Assume ~25% of population is female 15-49
        const fertileWomen = currentPop * 0.5 * 0.25;
        const birthsPerYear = fertileWomen * tfr / 30; // TFR spread over ~30 fertile years
        const births5yr = birthsPerYear * 5;
        survived += births5yr;

        // Internal migration
        const intRate = components.migration.internalMigrationRates[eth] ?? 0;
        survived += survived * intRate * 5;

        // International migration (use principal scenario, proportional to area share)
        const totalAreas = base2011.size;
        const intlPerArea = 315000 / totalAreas;
        const ethShare = components.migration.internationalEthnicComposition[eth] ?? 0;
        survived += intlPerArea * ethShare * 5;

        newPop[eth] = Math.max(0, Math.round(survived));
        newPop.total += newPop[eth];
      }

      pop = newPop;
    }

    result.set(areaCode, pop);
  }

  return result;
}

// Parse data
console.log("Parsing NEWETHPOP 2011 base...");
const base2011 = parseNewethpopToSimplified(NEWETHPOP_2011);
console.log(`  ${base2011.size} areas`);

console.log("Parsing NEWETHPOP 2021 prediction...");
const newethpop2021 = parseNewethpopToSimplified(NEWETHPOP_2021);
console.log(`  ${newethpop2021.size} areas`);

// Run backcast
console.log("\nRunning backcast: 2011 → 2021...");
const ourPrediction2021 = runBackcast(base2011);
console.log(`  ${ourPrediction2021.size} areas projected`);

// Compare all three: our prediction, NEWETHPOP prediction, Census 2021 actuals
console.log("\nComparing predictions to Census 2021 actuals...");

const validation = {
  generatedAt: new Date().toISOString(),
  methodology: "Backcast validation: ran cohort-component model from Census 2011 base to predict 2021, then compared to Census 2021 actuals. Also compared NEWETHPOP's own 2021 prediction.",
  summary: {},
  areas: {},
  errorDistribution: {
    ourModel: [],
    newethpop: []
  }
};

let ourTotalAbsError = 0;
let newethpopTotalAbsError = 0;
let ourTotalSqError = 0;
let newethpopTotalSqError = 0;
let ourOverPredict = 0;
let compared = 0;

for (const [areaCode, censusArea] of Object.entries(census.areas)) {
  const actualWB = censusArea.current.groups.white_british;
  const ourPred = ourPrediction2021.get(areaCode);
  const newethpopPred = newethpop2021.get(areaCode);

  if (!ourPred || !newethpopPred || ourPred.total < 100 || newethpopPred.total < 100) continue;

  // Our model: compute WB%
  const ourWBCount = (ourPred.WBI || 0);
  const ourWB = (ourWBCount / ourPred.total) * 100;
  const ourError = ourWB - actualWB;

  // NEWETHPOP: compute WB%
  const newethpopWBCount = (newethpopPred.WBI || 0);
  const newethpopWB = (newethpopWBCount / newethpopPred.total) * 100;
  const newethpopError = newethpopWB - actualWB;

  ourTotalAbsError += Math.abs(ourError);
  newethpopTotalAbsError += Math.abs(newethpopError);
  ourTotalSqError += ourError * ourError;
  newethpopTotalSqError += newethpopError * newethpopError;
  if (ourError > 0) ourOverPredict++;
  compared++;

  validation.areas[areaCode] = {
    areaName: censusArea.areaName,
    actualWB: r(actualWB),
    ourPredictedWB: r(ourWB),
    ourError: r(ourError),
    newethpopPredictedWB: r(newethpopWB),
    newethpopError: r(newethpopError),
    ourBetter: Math.abs(ourError) < Math.abs(newethpopError)
  };

  validation.errorDistribution.ourModel.push(r(ourError));
  validation.errorDistribution.newethpop.push(r(newethpopError));
}

function r(n) { return Math.round(n * 100) / 100; }

const ourMAE = r(ourTotalAbsError / compared);
const newethpopMAE = r(newethpopTotalAbsError / compared);
const ourRMSE = r(Math.sqrt(ourTotalSqError / compared));
const newethpopRMSE = r(Math.sqrt(newethpopTotalSqError / compared));
const ourBetterCount = Object.values(validation.areas).filter(a => a.ourBetter).length;

validation.summary = {
  areasCompared: compared,
  ourModel: {
    mae: ourMAE,
    rmse: ourRMSE,
    overPredictWBCount: ourOverPredict,
    underPredictWBCount: compared - ourOverPredict
  },
  newethpop: {
    mae: newethpopMAE,
    rmse: newethpopRMSE
  },
  comparison: {
    ourModelBetterInAreas: ourBetterCount,
    newethpopBetterInAreas: compared - ourBetterCount,
    maeImprovement: r(newethpopMAE - ourMAE),
    verdict: ourMAE < newethpopMAE
      ? `Our model (MAE ${ourMAE}pp) outperforms NEWETHPOP (MAE ${newethpopMAE}pp) by ${r(newethpopMAE - ourMAE)}pp`
      : `NEWETHPOP (MAE ${newethpopMAE}pp) outperforms our model (MAE ${ourMAE}pp) by ${r(ourMAE - newethpopMAE)}pp`
  }
};

// Generate confidence intervals from error distribution
const sortedErrors = [...validation.errorDistribution.ourModel].sort((a, b) => a - b);
const p5 = sortedErrors[Math.floor(compared * 0.05)];
const p25 = sortedErrors[Math.floor(compared * 0.25)];
const p50 = sortedErrors[Math.floor(compared * 0.50)];
const p75 = sortedErrors[Math.floor(compared * 0.75)];
const p95 = sortedErrors[Math.floor(compared * 0.95)];

validation.confidenceIntervals = {
  description: "Empirical error distribution from 2011→2021 backcast. Apply to forward projections as ±uncertainty.",
  p5, p25, median: p50, p75, p95,
  interpretation: `For a forward projection of WB%, the 90% confidence interval is approximately [projection ${p5}pp, projection +${p95}pp]`
};

console.log("\n=== BACKCAST VALIDATION RESULTS ===");
console.log(`Areas compared: ${compared}`);
console.log(`\nOur model:     MAE=${ourMAE}pp  RMSE=${ourRMSE}pp`);
console.log(`NEWETHPOP:     MAE=${newethpopMAE}pp  RMSE=${newethpopRMSE}pp`);
console.log(`\n${validation.summary.comparison.verdict}`);
console.log(`Our model better in ${ourBetterCount}/${compared} areas`);
console.log(`\n90% confidence interval: [${p5}pp, +${p95}pp]`);
console.log(`Median error: ${p50}pp`);

// Top 5 areas where our model beats NEWETHPOP most
const improvements = Object.entries(validation.areas)
  .map(([code, a]) => ({ code, ...a, improvement: Math.abs(a.newethpopError) - Math.abs(a.ourError) }))
  .sort((a, b) => b.improvement - a.improvement);

console.log("\nTop 5 areas where our model improves most over NEWETHPOP:");
for (const a of improvements.slice(0, 5)) {
  console.log(`  ${a.areaName}: our error ${a.ourError > 0 ? "+" : ""}${a.ourError}pp vs NEWETHPOP ${a.newethpopError > 0 ? "+" : ""}${a.newethpopError}pp (improvement: ${r(a.improvement)}pp)`);
}

writeFileSync(OUTPUT_PATH, JSON.stringify(validation, null, 2), "utf8");
console.log(`\nWritten ${OUTPUT_PATH}`);
