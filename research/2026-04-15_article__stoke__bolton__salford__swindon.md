# Research: ARTICLE: Stoke, Bolton, Salford, Swindon — the new frontline towns

Generated: 2026-04-15
Project: asylum_stats

### **Research Brief: Stoke, Bolton, Salford, Swindon — The New Frontline Towns**
**Priority:** H (High)
**Project:** Asylum Stats (Astro-based UK asylum/refugee data platform)

---

## **Key Findings**
1. **Geographic Focus:**
   - Stoke, Bolton, Salford, and Swindon are identified as "frontline towns" in asylum accommodation and support debates.
   - These areas likely have high concentrations of asylum seekers in hotels or contingency accommodation (per [docs/research/data-sources.md](file:///opt/asylumstats/docs/research/data-sources.md)).

2. **Data Gaps in Current MVP:**
   - The platform’s **hotel tracker** (`src/data/live/hotel-entity-ledger.json`) and **money ledger** (`src/data/live/money-ledger.json`) may lack granularity for these specific towns.
   - **Local response contracts** (e.g., council procurement for asylum support) are missing (per [roadmap.md](file:///opt/asylumstats/docs/roadmap.md)).

3. **Competitor Insight:**
   - No direct competitor tracks **named hotel sites + public spending** at this granularity (per [docs/research/competitors.md](file:///opt/asylumstats/docs/research/competitors.md)).

---

## **Next Steps**
### **1. Verify Hotel Presence in Target Towns**
   - **Check `hotel-entity-ledger.json`:**
     ```bash
     cat /opt/asylumstats/src/data/live/hotel-entity-ledger.json | grep -E "Stoke|Bolton|Salford|Swindon"
     ```
   - **If missing, add manual entries** to `data/manual/hotel_sightings.csv` (template: [docs/product/hotel-tracker-plan.md](file:///opt/asylumstats/docs/product/hotel-tracker-plan.md)).

### **2. Enrich Money Ledger for Local Contracts**
   - **Search for council contracts:**
     ```bash
     grep -r "Stoke\|Bolton\|Salford\|Swindon" /opt/asylumstats/data/manual/
     ```
   - **Add procurement rows** to `money-ledger` (schema: [schemas/money-ledger.json](file:///opt/asylumstats/schemas/money-ledger.json)).

### **3. Generate Place Pages for Each Town**
   - **Use `place-drilldown.ts`** to auto-create pages:
     ```bash
     node /opt/asylumstats/src/scripts/place-drilldown.ts --towns Stoke,Bolton,Salford,Swindon
     ```
   - **Template:** [src/pages/places/[town].astro](file:///opt/asylumstats/src/pages/places/%5Btown%5D.astro).

### **4. Add Comparative Visuals**
   - **Update `BenchmarkStrip.astro`** (component path: [src/components/BenchmarkStrip.astro](file:///opt/asylumstats/src/components/BenchmarkStrip.astro)) to highlight these towns vs. regional averages.

---

## **Resources**
- **Home Office Data:** [Local Authority Asylum Data](https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas)
- **Hotel Tracker Plan:** [docs/product/hotel-tracker-plan.md](file:///opt/asylumstats/docs/product/hotel-tracker-plan.md)
- **Money Ledger Schema:** [schemas/money-ledger.json](file:///opt/asylumstats/schemas/money-ledger.json)

---

## **Risks/Blockers**
- **Data Scarcity:** If no public records exist for a town, flag as "unverified" (per [asylum-data-scope.md](file:///opt/asylumstats/docs/product/asylum-data-scope.md)).
- **Provenance:** Use web archives (e.g., [UK Web Archive](https://www.webarchive.org.uk/)) for older hotel/council data.

**Action:** Prioritize Step 1 (hotel verification) to unblock further analysis.