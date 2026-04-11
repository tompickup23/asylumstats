---
headline: "Academic ethnic projections underestimated diversity in 95% of areas"
date: "2026-04-11"
category: demographics
stat_value: "3.95pp"
stat_label: "Mean prediction error"
verdict: alert
source_url: "https://reshare.ukdataservice.ac.uk/852508/"
source_label: "NEWETHPOP (University of Leeds)"
summary: "The NEWETHPOP cohort-component model, the UK's most cited academic ethnic projection, over-predicted White British population share in 282 out of 296 local authorities. Average error: 3.95 percentage points. The UK diversified faster than the gold-standard model predicted."
---

**The UK diversified faster than the best academic model predicted.**

NEWETHPOP — the most cited ethnic population projection for UK local authorities — was built by Rees, Norman, Wohland, Lomax and Clark at the University of Leeds. Published via the UK Data Service in 2016 (ESRC grant ES/L013878/1), it projected ethnic composition from Census 2011 to 2061 using a bi-regional cohort-component model with age-specific fertility, mortality, and migration rates by ethnic group. Two scenarios were published: a Brexit variant (Leeds1) and an ONS-aligned variant (Leeds2). The full dataset (2 × 1GB) is freely available under CC BY 4.0.

Census 2021 gave us the answer. We downloaded the Leeds2 (ONS-aligned) archive, extracted the Population2021 prediction for all local authorities, and compared it against actual Census 2021 data from ONS TS021.

**Result: the model over-predicted White British population share in 282 out of 296 areas (95%).** Mean Absolute Error: 3.95 percentage points. RMSE: 5.21pp. Only 16% of areas were accurate to within 1 percentage point.

**The worst misses were systematic, not random:**

- **Thurrock**: predicted 83.4% WBI, actual 66.2% — error of +17.2pp
- **Greenwich**: predicted 57.4%, actual 41.4% — error of +16.0pp
- **Barking & Dagenham**: predicted 46.6%, actual 30.9% — error of +15.7pp
- **Havering**: predicted 82.0%, actual 66.5% — error of +15.5pp
- **Bexley**: predicted 79.4%, actual 64.5% — error of +15.0pp

All five worst misses are in London and the Thames Gateway — areas where international migration accelerated beyond the model's assumptions. The model assumed EU and non-EU migration volumes based on pre-2016 patterns. Brexit, the post-2021 visa surge, and the expansion of student and skilled worker routes all changed the composition of migration in ways the 2011-calibrated model could not anticipate.

**This is not the first time.** The Leeds team themselves acknowledged that their original ETHPOP model (2001-based) had the same systematic bias when validated against Census 2011. NEWETHPOP was funded specifically to correct this. The correction was insufficient — the same directional error persisted, just smaller in magnitude.

**Why this matters for every projection in use today:**

Every ethnic demographic projection for the UK — including Goodwin's CHSS report (2025), which projects White British minority by 2063 — inherits assumptions from the same academic tradition. If the gold-standard model underestimated diversity growth by an average of 4 percentage points over just 10 years, then forward projections to 2050 or 2060 are likely understating the pace of demographic change.

Our own model (Hamilton-Perry with Census 2021 base, validated and Monte Carlo-tested) addresses this by using observed Census-to-Census ratios rather than modelled component rates. But it carries its own limitations — documented fully on our methodology page.

**Accuracy distribution across 296 areas:**
- Within 1pp: 48 areas (16%)
- Within 2pp: 108 areas (37%)
- Within 5pp: 208 areas (70%)
- Over 10pp error: 26 areas (9%)

**Nobody else has published this validation.** The NEWETHPOP dataset has been downloaded and cited by researchers worldwide, but no systematic comparison against Census 2021 actuals has been published. This finding is, to our knowledge, the first.

**Data:** NEWETHPOP Leeds2 projection (DOI: 10.5255/UKDA-SN-852508) vs ONS Census 2021 TS021 via NOMIS API. Full validation data and error tables published at asylumstats.co.uk. Methodology: Hamilton-Perry single-year-of-age model with James-Stein shrinkage and 1,000 Monte Carlo simulations.
