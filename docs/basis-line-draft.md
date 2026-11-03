# Draft: basis line under the true-cost headline

Status: **draft for Tom's sign-off. Not on the site.** Nothing in this file is built or deployed. Drafted 3 November 2026 through the fact-check protocol (`/fact-check`); every figure below is quoted from the document itself, with its page.

Where it would go: `src/content/findings/true-cost-of-asylum.md`, as the first paragraph under the H1 "What asylum costs: £197 per income taxpayer a year, in a range of £178 to £215", above the dated correction notes (PR 147 moves those notes below the answer; this line should land after PR 147 to avoid a conflict).

## The line

**Recommended (two sentences):**

> The audited Home Office figure is £4,181 million, its 2025-26 outturn for asylum support, resettlement and accommodation (Home Office Annual Report and Accounts 2025-26, HC 440, page 207). The £7.8 billion adds £182 million of other audited Home Office spending, £657 million attributed from Border Force and Immigration Enforcement, £175 million of published tribunal and legal aid costs and £2,626 million of our own estimates, chiefly post-decision welfare and family reunion; Full Fact's "about £105 per taxpayer" (16 February 2026) is a different year and a narrower measure: £4 billion of Home Office asylum support spend in 2024/25 over that year's projected income taxpayers.

**Shorter alternative:**

> £4,181 million of this is audited Home Office spending on asylum support, resettlement and accommodation in 2025-26 (HC 440, page 207); the rest is other departments' costs and our estimates, shown below. Full Fact's "about £105 per taxpayer" (16 February 2026) is £4 billion of Home Office asylum support spend in 2024/25, a different year and a narrower measure.

**Optional like-for-like clause** (the 3 November site audit, section 7E, asked for it): "On this page's denominator, the audited Home Office figure alone is £105 per income taxpayer." That is £4,181 million over 39.8 million, which gives £105.05; it is a derived figure (basis `derived`, inputs named), and it happens to equal Full Fact's rounded figure for a different year and measure. Tom's call whether that coincidence helps or invites a misreading.

Arithmetic: 4,181 + 182 + 657 + 175 + 2,626 = 7,821, the page's central total in £ million. The 182 is the Border Security Command line (£181.6 million), the only other audited row; the page's own table gives audited £4,363M, attributed £657M, published £175M, estimated £2,626M.

## The three sources, quoted

### 1. Home Office audited figure: £4,181 million

Home Office (2026) *Annual Report and Accounts 2025 to 2026*, HC 440, published 14 July 2026. File `36.54_HO_ARA_25-26_WEB.pdf`, SHA-256 `c8cda7ee5f28700b4a2174b3889cb203c410503c60222e6a03102d92642c1350` (matches `data/raw/manifests/home_office_ara.json`). Available at: https://assets.publishing.service.gov.uk/media/6a58e9953ae256c99b702f50/36.54_HO_ARA_25-26_WEB.pdf (Accessed 3 November 2026).

Printed page 207 (PDF page 212), "Notes to the Statement of Parliamentary Supply 2025-26 (£000s)", "SoPS 1.1. Analysis of resource outturn by estimate line" (the heading is on printed page 206, the row on 207). Row as printed:

> F [estimate line letter] Asylum Support, Resettlement and Accommodation ... 4,181,193 ... 4,512,568

4,181,193 is the total resource outturn in £000s for 2025-26; 4,512,568 is the restated 2024-25 outturn. A count of: pounds of net resource spending by the business group, not people or nights.

### 2. The site's £7.8 billion and £197

The page itself, `src/content/findings/true-cost-of-asylum.md` (updated 24 October 2026) and `src/lib/true-cost.ts`:

> The total annual cost of the UK asylum system is around **£7.8 billion**, or **£197 per income taxpayer**.

> | **Audited** | An outturn line in the Home Office accounts, examined by the National Audit Office | £4,363M | 56% |

Categories by basis in `COST_CATEGORIES`: audited (ASRA, Border Security Command); attributed (Immigration Enforcement and Border Force asylum shares); published (tribunals and courts £115M, legal aid £60M); estimated (post-decision welfare £924M, family reunion £500M, modern slavery support £340M, ESOL and integration £250M, healthcare £222M, education £140M, translation £125M, local authority unfunded costs £125M). Denominator `UK_TAXPAYERS = 39_800_000`, HMRC Income Tax liabilities statistics (15 July 2026), Table 2.1, the 2025-26 projection. Year: 2025-26 throughout.

### 3. Full Fact: £4 billion and about £105 per taxpayer

Full Fact (2026) *This comparison of asylum support, benefit fraud and tax avoidance costs is still wrong*, Hannah Smith, 16 February 2026. Available at: https://fullfact.org/economy/asylum-seeker-benefits-tax-avoidance-comparison/ (Accessed 3 November 2026; raw HTML read, not a summary).

Verdict box:

> The government spent approximately £4 billion on asylum support in 2024/25, equivalent to about £105 per taxpayer.

Body:

> The Home Office's annual report and accounts for 2024/25 show that spending on asylum support, resettlement and accommodation totalled £4 billion, down from £4.7 billion the previous financial year.

> Based on the government's projections for the number of income tax payers in 2024/25, this equates to approximately £105 per taxpayer

Its denominator, from the same page: "the latest government figures project approximately 39 million income taxpayers in 2025/26, an increase from 38 million in 2024/25". £4 billion over 38 million is £105.3.

### What Full Fact's £4 billion is

Full Fact links the 2024-25 accounts at page 82 of the PDF. Read on 3 November 2026: Home Office (2025) *Annual Report and Accounts 2024 to 2025*, `HO_ARA_2024-25_Book_WEB_Final_v3+CorrSlip.pdf`, SHA-256 `7be88cfa2f8176d977b660db558da24d37a5df5decbc5f2328831b5ad2b1cf4b`. Available at: https://assets.publishing.service.gov.uk/media/688c9785a34b939141463e37/HO_ARA_2024-25_Book_WEB_Final_v3+CorrSlip.pdf (Accessed 3 November 2026).

- Printed page 74 (PDF 82), Resource DEL by business group: "Asylum Support, Resettlement and Accommodation ... 4.57 ... 4.51" (budget and actual, £ billions).
- Printed page 75 (PDF 83), the asylum section: "Asylum support spend was £4.0 billion compared to £4.7 billion in 2023-24."

So the £4 billion is the narrower "asylum support spend" sentence on page 75, not the £4.51 billion business-group line on page 74 that Full Fact's wording names. The draft line therefore calls it "Home Office asylum support spend", in the accounts' words, and does not say Full Fact misdescribed it. The 2025-26 accounts restate 2024-25 for the same business group at £4,513 million, which agrees with page 74.

## Rule-of-three status

| Figure | Primary | Independent analyst | Corroborating outlet |
|---|---|---|---|
| £4,181M, 2025-26 | HC 440 page 207, read from the PDF | Not found on 3 Nov 2026 (WebSearch, one query) | Not found |
| £4 billion, 2024/25 asylum support spend | HO ARA 2024-25 page 75, read from the PDF | Full Fact, 16 Feb 2026, read raw | A written parliamentary answer giving £4.0 billion for 2024/25 appeared in search (Westminster Brief archive, PQ 95897); **not read verbatim**, so not relied on |
| £105 per taxpayer | Full Fact's own figure, quoted as theirs | n/a (it is the analyst) | n/a |
| £7.8bn, £197 | The site's own published composition; its inputs are in the page's notes | Not applicable: it is the site's estimate and the line says so | n/a |

The line attributes each figure to its source rather than asserting it, which is what the protocol allows where only the primary is held.

## Checks before it goes live

1. Tom signs off the wording (recommended, shorter, with or without the like-for-like clause).
2. Land after PR 147, as the first paragraph under the H1.
3. Run `/present-check` on the line; the page is the site's most read.
4. Build, then `tests/rendered-text-dashes` (the line has no dashes).
5. No corrections-log entry is needed: no published figure changes.
