/**
 * Extract empirical ethnic fertility rates from ONS Linked Births 2024.
 *
 * The current HP model uses Child-Woman Ratios (CWRs) from Census 2021:
 *   CWR = Children(0-9) / Women(15-44) per LA per ethnic group
 *
 * ONS Linked Births provides actual birth counts by ethnicity × region.
 * This script:
 * 1. Extracts ethnic birth counts from Table 5 (by region)
 * 2. Computes empirical TFRs using Census 2021 female population denominators
 * 3. Compares ONS empirical rates with Census-derived CWRs
 * 4. Outputs a fertility rates file for future model calibration
 *
 * NOTE: ONS births data is England+Wales, regional level only (not LA).
 * For LA-level, we'd need to proportionally distribute using Census ethnic composition.
 *
 * Output: src/data/live/fertility-rates.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const BIRTHS_2024 = path.resolve("data/raw/ons_births/2024birthslinked.xlsx");
const BIRTHS_2023 = path.resolve("data/raw/ons_births/2023linkedbirths.xlsx");
const BASE_POP = path.resolve("data/model/base_single_year_2021.json");
const OUTPUT = path.resolve("src/data/live/fertility-rates.json");

// Map ONS birth ethnicity labels to our 6-group model
const BIRTH_ETH_MAP = {
  "Bangladeshi": "asian",
  "Indian": "asian",
  "Pakistani": "asian",
  "Any other Asian background": "asian",
  "Black African": "black",
  "Black Caribbean": "black",
  "Any other Black background": "black",
  "Mixed/multiple": "mixed",
  "Any other ethnic group": "other",
  "White British": "white_british",
  "Any other White background": "white_other",
  "Not stated": null
};

// Also map to 20-group where possible
const BIRTH_ETH_MAP_20 = {
  "Bangladeshi": "BAN",
  "Indian": "IND",
  "Pakistani": "PAK",
  "Any other Asian background": "OAS",
  "Black African": "BAF",
  "Black Caribbean": "BCA",
  "Any other Black background": "OBL",
  "White British": "WBI"
};

console.log("Reading ONS Linked Births 2024...");
const wb2024 = xlsx.readFile(BIRTHS_2024);
console.log("  Sheets:", wb2024.SheetNames.join(", "));

// Read Table_5: births by area and ethnicity (note underscore in sheet name)
const sheetName = wb2024.SheetNames.find(s => s.includes("Table") && s.includes("5")) || "Table_5";
const table5 = xlsx.utils.sheet_to_json(wb2024.Sheets[sheetName], { header: 1, raw: false, defval: "" });
console.log(`  Reading sheet: ${sheetName}, ${table5.length} rows`);

// Parse birth counts by ethnicity (England level)
// Format: [Area Code, Area Name, Geography, Ethnicity, Live births, Stillbirths, Rate, ...]
const birthsByEthnicity = {};

for (let i = 0; i < table5.length; i++) {
  const row = table5[i];
  if (!row) continue;
  const code = String(row[0] || "").trim();
  if (code !== "E92000001") continue; // England only
  const ethnicity = String(row[3] || "").trim();
  if (ethnicity === "All ethnic groups" || !ethnicity) continue;
  const births = parseInt(String(row[4]).replace(/,/g, "")) || 0;
  if (births > 0 && BIRTH_ETH_MAP.hasOwnProperty(ethnicity)) {
    birthsByEthnicity[ethnicity] = births;
  }
}

console.log(`\nEngland-level births by ethnicity:`);
let totalBirths = 0;
for (const [eth, births] of Object.entries(birthsByEthnicity)) {
  console.log(`  ${eth}: ${births.toLocaleString()}`);
  totalBirths += births;
}
console.log(`  Total: ${totalBirths.toLocaleString()}`);

// If Table 5 parsing didn't work well, try reading raw structure
if (totalBirths === 0) {
  console.log("\n  Table 5 parsing failed. Trying alternative format...");
  for (let i = 0; i < Math.min(25, table5.length); i++) {
    console.log(`  Row ${i}: ${JSON.stringify(table5[i]?.slice(0, 8))}`);
  }
}

// Load Census 2021 female population by ethnic group (for TFR denominators)
console.log("\nLoading Census 2021 female population for TFR computation...");
const basePop = JSON.parse(readFileSync(BASE_POP, "utf8"));

// Compute national female population ages 15-44 by ethnic group
const femalePop = {};
const childPop = {};
for (const [code, area] of Object.entries(basePop.areas)) {
  for (const eth of basePop.ethnicGroups) {
    const femData = area[eth]?.F;
    if (!femData) continue;

    if (!femalePop[eth]) femalePop[eth] = 0;
    if (!childPop[eth]) childPop[eth] = 0;

    for (let age = 15; age <= 44; age++) {
      femalePop[eth] += femData[age] || 0;
    }
    for (let age = 0; age <= 4; age++) {
      childPop[eth] += (area[eth]?.M?.[age] || 0) + (femData[age] || 0);
    }
  }
}

// Compute CWRs from Census 2021 (what the model uses)
console.log("\nCensus 2021 CWRs (model basis):");
const censusCWR = {};
for (const eth of basePop.ethnicGroups) {
  const women = femalePop[eth] || 0;
  const children = childPop[eth] || 0;
  censusCWR[eth] = women > 0 ? Math.round(children / women * 10000) / 10000 : 0;
  if (censusCWR[eth] > 0) {
    // Approximate TFR from CWR: TFR ≈ CWR × 30 / 5 (30 years of exposure, 5-year age band of children)
    const approxTFR = Math.round(censusCWR[eth] * 30 / 5 * 100) / 100;
    console.log(`  ${eth}: CWR=${censusCWR[eth]} (approx TFR ≈ ${approxTFR})`);
  }
}

// Compute empirical TFRs from ONS births + Census female pop
if (totalBirths > 0) {
  console.log("\nEmpirical TFRs from ONS 2024 births:");
  const empiricalTFR = {};
  for (const [onsEth, births] of Object.entries(birthsByEthnicity)) {
    const modelEth = BIRTH_ETH_MAP_20[onsEth];
    if (!modelEth || !femalePop[modelEth]) continue;

    // Simple TFR approximation: births / women(15-44) × 30
    // This is crude but gives the right order of magnitude
    const women = femalePop[modelEth];
    const tfr = Math.round(births / women * 30 * 100) / 100;
    empiricalTFR[modelEth] = { births, women: Math.round(women), tfr };
    console.log(`  ${onsEth} (${modelEth}): ${births.toLocaleString()} births / ${Math.round(women).toLocaleString()} women = TFR ${tfr}`);
  }
}

// Build output
const output = {
  generatedAt: new Date().toISOString(),
  source: "ONS Births Linked 2024 + Census 2021 custom dataset",
  methodology: "Census-derived CWRs computed as Children(0-4) / Women(15-44) per ethnic group per LA. The HP model uses these directly — no hardcoded TFRs. ONS Linked Births 2024 provides independent validation of ethnic fertility differentials. Approximate TFR from CWR: TFR ≈ CWR × 6 (5-year-cohort children / 30-year childbearing window).",
  censusCWR,
  note: "The v6.0 HP model does NOT use hardcoded TFRs. It computes CWRs directly from Census 2021 per LA per ethnic group. The older scripts (build_components.mjs, run_projection.mjs) used hardcoded TFRs from Coleman & Dubuc (2010) and Rees et al. (2012). ONS 2024 births data is available for future model improvements: age-specific fertility rates by ethnicity × IMD deprivation decile × region."
};

if (totalBirths > 0) {
  output.onsBirths2024 = birthsByEthnicity;
  output.totalBirths2024 = totalBirths;
}

writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8");
console.log(`\nWritten ${OUTPUT}`);
