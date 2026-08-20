# NEWETHPOP 2021 Rebase — Phased Plan

## Goal
Rebase the NEWETHPOP cohort-component ethnic population projection model on Census 2021, producing academic-grade projections for all UK local authorities that withstand rigorous peer review.

## Why This Matters
- NEWETHPOP is 2011-based. Census 2021 is now available. Nobody has rebased it.
- Goodwin/CHSS uses cohort-component but never published their model or inputs.
- A 2021-rebased, open-source, reproducible model would be the definitive UK ethnic projection.

---

## Phase 1: VALIDATION (Week 1)
**Prove the model works before changing it.**

### 1a. Download NEWETHPOP data
- Download `Leeds2Projections.7z` (1GB) from https://reshare.ukdataservice.ac.uk/852508/2/Leeds2Projections.7z
- Extract CSV files (Population2011-2061, all input files)
- Parse file structure: each CSV has columns for [LA code, ethnic group, sex, age 0-100+, population count]

### 1b. Extract NEWETHPOP predictions for 2021
- Read `Population2021_LEEDS2.csv` — what NEWETHPOP predicted for 2021
- Aggregate by LA × ethnic group to get predicted WB%, Asian%, etc.

### 1c. Compare against Census 2021 actuals
- Use our existing Census 2021 TS021 data (already fetched, 318 LAs)
- For each LA: compute `prediction_error = predicted_WB% - actual_WB%`
- Rank LAs by absolute error
- Calculate RMSE, MAE, bias direction (did they over/under-predict WB?)
- **Publishable output**: validation report showing where NEWETHPOP got it right/wrong

### 1d. Publish validation as a Finding
- New finding on asylumstats: "How accurate were the academic ethnic projections?"
- Maps showing where predictions were accurate vs off
- This alone is valuable — nobody has published this systematically

**Deliverable**: Validation report + Finding page + error distribution data

---

## Phase 2: REBASE POPULATION (Week 2)
**Replace the 2011 base with Census 2021.**

### 2a. Download Census 2021 base population
- NOMIS RM032: Ethnic group × sex × age (single year 0-100+) × LA
- API: `https://www.nomisweb.co.uk/api/v01/dataset/NM_2132_1.data.csv`
- Dimensions: geography=TYPE424, C2021_ETH_20=all, C2021_AGE_6=all (or find single-year-age version), C_SEX=1,2
- **NOTE**: RM032 only has 6 age bands, not single year. Need to check if NM_2132_1 has finer age granularity, or use Census 2021 Bulk Data which has single year of age × ethnicity × sex at LA level.

### 2b. Map ethnic groups
NEWETHPOP uses 16 groups. Census 2021 has 19+5 (detailed + summary). Create mapping table.

**NEWETHPOP 16 groups** (from NewETHPOPEthnicgroups.docx):
1. White British
2. White Irish
3. Other White
4. Mixed: White & Black Caribbean
5. Mixed: White & Black African
6. Mixed: White & Asian
7. Other Mixed
8. Indian
9. Pakistani
10. Bangladeshi
11. Chinese
12. Other Asian
13. Black Caribbean
14. Black African
15. Other Black
16. Other (incl. Arab from 2021)

**Census 2021 maps 1:1** to these 16 groups with minor additions (Roma separate from Gypsy/Traveller, Arab separate from Other).

### 2c. Generate base population file
- Format: CSV matching NEWETHPOP structure
- Rows: LA × ethnic group × sex × single year of age (0-100+)
- This replaces `Population2011_LEEDS2.csv` as the new starting point

**Deliverable**: Census 2021 base population in NEWETHPOP format

---

## Phase 3: UPDATE FERTILITY (Week 3)
**Replace 2011-era ethnic fertility rates with 2021-era.**

### 3a. National ethnic fertility rates
- Source: ONS Linked Births Dataset 2023-2024
- URL: https://www.ons.gov.uk/peoplepopulationandcommunity/birthsdeathsandmarriages/livebirths/datasets/birthsinenglandandwaleslinkedbirths
- Extract: births by baby's ethnicity and mother's age → compute age-specific fertility rates (ASFRs) by ethnic group
- Calculate TFR by ethnic group

### 3b. LA-level ethnic fertility estimation
- LA-level total births available from NOMIS
- Apply national ethnic TFR ratios to LA birth totals, weighted by LA ethnic composition
- **Better approach**: Request the withdrawn ONS ad hoc "births by ethnicity and LA, 2020-2023" via health.data@ons.gov.uk
- **Fallback**: Use Bayesian estimation — national ethnic fertility rates × LA ethnic population structure → expected births by ethnic group per LA

### 3c. Fertility convergence assumption
- Key academic insight: ethnic fertility differentials narrow over time
- Pakistani/Bangladeshi TFR converging toward White British (see Coleman & Dubuc)
- Model 3 scenarios: (a) current rates held constant, (b) linear convergence to national average by 2061, (c) half-convergence
- Generate FertilityYYYY.csv files for 2021-2071

**Deliverable**: Updated fertility input files for 3 scenarios

---

## Phase 4: UPDATE MORTALITY (Week 3-4)
**Replace 2011-era ethnic mortality rates.**

### 4a. National ethnic mortality differentials
- Source: ONS "Ethnic differences in life expectancy and mortality" (2011 Census linked, 2011-2014)
- URL: https://www.ons.gov.uk/releases/ethnicvariationsinlifeexpectancy2011to2014englandandwales
- Extract: age-standardised mortality rates by ethnic group and sex
- Also: ONS "Mortality from leading causes by ethnic group" (2012-2019)

### 4b. Apply ethnic mortality ratios to ONS 2022-based mortality assumptions
- ONS 2022-based projections provide LA-level age/sex mortality rates to 2047
- Apply ethnic group mortality differentials (from 4a) as ratios on top of ONS rates
- e.g., if Black African mortality is 0.85× White British at age 50-54, apply that ratio
- This inherits ONS's COVID-recovery and life expectancy improvement assumptions

### 4c. Generate mortality input files
- MortalityYYYY.csv for 2021-2071 (or 2021-2047 matching ONS horizon)

**Deliverable**: Updated mortality input files

---

## Phase 5: UPDATE MIGRATION (Week 4-5)
**The hardest component. Two sub-problems: internal and international.**

### 5a. Internal migration (Census 2021)
- Source: NOMIS Census 2021 MIG003EW — migration by ethnic group × age × LA
- Origin-destination matrix for 12 months before Census Day
- **COVID caveat**: March 2020-March 2021 was lockdown period
- **Mitigation**: Blend 2011 and 2021 matrices (e.g., 50:50 or 70:30 favouring 2021)
- Generate InternalInmig and InternalOutmig probability matrices

### 5b. International migration
- **Immigration**: ONS LTIM by nationality → map to ethnic group using Census 2021 country-of-birth × ethnicity cross-tab
- **Emigration**: Same approach but emigration data is weaker (admin-based estimates)
- **LA distribution**: Use ONS Z7 (international migration projections by LA, 2022-based) for spatial distribution
- **3 scenarios**: Match ONS SNPP variants: principal, high migration (476k/yr), low migration (108k/yr)
- Generate ImmigYYYY.csv and EmigYYYY.csv for each scenario

### 5c. Ethnic mixing/reclassification
- Source: Census 2021 mixed ethnicity data + births by parents' ethnicity
- The "mixing matrix" determines what ethnic group children of mixed-ethnicity parents are assigned to
- Update from 2011-era rates using Census 2021 mixed heritage growth patterns

**Deliverable**: Updated migration and mixing input files for 3 scenarios

---

## Phase 6: RUN THE MODEL (Week 5-6)
**Execute the cohort-component projection.**

### 6a. Implement the model equations
- From ProjectionModel_Equations.docx (downloaded to /tmp/)
- Standard bi-regional cohort-component:
  ```
  P(t+1, a+1, e, s, r) = P(t, a, e, s, r) × S(t, a, e, s, r)
                         + IM(t, a, e, s, r) - EM(t, a, e, s, r)
                         + MIG_IN(t, a, e, s, r) - MIG_OUT(t, a, e, s, r)
  ```
  Where: P=population, S=survival rate, IM/EM=international migration, MIG=internal migration
  Plus: B(t, e, s, r) = births by ethnic group (from fertility × female population × mixing)

### 6b. Implement in Node.js/Python
- Python preferred for demographic computation (NumPy arrays)
- Script: `scripts/model/cohort_component.py`
- Input: base population + fertility + mortality + migration files
- Output: PopulationYYYY.csv for 2021-2071

### 6c. Run 9 scenario combinations
- 3 fertility × 3 migration = 9 scenarios
- Central scenario: mid fertility convergence + ONS principal migration
- High diversity: constant ethnic fertility + high migration
- Low diversity: full convergence + low migration

### 6d. Constrain to ONS SNPP totals
- Ensure total population by LA matches ONS 2022-based projections (to 2047)
- Adjust proportionally if model totals diverge from ONS envelope

**Deliverable**: Population projections for all LAs, 2021-2071, 9 scenarios

---

## Phase 7: VALIDATE & PUBLISH (Week 6-7)
**Academic-grade output.**

### 7a. Backcasting validation
- Run model from 2011 base → predict 2021 → compare to Census 2021 actuals
- This gives empirical prediction error by LA
- Apply error distribution as confidence intervals on forward projections

### 7b. Generate site data
- Transform model output → ethnic-projections.json for asylumstats
- Include: central projection + high/low bounds for each LA
- Show which scenario the area follows most closely

### 7c. Methodology page
- Full academic-grade methodology write-up
- Model equations, data sources, assumptions, limitations
- Comparison to NEWETHPOP 2011 and Goodwin/CHSS
- Link to downloadable model code and data (open-source)

### 7d. New Findings
- "Updated ethnic projections for 316 local authorities"
- "Which areas are changing fastest — and how confident should we be?"
- "How accurate were the 2011 projections? A decade-later validation"

**Deliverable**: Published projections + methodology + validation findings

---

## Data Source Summary

| Component | Source | URL | Format | Ethnic? | LA? |
|-----------|--------|-----|--------|---------|-----|
| Base population | Census 2021 RM032 | NOMIS NM_2132_1 | CSV API | Yes (19 groups) | Yes |
| Fertility (national) | ONS Linked Births | GOV.UK | XLSX | Yes | No |
| Fertility (LA) | ONS ad hoc (withdrawn) | Request via email | XLSX | Yes | Yes |
| Mortality | ONS ethnic mortality | GOV.UK | XLSX | Yes (10 groups) | No |
| Mortality (LA totals) | ONS 2022-based SNPP | GOV.UK Z1 | XLSX | No | Yes |
| Internal migration | Census 2021 MIG003EW | NOMIS | CSV ZIP | Yes | Yes |
| International migration | ONS LTIM + Home Office | GOV.UK | XLSX | Via proxy | Partial |
| Migration envelope | ONS SNPP Z7 | GOV.UK | XLSX | No | Yes |
| Mixing | Census 2021 mixed heritage | NOMIS | CSV | Yes | Yes |
| NEWETHPOP original | ReShare | ukdataservice.ac.uk | 7z/CSV | Yes | Yes |

---

## What Makes This Better Than NEWETHPOP / Goodwin

| Feature | NEWETHPOP (2011) | Goodwin/CHSS | This Model |
|---------|------------------|--------------|------------|
| Base year | 2011 | 2022 | **2021 (Census)** |
| Validated against actuals | No | No | **Yes (2011→2021)** |
| Scenarios | 2 | 1 | **9 (3×3)** |
| Confidence intervals | No | No | **Yes (empirical)** |
| Open source | Data only | No | **Code + data** |
| Reproducible | Partially | No | **Fully automated** |
| Geographic coverage | 391 LAs | ~50 quoted | **316+ LAs** |
| Updated components | 2011-era | 2022-era | **2021-2024 era** |
| Migration sensitivity | Brexit vs ONS | Single assumption | **3 ONS variants** |
| Fertility convergence | No | Unclear | **3 scenarios** |

---

## Minimum Viable Version (Phases 1-2 only)

If time is limited, Phases 1-2 alone produce:
1. A published validation of NEWETHPOP (nobody has done this)
2. Census 2021 rebased population with our existing linear projections
3. Error bounds from the NEWETHPOP validation applied to our projections

This is already more rigorous than anything published, and can be done in 1-2 weeks.
