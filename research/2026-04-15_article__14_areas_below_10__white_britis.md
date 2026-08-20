# Research: ARTICLE: 14 areas below 10% White British by 2051

Generated: 2026-04-15
Project: asylum_stats

### **Research Brief: "14 Areas Below 10% White British by 2051" for Asylum Stats Project**

#### **Key Findings**
1. **Project Context**: The asylumstats.co.uk platform already tracks asylum routes, hotel estates, and public spending but lacks demographic projections (e.g., ethnicity shifts).
2. **Data Gap**: No existing dataset in the project’s `docs/research/data-sources.md` or `data-sources.md` covers **2051 ethnicity projections** by local authority.
3. **Potential Sources**:
   - **Office for National Statistics (ONS)**: Provides 2021 Census ethnicity data and projections (e.g., [ONS Population Projections](https://www.ons.gov.uk/)).
   - **Local Authority Joint Strategic Needs Assessments (JSNAs)**: Some councils publish ethnic demographic forecasts (e.g., Burnley Council JSNA).
   - **Migration Observatory (Oxford)**: Tracks demographic shifts but lacks 2051 projections.
4. **Feasibility**: No direct "14 areas below 10% White British by 2051" dataset exists. Requires **custom modeling** using ONS projections + asylum seeker/resettlement data.

---

#### **Next Steps**
1. **Source ONS Ethnicity Projections**:
   - Download **2021 Census ethnicity data** and **2023-based projections** from:
     🔗 [ONS Ethnicity Data](https://www.ons.gov.uk/census/2021census)
     🔗 [ONS Population Projections](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections)
   - **Command** (to fetch raw CSVs):
     ```bash
     wget https://www.ons.gov.uk/file?uri=/census/2021census/bulkdata/2021censusbulkdata_ethnicity.xlsx
     wget https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/populationprojections/datasets/tablea11principalprojectionuksummary/2023based/principalprojectionsuksummary.xlsx
     ```

2. **Cross-Reference with Asylum Data**:
   - Use `data/canonical/uk_routes/` and `data/manual/` to identify high-asylum areas (e.g., Burnley, Blackburn).
   - **File Path**: `/opt/asylumstats/data/manual/local-authority-asylum-impact.csv` (create if missing).

3. **Build Projection Model**:
   - **Script**: Extend `scripts/transform/transform-routes.mjs` to:
     - Merge ONS ethnicity projections with asylum data.
     - Flag areas where White British % <10% by 2051.
   - **Example Logic** (pseudo-code):
     ```javascript
     // In transform-routes.mjs
     const onsProjections = loadONSData("data/raw/ons-ethnicity-projections.csv");
     const asylumData = loadAsylumData("data/canonical/uk_routes/");
     const merged = mergeByLA(onsProjections, asylumData);
     const lowWhiteBritish = merged.filter(area => area.whiteBritishPct2051 < 10);
     saveToCanonical(lowWhiteBritish, "data/canonical/low-white-british-2051.json");
     ```

4. **Visualize in Astro**:
   - Add a new page `/places/low-white-british-2051` using `src/pages/places/[slug].astro`.
   - **Component**: Reuse `RegionTileMap.astro` to highlight affected areas.

5. **Validate with JSNAs**:
   - Check Burnley Council JSNA for ethnicity projections:
     🔗 [Burnley JSNA](https://www.burnley.gov.uk/jsna)
   - **File Path**: `/opt/asylumstats/data/manual/burnley-jsna-ethnicity.pdf` (download and extract tables).

---

#### **Resources**
- **ONS Data**: [Ethnicity Data](https://www.ons.gov.uk/census/2021census) | [Projections](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections)
- **Migration Observatory**: [Demographic Trends](https://migrationobservatory.ox.ac.uk/)
- **Local JSNAs**: Search `[Council Name] + JSNA ethnicity`.

---
#### **Risks/Blockers**
1. **ONS Projections Lag**: 2023-based projections may not include ethnicity breakdowns. **Mitigation**: Use 2021 Census + asylum growth rates.
2. **Data Licensing**: ONS data is OGL-compliant, but JSNAs may require permissions. **Action**: Email councils for reuse rights.
3. **Model Accuracy**: Projections are estimates. **Mitigation**: Add confidence intervals in UI.

---
**Priority**: High (aligns with accountability focus).
**Next Review**: 1 week (validate ONS data download).