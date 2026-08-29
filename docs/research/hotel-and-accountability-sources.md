# Hotel and accountability sources

This is the most important product expansion beyond a standard asylum statistics site.

The evidence split is:

- official national statistics on people in hotels and overall accommodation
- official committee, audit, and media sources on cost and contractor performance
- local authority statements, FOIs, planning cases, and parliamentary references that identify named hotel sites or unnamed hotel counts in specific places

## Current anchor facts

### National asylum accommodation and hotel use

| Fact | Date | Why it matters | Source |
| --- | --- | --- | --- |
| `107,200` people were receiving asylum support at the end of `December 2025` | 2026-02-26 | Core top-line accommodation pressure metric | https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-december-2025-summary-of-latest-statistics |
| `31,000` of them were in hotel accommodation, or about `29%` | 2026-02-26 | Hotel dependence headline | https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-december-2025-summary-of-latest-statistics |
| Around `64,000` people were awaiting an initial asylum decision at the end of `December 2025` | 2026-02-26 | Shows how decision delays keep accommodation numbers high | https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-december-2025-summary-of-latest-statistics |
| There were `197` asylum hotels in use as of `2026-01-05` | 2026-01-23 | Best current official count of hotels in use | https://publications.parliament.uk/pa/cm5901/cmselect/cmhaff/541/report.html |
| The number was more than `400` in summer `2023` | 2026-01-23 | Useful for decline-over-time framing | https://publications.parliament.uk/pa/cm5901/cmselect/cmhaff/541/report.html |

### Costs, contracts, and waste

| Fact | Date | Why it matters | Source |
| --- | --- | --- | --- |
| Hotels housed `35%` of asylum accommodation users but drove `76%` of annual accommodation contract cost in the first seven months of `2024/25` | 2024-11-08 | Strongest accountability ratio in the market | https://www.nao.org.uk/reports/investigation-into-asylum-accommodation/ |
| The 10-year accommodation contract forecast rose from `GBP 4.5 billion` to `GBP 15.3 billion` | 2024-11-08 | Shows scale of procurement drift | https://www.nao.org.uk/reports/investigation-into-asylum-accommodation/ |
| Hotel use averaged `GBP 5.77 million` per day in `2024/25`, down from `GBP 8.3 million` in `2023/24` | 2025-06-12 | Useful for cost clock and improvement claims | https://homeofficemedia.blog.gov.uk/2025/06/12/factsheet-asylum-accommodation-and-support/ |
| The Home Office planned to end hotel use but continued to rely on it heavily after backlog and estate pressures | 2024-11-08 onward | Supports promise-vs-reality tracker | https://www.nao.org.uk/reports/investigation-into-asylum-accommodation/ |

### Contractors

| Fact | Date | Why it matters | Source |
| --- | --- | --- | --- |
| Mears, Serco, and Clearsprings are the regional providers under the current asylum accommodation contracts | current contract structure | Lets the site map provider geography and accountability | https://www.gov.uk/government/news/new-asylum-accommodation-contracts-awarded |

## Local authority and regional counts

| Fact | Date | Why it matters | Source |
| --- | --- | --- | --- |
| Latest public local-authority release remained year ending `September 2025` | 2025-11-27 | Confirms local release lag versus national publication | https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas |
| Highest support counts in that release were Glasgow `3,777`, Birmingham `2,832`, Liverpool `2,358`, Hillingdon `2,345`, and Manchester `2,108` | 2025-11-27 | Ready-made ranking and compare-page seed | https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas |
| North West had the highest regional total and North East the highest rate per 10,000 in the March 2025 release | 2025-05-22 | Useful for regional comparison narrative | https://www.gov.uk/government/statistics/data-on-asylum-and-resettlement-in-local-authority-areas-year-ending-march-2025 |

## Named and unnamed hotel evidence examples

This is not a comprehensive list. It is a starter ledger showing the types of public evidence available.

| Area | Site or count | Evidence type | Date | Notes | Source |
| --- | --- | --- | --- | --- | --- |
| Epping Forest | Bell Hotel and Phoenix Hotel named publicly | local authority legal and public statements | 2025-07-30 | Strong example of current named-site evidence | https://www.eppingforestdc.gov.uk/open-joint-letter-to-the-home-secretary/ |
| Wakefield | Cedar Court Hotel named publicly | council leader statement | 2025-08-20 | Example of named current site with council dispute context | https://www.wakefield.gov.uk/your-district/wakefield-council-statement-on-future-of-cedar-court-hotel |
| Spelthorne | Stanwell Hotel named publicly | council statement | 2025-10-30 | Named site with strong local policy response | https://www.spelthorne.gov.uk/news/2025/spelthorne-borough-council-calls-constructive-action-stanwell-hotel-use |
| Perth and Kinross | `2` hotels, `191` people, names not given | public reporting on council position | 2025-08-14 | Good example of public count without site names | https://www.pkc.gov.uk/article/24758/Asylum-seekers |
| West Northamptonshire | `3` hotels, names not given | local authority public statement | 2025-08-21 | Useful secrecy-gap example | https://www.westnorthants.gov.uk/news/council-takes-first-steps-towards-planning-action-over-asylum-hotels |
| East Lindsey | `1` hotel, name not given | local authority public statement | 2025-08-20 | Another place with count but limited detail | https://www.e-lindsey.gov.uk/article/27439/Response-to-Home-Office-announcement-that-it-will-use-a-hotel-in-the-district-for-asylum-contingency-accommodation |
| Rushcliffe | Belvoir Hotel named | FOI publication | 2023-04-05 | Historic named-site evidence | https://www.whatdotheyknow.com/request/asylum_seekers_housed_in_rushcli_2 |
| Coventry | Quality Hotel, Allesley Hotel, Novotel named historically | FOI publication | 2024-06-03 | Good historic sample of closed sites | https://www.whatdotheyknow.com/request/asylum_seekers_hotels_2#incoming-2663596 |
| Gatwick area | Copthorne Hotel named in Parliamentary Question | parliamentary question reference | 2026-02-05 | Lower-confidence category if not otherwise confirmed by authority | https://questions-statements.parliament.uk/written-questions/detail/2026-02-05/28968 |

## Product implication

The hotel tracker should not pretend to have one perfect official list. It should instead expose three parallel views:

- `official national hotel use`
- `publicly identified named sites`
- `place-level sightings where hotel use is confirmed but names are withheld`

That makes the secrecy gap visible instead of letting it disappear into methodology notes.

## Production rules

- Every named-site row must carry a confidence label.
- Use `named_current`, `named_historical`, `unnamed_count_only`, and `parliamentary_reference` as evidence classes.
- Prefer council statements, planning papers, FOI responses, parliamentary material, and public inquiry documents over newspaper-only sourcing.
- If only media coverage exists, mark the row as provisional until stronger evidence is found.

## Correction, 29 August 2026

Seven of the local and contract source URLs in this file were wrong, and wrong in a
specific way: they did not point at pages that had been withdrawn, they pointed at pages
that never existed. Each had zero captures in the Internet Archive on exact match, on an
index that holds the neighbouring URL space on the same hosts densely, and none was in
the UK Government Web Archive either. Two were structurally impossible: Wakefield has
never used a `/council-information/news/` path and Cornwall has no `/housing/homelessness/`
path.

The underlying stories were all real. The URLs have been repointed to the genuine pages,
each verified as HTTP 200 and read to confirm it supports the claim made against it. The
dates and source titles that travelled with the fabricated URLs moved with them, because
they described the page that did not exist.

Three claims are NOT settled by that repointing and are still open:

- The Perth and Kinross headcount of `191`. The council page confirms two hotels and
  gives no number. The figure is not from this source.
- The Wakefield sighting was described as "contingency" accommodation. Cedar Court is an
  asylum hotel; the contingency hotel in that district was Hotel St Pierre, Newmillerdam.
- West Northamptonshire's three sites are named in press reporting, not in the council
  statement now cited, which confirms three hotels without naming them.

Anything sourced out of this file before 29 August 2026 should be re-checked against the
page it actually cites.
