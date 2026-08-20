# Research: ACADEMIC: Publish methodology paper (HP vs CC subnational ethnic projections)

Generated: 2026-04-15
Project: asylum_stats

### **Research Brief: Publish Methodology Paper (HP vs CC Subnational Ethnic Projections)**
**Priority:** High | **Project:** Asylum Stats (UK asylum/refugee data accountability platform)

---

### **Key Findings**
1. **Existing Methodology Gaps**
   - The project lacks a formal **methodology paper** comparing **Home Office Projections (HP)** vs. **Council-led Census/Citizen Curated (CC) subnational ethnic projections** for asylum/refugee populations.
   - Current `docs/` includes `methodology.md` (generic) but no **peer-reviewed-style paper** with:
     - **Data sources** (e.g., ONS, Home Office, local authority records).
     - **Methodology** (e.g., projection models, assumptions, limitations).
     - **Validation** (e.g., comparisons with real-time data, FOI requests).

2. **Relevant Data Sources**
   - **Home Office Projections (HP):**
     - `docs/research/data-sources.md` lists Home Office immigration stats but lacks **ethnic breakdown projections**.
     - **Action:** Check `data/raw/home-office-projections/` (if exists) or scrape from [Home Office releases](https://www.gov.uk/government/collections/immigration-system-statistics).
   - **Council-led Census/Citizen Curated (CC):**
     - `docs/research/lancashire-ai-doge-review.md` may reference local projections.
     - **Action:** Review Burnley Council’s **Census 2021 ethnic breakdown** (ONS) and **local FOI responses** (e.g., asylum dispersal data).

3. **Current Project Structure**
   - **Data pipeline** (`scripts/transform/`) already processes asylum/refugee data into `src/data/live/`.
   - **No subnational ethnic projections** are currently integrated into the marts (`uk_routes`, `hotel_entities`, `money_ledger`).

---

### **Next Steps**
#### **1. Draft the Methodology Paper**
- **File Path:** Create `docs/research/methodology-hp-vs-cc.md`.
- **Sections to Include:**
  - **Introduction:** Why compare HP vs. CC?
  - **Data Sources:**
    - HP: Home Office projections (e.g., [UK Population Projections](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections)).
    - CC: ONS Census 2021 + local authority FOIs (e.g., Burnley Council’s asylum support data).
  - **Methodology:**
    - HP: How are projections calculated? (e.g., [Home Office methodology](https://www.gov.uk/government/publications/asylum-and-resettlement-statistics-methodology)).
    - CC: How are local projections curated? (e.g., FOI requests, citizen data).
  - **Validation:** Compare HP vs. CC for **Burnley/ Lancashire** (use `data/raw/` if available).
  - **Limitations:** Gaps in data (e.g., unrecorded asylum seekers).

#### **2. Extract and Compare Data**
- **Commands:**
  ```bash
  # Check if Home Office projections exist in raw data
  ls /opt/asylumstats/data/raw/home-office-projections/

  # If not, download from ONS:
  wget https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/populationandmigration/populationprojections/datasets/tablea11uksummaryprojections/2020basedprojections.xlsx
  ```
- **Local Authority Data:**
  - **Burnley Council FOI Requests:**
    - Check `docs/manual/foi-requests/` for past FOIs on asylum dispersal.
    - **Action:** Submit a new FOI for **2023/24 ethnic breakdown of asylum seekers** (template: `docs/manual/foi-template.md`).
  - **ONS Census 2021:**
    - Download: [ONS Ethnic Group Data](https://www.ons.gov.uk/census/2021census).
    - **Action:** Filter for **Burnley/Lancashire** and compare with HP.

#### **3. Integrate Findings into the Platform**
- **Update `src/data/live/ethnic-projections.json`** (if created).
- **Add a new page:**
  - **File Path:** `src/pages/methodology/hp-vs-cc.astro`.
  - **Content:** Embed findings from `docs/research/methodology-hp-vs-cc.md`.

#### **4. Publish the Paper**
- **Host on GitHub Pages:**
  ```bash
  # Build and deploy Astro site
  npm run build
  npm run preview
  ```
- **Submit to a Preprint Server:**
  - **Options:** [arXiv](https://arxiv.org/), [Zenodo](https://zenodo.org/), or **UK Data Service**.

---

### **Resources**
| Resource | URL | Purpose |
|----------|-----|---------|
| ONS Population Projections | [https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections](https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationprojections) | HP data |
| Home Office Asylum Stats | [https://www.gov.uk/government/collections/immigration-system-statistics](https://www.gov.uk/government/collections/immigration-system-statistics) | HP methodology |
| ONS Census 2021 | [https://www.ons.gov.uk/census/2021census](https://www.ons.gov.uk/census/2021census) | CC data |
| UK Data Service | [https://ukdataservice.ac.uk/](https://ukdataservice.ac.uk/) | Academic publishing |
| arXiv Preprints | [https://arxiv.org/](https://arxiv.org/) | Open-access publishing |

---
### **Risks/Blockers**
1. **Data Availability:**
   - **Risk:** Home Office may not publish **subnational ethnic projections**.
   - **Mitigation:** Use **FOI requests** (template: `docs/manual/foi-template.md`).
2. **Local Authority Cooperation:**
   - **Risk:** Burnley Council may not respond to FOIs.
   - **Mitigation:** Escalate to **Lancashire County Council** or **Greater Manchester Combined Authority** for regional data.
3. **Methodology Complexity:**
   - **Risk:** HP vs. CC comparisons may require **statistical modeling**.
   - **Mitigation:** Collaborate with a **university partner** (e.g., UCLan or Manchester Met).

---
**Next Action:** Draft `docs/research/methodology-hp-vs-cc.md` and submit FOI requests for local ethnic breakdowns.