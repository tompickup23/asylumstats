# Research: DATA: Download Census 2021 OD migration by ethnicity from ONS custom dataset

Generated: 2026-04-15
Project: asylum_stats

### **Research Brief: Download Census 2021 OD Migration by Ethnicity from ONS Custom Dataset**
**Priority: H (High) | Project: Asylum Stats**

---

#### **1. Key Findings**
- **Dataset Relevance**: The **Census 2021 Origin-Destination (OD) Migration by Ethnicity** dataset tracks migration flows between UK local authorities, broken down by ethnicity. This is critical for understanding refugee/asylum-seeker movement patterns, which aligns with the **asylumstats.co.uk** project’s focus on migration accountability.
- **Source**: Published by the **Office for National Statistics (ONS)** via the **Nomis** platform ([link](https://www.nomisweb.co.uk/)).
- **Current Gaps**: The project’s existing data pipeline (`data/raw/`, `scripts/fetch/`) lacks automation for this dataset. Manual downloads are unsustainable for repeatable builds.
- **File Paths**:
  - Raw data likely belongs in `/opt/asylumstats/data/raw/census_2021_od_migration/`.
  - Transform scripts should output to `/opt/asylumstats/data/canonical/census_2021_od_migration/`.

---

#### **2. Next Steps**
**A. Download the Dataset**
1. **Navigate to Nomis**:
   - Go to [Nomis Census 2021 OD Migration](https://www.nomisweb.co.uk/census/2021/flows).
   - Filter by:
     - **Geography**: Local Authority (LA) to LA.
     - **Ethnicity**: All ethnic groups (or specific groups if relevant).
     - **Migration Type**: Inflow/Outflow (select "All").
   - Export as **CSV** (or XLSX if easier).

2. **Save the File**:
   - Place the downloaded file in:
     ```
     /opt/asylumstats/data/raw/census_2021_od_migration/od_migration_2021_ethnicity.csv
     ```

**B. Automate Future Downloads**
1. **Create a Fetch Script**:
   - Add a new script in `/opt/asylumstats/scripts/fetch/`:
     ```bash
     # Example: scripts/fetch/fetch_census_od_migration.sh
     #!/bin/bash
     URL="https://www.nomisweb.co.uk/api/v0.1/dataset/NM_127_1.csv?geography=TYPE290&ethnicity=*&measure=*"
     curl -o /opt/asylumstats/data/raw/census_2021_od_migration/od_migration_2021_ethnicity.csv "$URL"
     ```
   - Make it executable:
     ```bash
     chmod +x /opt/asylumstats/scripts/fetch/fetch_census_od_migration.sh
     ```

2. **Integrate into Data Pipeline**:
   - Update `/opt/asylumstats/scripts/build.mjs` to include this step:
     ```javascript
     import { fetchCensusODMigration } from './fetch/fetch_census_od_migration.mjs';
     await fetchCensusODMigration();
     ```

**C. Transform the Data**
1. **Create a Transform Script**:
   - Add `/opt/asylumstats/scripts/transform/transform_census_od_migration.mjs`:
     ```javascript
     import { readFileSync, writeFileSync } from 'fs';
     import { parse } from 'csv-parse/sync';

     const rawData = readFileSync(
       '/opt/asylumstats/data/raw/census_2021_od_migration/od_migration_2021_ethnicity.csv',
       'utf-8'
     );
     const records = parse(rawData, { columns: true });

     // Filter/clean records (e.g., remove rows without LA codes)
     const cleaned = records.filter(r => r.geography_code);

     // Write canonical NDJSON
     writeFileSync(
       '/opt/asylumstats/data/canonical/census_2021_od_migration/census_od_migration.ndjson',
       cleaned.map(JSON.stringify).join('\n')
     );
     ```

2. **Run the Transform**:
   ```bash
   node /opt/asylumstats/scripts/transform/transform_census_od_migration.mjs
   ```

**D. Integrate into the Site**
- Add a new mart in `/opt/asylumstats/data/marts/census_od_migration/` and expose via `src/data/live/`.

---

#### **3. Resources**
- **Nomis API**: [https://www.nomisweb.co.uk/api/v0.1/](https://www.nomisweb.co.uk/api/v0.1/) (for programmatic access).
- **Census 2021 OD Migration**: [https://www.nomisweb.co.uk/census/2021/flows](https://www.nomisweb.co.uk/census/2021/flows).
- **CSV Parsing in Node**: Use `csv-parse` ([npm](https://www.npmjs.com/package/csv-parse)).

---
#### **4. Risks/Blockers**
- **API Changes**: Nomis may alter endpoints; monitor for 404s.
- **Data Volume**: Large CSV files may require chunked processing.
- **Ethnicity Granularity**: If the dataset is too broad, refine filters (e.g., focus on "Asian" or "Black" groups).

**Action Now**: Download the dataset manually and validate its structure before automating.