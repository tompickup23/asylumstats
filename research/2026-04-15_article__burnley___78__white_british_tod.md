# Research: ARTICLE: Burnley — 78% White British today. 43% by 2051. YOUR town is changing.

Generated: 2026-04-15
Project: asylum_stats

### **Research Brief: "Burnley — 78% White British today. 43% by 2051. YOUR town is changing."**

#### **Key Findings**
1. **Demographic Projection Data Gap**
   - No direct demographic projections for Burnley’s ethnic composition by 2051 are available in the current `asylumstats` data pipeline.
   - The project’s focus is on asylum/refugee data, but Burnley’s changing demographics (e.g., migration-driven shifts) are relevant for contextual analysis.

2. **Local Authority Data Sources**
   - **Office for National Statistics (ONS) 2021 Census** provides baseline ethnic composition for Burnley (78% White British).
   - **ONS Population Projections** (2018-based) suggest UK-wide trends but lack granular Burnley-specific forecasts.
   - **Local Authority Data** (e.g., Burnley Borough Council) may have unpublished projections or ward-level breakdowns.

3. **Migration & Asylum Data Relevance**
   - The `asylumstats` project tracks asylum seekers and refugees but does not directly model ethnic demographic shifts.
   - **Hotel placements** (e.g., dispersal sites) in Lancashire could indirectly influence local demographics, but no direct linkage exists in current datasets.

4. **Competitor Analysis**
   - No existing public tool combines asylum/refugee data with demographic projections for UK towns.
   - **Migration Observatory** (Oxford) and **ESRC Understanding Society** provide migration trends but not town-level forecasts.

---

#### **Next Steps**
1. **Source Burnley-Specific Projections**
   - **Command**: Query ONS datasets for Burnley’s ward-level ethnic projections.
     ```bash
     curl -o "data/raw/ons_burnley_projections.csv" "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/populationprojections/datasets/localauthoritydistrictpopulationprojectionsreferencetables/2018based/2018localauthoritydistrictprojectionssexethnicgroup.xls"
     ```
   - **File Path**: `docs/research/data-sources.md` (update with ONS projection sources).

2. **Cross-Reference Asylum Data**
   - **Action**: Link asylum dispersal sites in Burnley (e.g., hotels) to local demographic shifts.
   - **File Path**: `scripts/transform/transform-hotel-entities.mjs` (add Burnley-specific filters).

3. **Generate Burnley Article**
   - **Template**: Use `src/pages/articles/` (create `burnley-demographics.astro`).
   - **Data Sources**:
     - ONS Census 2021 (`data/raw/ons_census_2021_burnley.csv`).
     - Asylum dispersal data (`src/data/live/hotel-area-sightings.json`).

4. **Visualization**
   - **Tool**: Use `RegionTileMap.astro` (adapt for Burnley ward-level breakdowns).
   - **Command**: Run Astro build to preview:
     ```bash
     npm run dev
     ```

---

#### **Resources**
- **ONS Census 2021**: [Burnley Ethnic Composition](https://www.ons.gov.uk/census)
- **ONS Projections**: [2018-Based Ethnic Group Projections](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections)
- **Migration Observatory**: [UK Migration Trends](https://migrationobservatory.ox.ac.uk/)

---
#### **Risks/Blockers**
1. **Lack of Granular Projections**
   - ONS projections may not provide Burnley-specific 2051 ethnic forecasts.
   - **Mitigation**: Use ward-level trends and extrapolate (document assumptions in `methodology.md`).

2. **Data Linkage Challenges**
   - Asylum dispersal data may not align with demographic zones.
   - **Mitigation**: Use Burnley Borough Council ward boundaries for alignment.

---
**Priority**: High (aligns with project’s accountability focus and Burnley’s local relevance).
**Next Review**: 1 week (validate ONS data extraction).