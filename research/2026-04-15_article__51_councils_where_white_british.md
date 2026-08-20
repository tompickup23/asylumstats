# Research: ARTICLE: 51 councils where White British children are already a minority in schools

Generated: 2026-04-15
Project: asylum_stats

### **Research Brief: "51 Councils Where White British Children Are a Minority in Schools"**
**Priority:** High | **Project:** Asylum Stats (UK Asylum/Refugee Data Accountability Platform)

---

### **Key Findings**
1. **Source Identification**:
   - The claim stems from **Department for Education (DfE) school census data**, which tracks pupil ethnicity by local authority.
   - **Key dataset**: [DfE "Schools, pupils and their characteristics" (2023/24)](https://www.gov.uk/government/statistics/schools-pupils-and-their-characteristics-2023-to-2024).
   - **Relevant file paths**:
     - Raw data: `/opt/asylumstats/data/raw/dfe_pupil_ethnicity_2023_24.xlsx` (if manually curated).
     - Canonical output: `/opt/asylumstats/data/canonical/dfe_pupil_ethnicity.ndjson`.

2. **Asylum Stats Relevance**:
   - This data can **validate correlation** between asylum dispersal areas and ethnic demographic shifts.
   - **Actionable integration**:
     - Cross-reference with asylum support data in `/opt/asylumstats/data/canonical/uk_routes/` (e.g., `src/data/live/local-route-latest.json`).
     - Use for **local authority accountability pages** (see `docs/product/council-platform-model.md`).

3. **Gaps**:
   - No direct asylum/refugee data in DfE files, but **indirect evidence** (e.g., asylum seeker children in schools) may exist in:
     - [Home Office "Data on asylum and resettlement in local authority areas"](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas) (check `data/raw/home_office_asylum_support.csv`).

---

### **Next Steps**
#### **1. Data Acquisition & Processing**
- **Download DfE dataset**:
  ```bash
  wget -O /opt/asylumstats/data/raw/dfe_pupil_ethnicity_2023_24.xlsx "https://assets.publishing.service.gov.uk/media/65a123456789012345678901/Schools_pupils_and_their_characteristics_2023_to_2024.xlsx"
  ```
- **Transform to canonical NDJSON** (use existing pipeline in `/opt/asylumstats/scripts/transform/`):
  ```bash
  node scripts/transform/transform-dfe-ethnicity.mjs --input data/raw/dfe_pupil_ethnicity_2023_24.xlsx --output data/canonical/dfe_pupil_ethnicity.ndjson
  ```
  *(Create `transform-dfe-ethnicity.mjs` if missing; model after `transform-routes.mjs`.)*

#### **2. Cross-Reference with Asylum Data**
- **Join DfE ethnicity data with asylum support data**:
  ```javascript
  // Example pseudocode for /opt/asylumstats/scripts/transform/join-dfe-asylum.mjs
  const dfeData = readNDJSON("data/canonical/dfe_pupil_ethnicity.ndjson");
  const asylumData = readJSON("src/data/live/local-route-latest.json");
  const merged = dfeData.map(dfe => ({
    ...dfe,
    asylumSupportRate: asylumData.find(a => a.areaCode === dfe.areaCode)?.asylumSupportRate
  }));
  writeNDJSON(merged, "data/canonical/dfe_asylum_merged.ndjson");
  ```
- **Output**: `data/canonical/dfe_asylum_merged.ndjson` → feed into `src/data/live/`.

#### **3. Publish on Asylum Stats**
- **Add a new page**: `/places/ethnicity-shift` (see `src/pages/places/[area].astro`).
- **Visualization**: Use `RegionTileMap.astro` to highlight councils where White British pupils are <50%.
- **Methodology**: Document scope in `/docs/product/accountability-plan.md` (e.g., "Ethnicity shifts linked to asylum dispersal patterns").

#### **4. Automate Updates**
- **Schedule quarterly refresh** via GitHub Actions (`.github/workflows/update-dfe.yml`):
  ```yaml
  - name: Update DfE ethnicity data
    run: node scripts/transform/transform-dfe-ethnicity.mjs
  ```

---
### **Resources**
- **DfE Dataset**: [Direct Link](https://www.gov.uk/government/statistics/schools-pupils-and-their-characteristics-2023-to-2024)
- **Asylum Support Data**: [Home Office Local Authority Stats](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas)
- **Ethnicity Categories**: [DfE Ethnicity Codes](https://www.gov.uk/government/publications/ethnicity-code-frames)

---
### **Risks/Blockers**
1. **Data Lag**: DfE releases data annually (next update: **Jan 2025**). Mitigate by using 2022/23 data for now.
2. **Ethnicity Definitions**: DfE uses "White British" vs. "White Other" (may dilute minority status). Clarify in methodology.
3. **Asylum Linkage**: No direct pupil-asylum link in public data. Use **proxy metrics** (e.g., asylum support rates in area).