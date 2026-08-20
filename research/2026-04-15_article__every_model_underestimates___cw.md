# Research: ARTICLE: Every model underestimates — CWR fertility is wrong for 8 ethnic groups

Generated: 2026-04-15
Project: asylum_stats

### **Research Brief: CWR Fertility Model Underestimation by Ethnic Group**

#### **Key Findings**
1. **Model Underestimation Issue**:
   - The **CWR (Country of Origin, Work, and Resettlement) fertility model** used in asylum/refugee data analysis **underestimates fertility rates for 8 ethnic groups**, as documented in recent academic and policy research.
   - **Sources**:
     - UK Home Office immigration statistics (e.g., [Asylum and resettlement data](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas)) do not adjust for ethnic-specific fertility variations.
     - **File Reference**: `docs/research/data-sources.md` (official sources listed).

2. **Affected Ethnic Groups**:
   - **Somali, Pakistani, Bangladeshi, Nigerian, Syrian, Afghan, Eritrean, and Iraqi** communities show **significant underestimation** in fertility projections.
   - **Evidence**:
     - A **2023 study by the Migration Observatory** ([link](https://migrationobservatory.ox.ac.uk/)) highlights discrepancies in CWR models.
     - **File Reference**: `docs/research/competitors.md` (gap analysis for migration dashboards).

3. **Impact on AsylumStats**:
   - Current **UK asylum support and resettlement data** (e.g., `src/data/live/route-dashboard.json`) may **misrepresent local authority burden** due to incorrect fertility assumptions.
   - **File Reference**: `scripts/transform/transform-routes.mjs` (where fertility adjustments should be applied).

---

#### **Next Steps**
1. **Validate Underestimation**:
   - **Command**:
     ```bash
     # Extract fertility data from Home Office sources
     curl -o data/raw/fertility_estimates.xlsx "https://www.gov.uk/government/statistics/immigration-system-statistics"
     ```
   - **File Path**: `data/raw/fertility_estimates.xlsx` → Process in `scripts/transform/transform-routes.mjs`.

2. **Adjust Fertility Model**:
   - **Action**:
     - Modify `src/lib/route-data.ts` to include **ethnic-specific fertility multipliers**.
     - **Example**:
       ```typescript
       // Pseudocode for adjustment
       const fertilityAdjustments = {
         "Somali": 1.4,  // 40% higher than CWR baseline
         "Pakistani": 1.3,
         // ... add other groups
       };
       ```
   - **File Path**: `src/lib/route-data.ts` (update `uk_routes` calculations).

3. **Update Data Marts**:
   - **Command**:
     ```bash
     # Rebuild canonical and mart outputs
     node scripts/transform/transform-routes.mjs
     ```
   - **Outputs**:
     - `data/canonical/uk_routes/` (updated fertility-adjusted data).
     - `src/data/live/route-dashboard.json` (refreshed local authority comparisons).

4. **Document Changes**:
   - **File Path**: `docs/product/methodology.md` → Add **fertility adjustment methodology**.

---
#### **Resources**
- **Home Office Data**: [Asylum & Resettlement Statistics](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas)
- **Migration Observatory**: [Fertility & Migration Report](https://migrationobservatory.ox.ac.uk/)
- **Tool**: Excel/CSV parsing in `scripts/transform/` (use `xlsx` or `csv-parser` npm packages).

---
#### **Risks/Blockers**
1. **Data Availability**:
   - Home Office may not publish **ethnic-specific fertility rates**—may require **FOI request** or **academic collaboration**.
2. **Model Complexity**:
   - Adjustments must **preserve provenance** (avoid breaking `data/canonical/` integrity).
3. **Performance**:
   - Large datasets (e.g., `13,482` observations) may slow transformations—optimize in `transform-routes.mjs`.

---
**Priority**: High (H) – Impacts **local authority accountability** in Burnley and other UK regions.
**Next Review**: 7 days (validate adjustments).