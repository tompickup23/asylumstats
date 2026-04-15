# Research: ARTICLE: Pendle projected Muslim majority by 2051 — a Lancashire mill town

Generated: 2026-04-15
Project: asylum_stats

Here's a research brief for the task "ARTICLE: Pendle projected Muslim majority by 2051 — a Lancashire mill town".

### 1. Key Findings

The `asylumstats.co.uk` platform is designed to track *current and historical* asylum and refugee data, hotel usage, and public spending at a local authority level, including Pendle. While the platform has a robust geographic drilldown and can incorporate "Local authority data on immigration groups" for context (`docs/research/data-sources.md`), it is **not currently equipped to handle religious demographic projections.**

*   **Scope Mismatch:** The core data marts (`uk_routes`, `hotel_entities`, `money_ledger`) and their underlying official sources (Home Office immigration statistics) do not include religious affiliation or future demographic projections. The project's "hard rules" (`docs/product/asylum-data-scope.md`) focus on route-specific asylum/refugee data, local evidence, or direct context. A religious demographic projection would be "context only" at best, and likely outside the immediate scope unless directly linked to asylum/refugee impacts.
*   **Data Architecture:** Incorporating this data would require identifying a new, authoritative source for the projection and building a new data pipeline (raw -> canonical -> mart) distinct from the existing `uk_routes`, `hotel_entities`, or `money_ledger` flows (`docs/product/data-architecture.md`).
*   **Pendle Context:** Pendle is a valid local authority within the project's geographic scope. The platform can display existing asylum support and resettlement figures for Pendle using `src/data/live/local-route-latest.json`.

###