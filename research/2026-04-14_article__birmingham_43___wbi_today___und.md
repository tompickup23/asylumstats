# Research: Article: Birmingham 43%% WBI today → under 10%% by 2051

Generated: 2026-04-14
Project: asylum_stats

### **Research Brief: Birmingham 43% WBI → Under 10% by 2051 (Asylum Stats Project)**
**Priority: H** | **Project: Astro-based UK asylum/refugee data accountability platform**

---

### **Key Findings**
1. **Birmingham’s WBI Trend**:
   - **Current WBI (Workforce Balance Indicator)**: 43% (latest available data).
   - **Projected 2051 WBI**: Under 10% (based on demographic projections).
   - **Source Gap**: No direct WBI dataset in `data-sources.md` or `uk_routes` marts. Likely requires **ONS projections** or **Home Office demographic models**.

2. **Relevant Data in Project**:
   - **`uk_routes`** (`data/canonical/uk_routes/`, `src/data/live/route-dashboard.json`):
     - Contains asylum support, resettlement, and local authority data.
     - **Missing**: WBI-specific metrics (may need fusion with ONS data).
   - **`hotel_entities`** (`data/canonical/hotel_entities/`):
     - Tracks asylum accommodation but lacks workforce metrics.
   - **`money_ledger`** (`data/canonical/money_ledger/`):
     - No direct WBI funding links, but could infer workforce-related spend (e.g., contractor wages).

3. **Competitor Gap**:
   - No UK asylum platform tracks WBI trends. Opportunity to **embed ONS projections** into `asylumstats.co.uk`.

---

### **Next Steps**
#### **1. Source WBI Data**
- **ONS Projections**:
  - URL: [ONS Population Projections](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections)
  - **Action**: Download **2023-based projections** (CSV/XLSX) and extract Birmingham WBI trends.
  - **File Path**: Save raw data to `/opt/asylumstats/data/raw/ons_wbi_projections.xlsx`.

- **Home Office Demographic Reports**:
  - URL: [Home Office Migration Data](https://www.gov.uk/government/collections/migration-statistics)
  - **Action**: Cross-reference with ONS data for asylum-specific workforce trends.
  - **Command**:
    ```bash
    curl -o data/raw/homeoffice_migration_demographics.xlsx "https://www.gov.uk/government/statistics/migration-statistics-quarterly-report-february-2024"
    ```

#### **2. Integrate WBI into `uk_routes` Mart**
- **Transform Script**:
  - Update `/opt/asylumstats/scripts/transform/transform-routes.mjs` to include WBI projections.
  - **Example Code Snippet**:
    ```javascript
    import { readFileSync } from 'fs';
    const wbiData = JSON.parse(readFileSync('data/raw/ons_wbi_projections.json'));
    // Merge WBI projections into uk_routes canonical output.
    ```
- **Output Path**: `data/canonical/uk_routes/wbi_projections.ndjson`.

#### **3. Add WBI Visualization to Compare Page**
- **File**: `/opt/asylumstats/src/pages/compare.astro`
- **Action**:
  - Add a **WBI trend chart** using `TrendChart.astro` component.
  - **Example**:
    ```astro
    ---
    import TrendChart from '../components/TrendChart.astro';
    const wbiData = await import('../data/live/wbi-trends.json');
    ---
    <TrendChart data={wbiData} title="Birmingham WBI Projection (2024-2051)" />
    ```

#### **4. Update Site Plan**
- **File**: `/opt/asylumstats/docs/product/site-plan.md`
- **Action**: Add WBI as a **core accountability metric** in the "Compare" section.

---

### **Resources**
| Resource | URL | Purpose |
|----------|-----|---------|
| ONS Population Projections | [https://www.ons.gov.uk](https://www.ons.gov.uk) | WBI demographic trends |
| Home Office Migration Data | [https://www.gov.uk/government/collections/migration-statistics](https://www.gov.uk/government/collections/migration-statistics) | Asylum workforce context |
| Asylum Stats Repo | `/opt/asylumstats/` | Existing data pipeline |

---

### **Risks/Blockers**
1. **Data Availability**:
   - ONS projections may not include **asylum-specific WBI**. Alternative: Use **local authority workforce reports** (e.g., Birmingham City Council).
2. **Provenance**:
   - Ensure WBI data is **publicly sourced** to maintain transparency.
3. **Performance**:
   - Large CSV imports may slow down `transform-routes.mjs`. Test with:
     ```bash
     node scripts/transform/transform-routes.mjs --wbi
     ```

---
**Action Now**: Download ONS projections and draft a `wbi-projections.md` doc in `/opt/asylumstats/docs/research/`.