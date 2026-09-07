# Audit corrections, September 2026 — resume plan

State at archive: **7 September 2026**. Branch `fix/audit-corrections-2026-09-07`,
three commits, working tree clean, [PR #95](https://github.com/tompickup23/asylumstats/pull/95)
**open and unmerged**, `validate` CI green.

Merging deploys to production, so the nine fixes below are not live yet.

## What is done

| # | Defect | Where |
|---|---|---|
| 1 | `/national/` published 93 areas below 50% WBI by 2051 against 86 elsewhere | `national.astro` now reads `areasBelowFiftyBy` |
| 2 | "about 60% audited" where the table gives 55% (63% with attributed) | `BY_BASIS` derives it; both figures stated |
| 3 | £5.77M/day 2024/25 hotel figure as an undated `h1` | period read from `periodLabel` |
| 4 | Bare interpolated crossing years | `whiteBritishCrossingRange` sensitivity bands |
| 5 | Release diary missing the September work | two entries added |
| 6 | `/national/` ethnic chart aggregated the raw key set (74.5% vs 74.4%) | `nationalGroupShare`; page no longer imports the JSON |
| 7 | Birth count published as a fertility rate ("66% more births") | corrected in generator, output, finding and methodology |
| 8 | 2061 count taken over 269 areas, printed beside a 318-area count | `areasScored` exposed and printed |
| 9 | fflate 0.7.4 ZIP64 infinite loop (Dependabot #62) | `overrides` bump to ^0.7.5 |

Each has a test. The two that mattered most — #1 and #6 — are guarded by rules
rather than by pinned numbers, so a new page that derives either metric itself
will fail rather than drift.

## Pick up here

**Two live defects, agreed real, both in `src/content/findings/birmingham-demographic-transformation.md`:**

1. The summary credits TFR differentials (Pakistani 2.52 vs White British 1.31)
   with driving the projection. The model does not use TFRs — it runs on
   Census-derived child-woman ratios. `src/data/live/fertility-rates.json` says
   CWRs "NOT hardcoded TFRs"; `methodology.astro` says "CWRs (not these TFRs)".
   Fix as for the fertility-deprivation finding in commit `0d28f81`: state what
   the model actually does, keep what the data supports, add a dated correction.
2. "The true outcome sits between the two." Model agreement does not bracket
   truth — both models can share a bias, and here they did, which is why the
   v8.0 recalibration moved Birmingham's 2051 share from 10.7% to 14.9%.

## Decisions waiting on Tom

Not defects. Deliberately left alone because they are editorial calls:

- **Rename "The true cost of asylum"?** The attribution-vs-counterfactual
  section is in; the headline stands. The case for renaming: a £1.5bn range with
  13% average-attributed is a comprehensive central estimate, not "the true
  cost".
- **Round long-horizon shares?** Crossing years carry ranges now; the 2051 share
  point estimates do not (Blackburn still reads 24.6%).
- **Provenance badges** beside headline numbers, rather than on the methodology
  page.
- **Split the demographic product from the asylum product.**

## Larger work

- **A versioned data build** that fails deploy when a metric differs across
  pages. This is the audit's own priority 1 and the real fix for the class of
  bug behind #1, #6 and #8. Targeted tests now cover the two metrics that broke;
  there is no general mechanism, so the next divergence will be silent.
- **A second holdout or rolling-origin validation.** Every 2051 figure rests on
  one decade of testing, and shrinkage K=25 and the 1.65 growth ceiling were
  chosen on that same test, which makes 1.56pp a development-set score rather
  than a clean one.

## Not done, and not claimed

The audit's "audit all other v7/v8 values". A test blocks the specific withdrawn
figures from coming back, but no full sweep of published numbers against the
recalibration has been run.

## Two audit claims that failed checking

Do not re-raise without re-checking:

- *"Release diary still shows v7.0, 14 April 2026."* False — v8.0 dated 23 Aug
  is live and top of the page. The audit read a stale search cache.
- *"+14.6pp is the more favourable presentation."* The article gives the all-105
  figure (+14.0pp) in summary and body, names the 101/105 construction, and
  carries a correction note.

Also rejected on our side: noindexing the superseded `true-grant-rate-appeals`
finding. It has rel=canonical to its successor and is already out of the sitemap
and search index; noindex would contradict the canonical and throw away the
ranking consolidation `tests/superseded-findings.test.ts` documents as deliberate.

## One thing about the local test run

`anonymity`, `rendered-text-runons` and `support-vs-accommodation` each walk all
486 built pages against a 5s timeout. They fail on a loaded machine and pass on a
quiet one. If they go red, rebuild clean and rerun before believing them.

## One passenger commit in the PR

`a10a31f docs: merge AGENTS.md into CLAUDE.md, symlink AGENTS.md` is **not part
of this work**. It was sitting on local `main` unpushed when this branch was cut,
so it came along and now rides in PR #95, which is why the diff touches
`CLAUDE.md` and `AGENTS.md`.

It looks intentional and probably wants to land anyway, so nothing was done to
it. But it is Tom's commit, not this session's, and merging #95 merges it too.
To land it separately instead: push it to `main` first, then rebase this branch.
