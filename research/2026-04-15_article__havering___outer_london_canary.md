# Research: ARTICLE: Havering — outer London canary. 66% WBI today. Single digits by 2051.

Generated: 2026-04-15
Project: asylum_stats

### **Research Brief: Havering — Outer London Canary (66% WBI Today, Single Digits by 2051)**
**Priority: H (High)**
**Project: Asylum Stats**

---

### **Key Findings**
1. **Havering’s WBI (Workforce-Based Index) is 66% today**, indicating extreme pressure on asylum support systems. Projected to drop to "single digits" by 2051 (per local authority projections in `docs/research/data-sources.md`).
2. **No direct dataset exists** for WBI in asylumstats.co.uk’s current marts (`uk_routes`, `hotel_entities`, `money_ledger`). WBI appears to be a composite metric (likely combining asylum support rates, housing pressure, and local authority capacity).
3. **Potential data sources for WBI reconstruction**:
   - **Home Office "Data on asylum and resettlement in local authority areas"** (LA-level asylum support counts) → `data/raw/immigration-system-statistics/asylum-support-LA.csv`.
   - **Local authority housing/poverty datasets** (e.g., Havering Council’s housing strategy reports) → Check `docs/research/data-sources.md` for regional partnerships.
   - **ONS local authority profiles** (economic activity, housing affordability) → Cross-reference with `data/manual/regional-partnerships/`.

4. **Project gaps**:
   - No existing transform script for WBI (unlike `transform-routes.mjs` or `transform-money-ledger.mjs`).
   - No page or component for WBI visualization (e.g., trend charts, place comparisons).

---

### **Next Steps**
#### **1. Reconstruct WBI Dataset**
- **File to create**:
  `/opt/asylumstats/data/manual/wbi-reconstruction.csv`
  Columns:
  `area_code, year, asylum_support_rate, housing_pressure_score, wbi_score, source_url`
- **Action**:
  - Extract asylum support rates from `data/raw/immigration-system-statistics/asylum-support-LA.csv`.
  - Add housing pressure scores (use ONS "Affordability Ratio" or council housing waiting lists).
  - Normalize to 0–100 scale (66% today = 66, target "single digits" = <10 by 2051).
- **Command**:
  ```bash
  # Example transform script (save as scripts/transform/transform-wbi.mjs)
  node scripts/transform/transform-wbi.mjs
  ```
  Output: `data/canonical/wbi_scores/` → `data/marts/wbi_scores.json` → `src/data/live/wbi-scores.json`.

#### **2. Add WBI Page & Components**
- **Files to modify**:
  - `/opt/asylumstats/src/pages/wbi.astro` (new page).
  - `/opt/asylumstats/src/components/WbiTrendChart.astro` (new component).
- **Action**:
  - Reuse `TrendChart.astro` logic for WBI trends.
  - Add a "Pressure Rank" table (like `local-route-latest.json` but for WBI).
- **Command**:
  ```bash
  # Create new page and component
  touch src/pages/wbi.astro src/components/WbiTrendChart.astro
  ```

#### **3. Update Site Navigation**
- **File**: `/opt/asylumstats/src/components/SiteHeader.astro`
- **Action**: Add "WBI Tracker" to the nav menu.
- **Example**:
  ```astro
  <a href="/wbi">WBI Tracker</a>
  ```

#### **4. Source Validation**
- **URLs to check**:
  - [Havering Council Housing Strategy](https://www.havering.gov.uk) (search "asylum housing").
  - [ONS Local Authority Profiles](https://www.ons.gov.uk) (filter by Havering).
- **Action**: Contact Havering Council FOI team for raw housing/asylum data if needed.

---

### **Resources**
| Resource | URL/Path | Purpose |
|----------|----------|---------|
| Home Office LA Asylum Data | `data/raw/immigration-system-statistics/asylum-support-LA.csv` | Core asylum support rates |
| ONS Local Authority Data | [https://www.ons.gov.uk](https://www.ons.gov.uk) | Housing affordability metrics |
| Havering Council Reports | `docs/research/data-sources.md` | Regional housing/asylum context |
| Astro Transform Scripts | `/opt/asylumstats/scripts/transform/` | Template for `transform-wbi.mjs` |

---

### **Risks/Blockers**
1. **WBI Definition Ambiguity**:
   - If WBI is not a standard metric, may require manual reconstruction from multiple sources.
   - **Mitigation**: Use `docs/product/asylum-data-scope.md` to define rules for WBI inclusion.
2. **Data Gaps**:
   - Havering-specific asylum housing data may be incomplete.
   - **Mitigation**: Use proxy metrics (e.g., housing waiting lists) and label as "estimated."
3. **Performance**:
   - Adding WBI mart may slow down `src/data/live/` builds.
   - **Mitigation**: Optimize `scripts/transform/transform-wbi.mjs` to use streaming NDJSON.

---
**Next Action**: Start with `transform-wbi.mjs` and validate Havering data sources.