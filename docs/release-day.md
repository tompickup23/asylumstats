# Release-day runbook: Home Office quarterly immigration statistics

Written 3 November 2026 for the release of **Thursday 26 November 2026 at 09:30**. Reuse it for **25 February 2027** and **27 May 2027**: section 1 says what to re-read before each one, and every date below that belongs to one release is marked so it can be replaced.

The aim on each release day: every place page, explainer and headline figure on the site shows the new quarter the same day, with nothing estimated and every figure naming its table and edition.

## 1. The release calendar

All read live from the GOV.UK Content API (`https://www.gov.uk/api/content/government/statistics/announcements/<slug>`) on 3 November 2026 at 12:26 UTC. "State" is GOV.UK's own field: `confirmed` means the date is fixed; `provisional` means it may move.

| Release | Date and time stated | State | Announcement |
|---|---|---|---|
| Immigration system statistics, year ending September 2026 | 26 November 2026 9:30am | confirmed | [immigration-system-statistics-year-ending-september-2026](https://www.gov.uk/government/statistics/announcements/immigration-system-statistics-year-ending-september-2026) |
| Immigration system statistics, year ending December 2026 | 25 February 2027 9:30am | provisional | [immigration-system-statistics-year-ending-december-2026](https://www.gov.uk/government/statistics/announcements/immigration-system-statistics-year-ending-december-2026) |
| Immigration system statistics, year ending March 2027 | 27 May 2027 9:30am | provisional | [immigration-system-statistics-year-ending-march-2027](https://www.gov.uk/government/statistics/announcements/immigration-system-statistics-year-ending-march-2027) |
| Visa expiry outcomes statistics, to December 2025 (first edition since August 2020; national, no local authority table expected) | 26 November 2026 9:30am | confirmed (read 8 November 2026) | [visa-expiry-outcomes-statistics-to-december-2025](https://www.gov.uk/government/statistics/announcements/visa-expiry-outcomes-statistics-to-december-2025) |
| Statutory homelessness in England: April to June 2026 (H-CLIC quarterly) | 26 November 2026 9:30am | confirmed | [statutory-homelessness-in-england-april-to-june-2026](https://www.gov.uk/government/statistics/announcements/statutory-homelessness-in-england-april-to-june-2026) |
| Statutory homelessness in England: Financial Year 2025-26 (annual) | 26 November 2026 9:30am | provisional | [statutory-homelessness-in-england-financial-year-2025-26](https://www.gov.uk/government/statistics/announcements/statutory-homelessness-in-england-financial-year-2025-26) |
| Statutory homelessness in England: July to September 2026 | No announcement found on 3 November 2026 | | search the [statistics release calendar](https://www.gov.uk/search/research-and-statistics?content_store_document_type=upcoming_statistics) |
| Rough sleeping snapshot in England: autumn 2026 | February 2027 (month only; the API's placeholder timestamp is 25 February 2027) | provisional | [rough-sleeping-snapshot-in-england-autumn-2025--2](https://www.gov.uk/government/statistics/announcements/rough-sleeping-snapshot-in-england-autumn-2025--2) (GOV.UK's slug, title reads autumn 2026) |
| Local authority revenue expenditure and financing England: 2025 to 2026, second release (RO4 sits in this series) | 10 December 2026 9:30am | provisional | [local-authority-revenue-expenditure-and-financing-england-2025-to-2026-second-release](https://www.gov.uk/government/statistics/announcements/local-authority-revenue-expenditure-and-financing-england-2025-to-2026-second-release) |
| Tribunals statistics quarterly: July to September 2026 | 10 December 2026 9:30am | provisional | [tribunals-statistics-quarterly-july-to-september-2026](https://www.gov.uk/government/statistics/announcements/tribunals-statistics-quarterly-july-to-september-2026) |

To re-read before the next release, one command per slug (no key needed):

```bash
curl -s https://www.gov.uk/api/content/government/statistics/announcements/immigration-system-statistics-year-ending-december-2026 | python3 -c 'import json,sys;d=json.load(sys.stdin)["details"];print(d["display_date"],d["state"])'
```

Times: 09:30 is UK time. In November and February that is 09:30 UTC; on 27 May 2027 it is 08:30 UTC (BST). The refresh job's crons are in UTC.

## 2. The strict-freshness manifest entries

`scripts/audit/source-freshness.mjs` reads every file in `data/raw/manifests/`. A source with `nextEdition` is overdue the day after that date; a source with only `coverageEnd` and `maxAgeDays` is overdue when its newest data is older than the limit; `blockedOn` keeps an overdue source from failing `--strict`. Output on 3 November 2026, checked against the calendar above:

| Manifest | What the manifest holds, 3 Nov 2026 | Source and date for the next edition | Matches? | Action on release day |
|---|---|---|---|---|
| `uk_routes` | `nextEdition` 2026-11-30, derived by `nextEditionFrom()` in `scripts/lib/route-release.mjs` (last day of the month five months after the period end, deliberately a few days late) | Home Office, year ending September 2026, 26 Nov 2026 9:30am, confirmed (row 1 above) | Yes, by design: the grace runs to 30 Nov | None by hand. The fetch rewrites it to 2027-02-28 when it picks up the September 2026 files; 25 Feb 2027 is inside that |
| `asylum_finance` | `coverageEnd` 2026-06-30, `maxAgeDays` 155, so overdue from 3 Dec 2026 | Follows `uk_routes` (derived from the routes mart) | Yes | None; it moves when routes moves |
| `mhclg_homelessness` | `nextEdition` 2026-11-26, source the April to June 2026 announcement, checked 2 Nov 2026 (PR 148) | MHCLG, 26 Nov 2026 9:30am, confirmed (row 4) | Yes | **Must be edited on the day** (section 3). If it still reads 2026-11-26 the Monday 30 Nov run goes red, correctly |
| `moj_tribunals` | `nextEdition` 2026-12-10, written by `fetch-tribunals.mjs` from the MoJ release page | MoJ, 10 Dec 2026 9:30am, provisional | Yes | None on 26 Nov. Re-read the announcement on 9 Dec in case it moves |
| `small_boats` | `coverageEnd` 2026-10-30, `maxAgeDays` 10 | Weekly, Fridays; the Home Office announces no dates for it | n/a | None; the Monday run picks up Friday's file |
| `home_office_ara` | `nextEdition` 2027-07-31, hard-coded in `fetch-annual-report.mjs` | The Annual Report and Accounts is not a statistics release and has no calendar entry; 2025-26 was published 14 July 2026 | Placeholder, stated as "annual (July)" | None until July 2027 |
| `border_security` | `nextEdition` 2027-07-31, hard-coded in `fetch-border-security.mjs` | Border Security Command annual report data; no calendar entry; 2026 edition published 16 July 2026 | Placeholder | None until July 2027 |
| `dfe_send`, `dhsc_adult_social_care`, `ons_recorded_crime` | Overdue by 155, 398 and 103 days, each with `blockedOn` (no ingest script) | Not checked: they do not fail `--strict` and are not on the release path | n/a | None; a backlog item, not release work |
| Census, `snpp`, `newethpop`, `ons_births`, `dfe_schools`, `lancashire_cc`, `hotel_entities`, `regional_sources`, `census_ethnic_groups` | `no-cycle` | Not on a cycle the audit reads | n/a | None |

## 3. The housing panel files

The refresh job does **not** fetch these. They are downloaded by hand into `data/raw/mhclg_homelessness/`, then `npm run transform:housing` and `npm run audit:housing` (the independent Python reader, run with `uv`). Method and rules: `Asylumstats_Housing_Pressure_Design_2026-10-25.md` in Reports.

| File | Edition held (manifest, 3 Nov 2026) | Next edition | On 26 Nov 2026 |
|---|---|---|---|
| H-CLIC detailed local authority tables (`TA1`, `A2P`, `A2R`) | January to March 2026, `Statutory_Homelessness_Detailed_Local_Authority_Data_202603.ods` (released 13 August 2026, provisional) | April to June 2026, 26 Nov 2026 9:30am, confirmed | Download, bank with SHA-256, replace the file entry, set `coverageEnd` to 2026-06-30 |
| Rough sleeping snapshot (`Table_1_Total`) | Autumn 2025, `Rough_sleeping_snapshot_in_England__autumn_2025.ods` | Autumn 2026, February 2027, provisional | No change. **On 25 Feb 2027**: check whether it lands the same day |
| RO4 housing services outturn (`RO4_LA_Data_202526`, column DO) | 2025 to 2026, `RO4_LA_Data_2025-26_data_by_LA.ods` (published 17 September 2026) | The revenue outturn second release for 2025 to 2026 is announced for 10 Dec 2026 (provisional), described as updated provisional outturn estimates | No change. On 10 Dec check whether RO4 is reissued; if so, refresh then |

After the H-CLIC refresh, the `nextEdition` entry must move, because the date it holds has passed:

- If MHCLG has announced July to September 2026 by then: set `nextEdition` to that date, `nextEditionSource` to the announcement URL, `nextEditionCheckedAt` to the day, and rewrite `nextEditionNote`.
- If not: remove `nextEdition`, `nextEditionSource` and `nextEditionNote`, keep `coverageEnd` 2026-06-30 and `maxAgeDays` 200 (overdue from 17 January 2027), and say so in the commit message. No date is invented.

Then `npm test` (the cyclical source tests in `tests/source-freshness.test.mjs` cover housing) and `node scripts/audit/source-freshness.mjs <today> --strict`.

The England totals in the design note (135,580 households in temporary accommodation and the rest) are the January to March 2026 edition. Re-read the new ones from MHCLG's release text, not from a summary; local values are never summed to make them.

## 4. The "next update" line

`src/components/DataFreshness.astro` already takes an optional `nextUpdate` and prints "Next: 26 Nov 2026" after "Updated". Place pages do not pass it: `src/pages/places/[slug].astro` line 328 gives only `updated` (the data date, falling back to a hard-coded `"2026-06-30"`) and a `sourceUrl` that still points at the **year ending December 2025** release page. Explainers already print "Home Office quarterly statistics, next edition due by 30 Nov 2026" from the manifest.

Not built in this PR. What it should say, where a date is confirmed:

> Updated 30 Jun 2026 · Next: 26 Nov 2026 · Home Office · Corrections log

Rules for the line: show the announced date only when GOV.UK's state is `confirmed`; with a provisional date or none, show "due by" and the `uk_routes` derived date, as the explainers do; never a date that has passed (after the release and before the refresh lands, drop the line rather than show a past date). The `sourceUrl` should read `releasePage` from `data/raw/manifests/uk_routes.json` so it moves with each release. Build before 20 November so the pre-release check can see it live.

## 5. Explainer and headline figures to re-read on the day

Two kinds. Those read from the marts rewrite themselves when the refresh lands; check each against the new GOV.UK page. Those written by hand do not, and must be re-read against their source before saying the site is current.

Rewrite themselves (read the live page, compare with the GOV.UK summary page of the new release):

| Page | Figure | Compare with |
|---|---|---|
| `/explained/how-many-asylum-seekers-are-in-the-uk/` and the homepage | People on asylum support at the quarter end; in hotels | "How many people are in the UK asylum system?", new release |
| `/explained/how-many-asylum-seekers-are-waiting-for-a-decision/` | Claims awaiting an initial decision | Same release, asylum section |
| `/explained/uk-asylum-grant-rate/` | Initial grant rate, main applicants, grants over grants plus refusals | Same release. A test pins the 38% (year ending June 2026) and 48% (year ending June 2025) published rates: the new quarter will need the test's expected values moved by hand, from the published figure |
| `/explained/how-many-small-boats-have-crossed-this-year/` | Year to date | The weekly time series; unchanged by the quarterly |
| Every place page, `/cost/`, county and region pages | People on support, rate per 10,000, rank, contingency count, priced subtotal | `regional-and-local-authority-dataset` for the new quarter (Asy_D11, Reg_02) |

Written by hand in `src/lib/official-figures.ts` (do not refresh themselves):

| Constant | Figure | Re-read |
|---|---|---|
| `COST_PER_NIGHT` | Hotel and other accommodation cost per night, from ministers' letters to the Home Affairs Committee | Any new letter since the last release |
| `SUPPORT_RATES` | £49.18 a week standard, £9.95 catered and the extras | GOV.UK "Asylum support: what you'll get" |
| `ASYLUM_DISPERSAL_GRANT` | £1,200 per eligible person, 2026 to 2027 | The funding instruction page |
| `HOTEL_SITE_COUNTS` | Hotels in use, with dates | Any newer ministerial statement |

The true-cost page (`src/content/findings/true-cost-of-asylum.md`, `src/lib/true-cost.ts`) is built on the 2025-26 accounts and HMRC's 2025-26 taxpayer projection. A quarterly release does not change its total; it does change the "people on support" and mean supported population quoted in its prose (97,519 and 106,719). Check those two against the new release before the day closes.

## 6. The refresh job's three outcomes

`.github/workflows/refresh-data.yml` runs Monday 08:00 UTC and Thursday 12:00 and 16:00 UTC, or on dispatch. One red cross covers three separate things, and they must be read separately. On 26 October, twice on 29 October and on 2 November 2026 the run was red while the data had been committed and deployed each time; only the strict audit failed (run step outcomes read with `gh run view <id> --json jobs` on 3 November 2026). The 3 November site audit read those runs as failing before the data was saved; that reading was wrong.

| Outcome | Step | How to read it | What it means if it failed |
|---|---|---|---|
| 1. Data committed | "Test the refreshed data" then "Commit and push updated data" | Both `success`. A commit on main titled `data: refresh tribunal + route + small boats + hotel + money data <date>` | Tests failed: data parked on a `data/refresh-failed-*` branch and a `refresh-failed` issue opened; live keeps the last data that passed. "Only run timestamps moved" in "Check for data changes" means the release was not yet found, and nothing is committed |
| 2. Deploy dispatched | "Deploy the refreshed data", then a separate `deploy.yml` run | Step `success`, and a `deploy.yml` run started by `workflow_dispatch` that ends `success` | Deploy failed: a `deploy-failed` issue. Live is behind main |
| 3. Strict audit | "Fail if a source is past its next edition", and "Fail if a secondary source was skipped" | Both `success` | A source is past its next edition (read the step log for its name), or hotels, regional sources, Home Office spend or asylum finance did not run. Data from outcome 1 is already live; this is a warning, not a lost release |

Commands:

```bash
gh run list --repo tompickup23/asylumstats --workflow refresh-data.yml --limit 3
```

```bash
gh run view <run id> --repo tompickup23/asylumstats --json jobs --jq '.jobs[].steps[] | select(.conclusion != "skipped") | "\(.name): \(.conclusion)"'
```

```bash
gh run list --repo tompickup23/asylumstats --workflow deploy.yml --limit 3
```

No repository secrets were set on 3 November 2026; the job uses only the built-in `GITHUB_TOKEN`.

## 7. Who does what

### Before the day

| When | Who | Step |
|---|---|---|
| By 20 Nov | Claude | The Monday and Thursday runs after PR 148: confirm all three outcomes green |
| By 20 Nov | Claude builds, Tom merges | The "next update" line and the place-page `sourceUrl` (section 4) |
| 25 Nov | Claude | Re-read every row of section 1; a moved date changes this runbook first |
| 25 Nov | Claude | Local dry run: `npm ci`, `npm test`, `node scripts/audit/source-freshness.mjs 2026-11-26 --strict` |
| 25 Nov | Tom | Say in chat whether Claude may dispatch the refresh on the day, or whether Tom will |

### On the day (times UK)

| Time | Who | Step |
|---|---|---|
| 09:30 | Claude | Confirm the release is up: the release page `immigration-system-statistics-year-ending-september-2026` and the regional and local authority dataset for September 2026 on the data tables page (June's file was `regional-and-local-authority-dataset-jun-2026.ods`) |
| 09:35 | Tom, or Claude on Tom's yes given that morning | Dispatch the refresh: `gh workflow run refresh-data.yml --repo tompickup23/asylumstats --ref main`. The 12:00 UTC cron is the fallback, then 16:00 UTC; schedules run late |
| 09:35 | Claude | Download the H-CLIC April to June 2026 tables, bank them, update the manifest (section 3), `npm run transform:housing`, `npm run audit:housing`, `npm test`; open a PR |
| 10:00 | Claude | Visa expiry outcomes: read the release by hand (no fetch script exists). Note in the release-day log what it counts (visas expiring, by outcome: departure evidenced, further leave, no record) and the period. Nothing goes on `/routes/` until Tom has agreed the line; it is a new series with no earlier edition since 2020 on the same basis |
| 10:00 to 10:30 | Claude | Read the three outcomes (section 6) and report each separately |
| After deploy | Claude | Re-read the section 5 figures on the live site against GOV.UK; spot-check five place pages (Glasgow, Birmingham, Burnley, Hillingdon, Middlesbrough) against the local authority table |
| After deploy | Tom | Merge the housing PR, which deploys it |
| After deploy | Claude | If any figure on the live site differs from the source: record it in the corrections log only with the primary table quoted, then tell Tom; never edit a figure on an agent's say-so |
| End of day | Claude | Release-day note in Reports: `Website_Audits/log/`, with the three outcomes, timings and anything left |

Tom alone: the go-ahead to dispatch, merges, and anything said publicly about the release. Claude does not post, send or announce.

### After the day

- Monday 30 November: the scheduled run should be green on all three outcomes. Red on outcome 3 with `mhclg_homelessness` named means section 3's manifest step was missed.
- 10 December: tribunals and the revenue outturn second release (sections 1 and 3).

## 8. Reuse

For 25 February 2027 and 27 May 2027, replace: the period (`year-ending-september-2026` to `december-2026`, then `march-2027`), the file suffix (`-sep-2026`), the H-CLIC quarter, and the dates in sections 1 and 7. Re-read section 1 live and record the new access date; do not carry these dates forward. In February, also check the rough sleeping snapshot (section 3). On 27 May the release is at 08:30 UTC.

Sources for this runbook: the GOV.UK Content API announcements listed in section 1 (accessed 3 November 2026, 12:26 UTC); `data/raw/manifests/*.json` and `node scripts/audit/source-freshness.mjs 2026-11-03` at main `5fcef0a`; GitHub Actions runs 40345186332, 40926919200, 40952132262 and 41496925178; [PR 148](https://github.com/tompickup23/asylumstats/pull/148).
