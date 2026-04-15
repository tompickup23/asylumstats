# Research: MODEL: Add international migration component (LTIM by nationality → ethnicity)

Generated: 2026-04-15
Project: asylum_stats

### **Research Brief: Adding International Migration Component (LTIM by Nationality → Ethnicity)**
**Priority: H | Project: Asylum Stats**

---

#### **Key Findings**
1. **Current Gaps**:
   - The project lacks a **nationality-to-ethnicity migration breakdown** (e.g., LTIM data) to contextualize asylum routes.
   - No existing pipeline for integrating **Office for National Statistics (ONS) Long-Term International Migration (LTIM)** data by nationality/ethnicity.
   - The `data-sources.md` (`docs/research/data-sources.md`) lists ONS as a source but lacks a structured ingestion plan.

2. **Relevant Data Sources**:
   - **LTIM by Nationality/Ethnicity**:
     - ONS LTIM tables: [https://www.ons.gov.uk/releases/longterminternationalmigrationestimates](https://www.ons.gov.uk/releases/longterminternationalmigrationestimates)
     - Breakdowns by citizenship/ethnicity (e.g., "Non-EU citizens by ethnicity").
   - **Home Office Asylum Data**:
     - Already integrated (see `uk_routes` marts), but lacks migration context.

3. **Technical Fit**:
   - The existing architecture (`data/canonical/`, `scripts/transform/`) supports adding new canonical datasets.
   - The `money-ledger` and `uk_routes` pipelines can be mirrored for LTIM.

---

#### **Next Steps**
1. **Define the LTIM Schema**:
   - Create a new canonical dataset:
     ```bash
     mkdir -p data/canonical/ltim_nationality_ethnicity
     touch data/canonical/ltim_nationality_ethnicity/schema.json
     ```
   - Schema example (based on ONS LTIM):
     ```json
     {
       "year": "2024",
       "nationality": "Indian",
       "ethnicity": "Asian/Asian British",
       "inflow": 50000,
       "outflow": 20000,
       "net_migration": 30000
     }
     ```

2. **Ingest ONS LTIM Data**:
   - Download the latest LTIM CSV from ONS:
     ```bash
     curl -o data/raw/ltim_nationality_ethnicity.csv "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/internationalmigration/datasets/longterminternationalmigrationestimates/latest/ltim_by_citizenship_ethnicity.csv"
     ```
   - Transform to canonical NDJSON:
     ```bash
     touch scripts/transform/transform-ltim.mjs
     ```
     Example transform script:
     ```javascript
     import { readFileSync, writeFileSync } from 'fs';
     import csv from 'csv-parser';

     const inputPath = 'data/raw/ltim_nationality_ethnicity.csv';
     const outputPath = 'data/canonical/ltim_nationality_ethnicity/';

     // Process CSV → NDJSON
     const results = [];
     readFileSync(inputPath)
       .pipe(csv())
       .on('data', (row) => results.push(row))
       .on('end', () => {
         writeFileSync(
           `${outputPath}/2024.ndjson`,
           results.map(r => JSON.stringify(r)).join('\n')
         );
       });
     ```

3. **Integrate into Marts**:
   - Add a new LTIM mart:
     ```bash
     touch scripts/transform/transform-ltim-to-mart.mjs
     ```
   - Output to `src/data/live/ltim-nationality-ethnicity.json` for Astro consumption.

4. **Update Product Scope**:
   - Add LTIM context to:
     - `/routes` (e.g., "Asylum routes by nationality").
     - `/compare` (e.g., "Migration trends vs. asylum grants").
   - Update `docs/product/asylum-data-scope.md` to include LTIM as "context-only" data.

---

#### **Resources**
- **ONS LTIM Data**:
  - [LTIM by Citizenship/Ethnicity](https://www.ons.gov.uk/releases/longterminternationalmigrationestimates)
- **Existing Pipelines**:
  - `scripts/transform/transform-routes.mjs` (mirror for LTIM).
  - `src/data/live/route-dashboard.json` (add LTIM context).
- **Tools**:
  - `csv-parser` (for NDJSON conversion).
  - Astro `src/components/TrendChart.astro` (visualize LTIM trends).

---
#### **Risks/Blockers**
1. **Data Lag**:
   - ONS LTIM is released quarterly; ensure the pipeline auto-updates.
2. **Schema Drift**:
   - ONS may change column names; add validation in `transform-ltim.mjs`.
3. **Performance**:
   - LTIM data is large; test NDJSON parsing in `src/lib/area-series.ts`.

---
**Action**: Start with Step 1 (schema definition) and validate with ONS data.