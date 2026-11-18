# Rendered figure manifest

`npm run build` writes `dist/figures.json` after Astro finishes. Each row records a
marked figure that actually appears in the built HTML: `page`, `metricKey`,
`value`, `basis` and `sourceUrl`, plus `displayValue` and `displayDecimals`.
Repeated appearances produce repeated rows.
There are no locally fetched inputs and no timestamp or machine path in the output.

The first scope is the initial grant rate, national asylum support, people in
hotels, small boat arrivals this year, and each place's supported count and rate.
Markers cover homepage headline cards and top-place rows, the national overview,
every place's two headline tiles, explainer answer figures and hub cards, hotel
population key figures, and the support explainer's place rows. Historical charts,
prose, metadata, search results and interactive comparison panels are outside this
first pass. This is a deliberately limited draft, not a census of every statistic.

`src/lib/figure-manifest.ts` supplies keys and provenance. Rendering callers pass
the value they display, using the existing shared data loaders and headline
helpers. The collector checks the visible leaf element against that value at its
stated precision. A missing marker on any place headline, a missing national
metric, an uncollected marker or a missing manifest fails the built-site tests.

Values preserve their stored precision. For example, the grant-rate headline may
round to a whole percent while its detail row shows one decimal. Both rows retain
the same underlying value, and their rendered text is checked at each declared
precision. Rates keep their stored values and render at one decimal. Null remains
null and must display as `n/a`; it never becomes zero.

The guard also rejects different displayed values at the same precision. It
accepts both existing JavaScript rounding methods when collecting rows so the
manifest is still written when their displays disagree; the guard then names the
conflicting pages. Different declared precision is not treated as a drift.

The guard fails if one key has different values or different bases, including on
the same page. Keys for place measures include the ONS area code. Bases name the
measure and reference period. Count statistics use `published_statistic`, because
these counts are neither spending transactions nor audited accounts. Calculated
rates use `derived`, naming numerator and denominator. This extends the vocabulary
for non-monetary statistics without changing the spending basis rule. No bases
are combined, summed or converted into a common financial total.

The guard also re-reads the built HTML and compares it with the saved manifest.
Its regression fixtures prove that a changed value, a changed basis at the same
value, and a mismatch between metadata and visible text are all rejected.

## Existing calculations left alone

The shared initial grant rate and weekly boats total already come through
`src/lib/headline-figures.ts`. Support and hotel counts come through
`src/lib/route-data.ts`; place rates are fields in its mart, not recalculated here.

Other page-level calculations remain outside this draft: `regional.astro` sums
local supported counts into `totalAsylum`; `compare.astro` calculates contingency
shares, rankings and distributions; `places/index.astro` calculates mean support
per authority; and the homepage ranks areas and computes shares and historical
route comparisons. They have not been refactored or treated as interchangeable
with the national support headline. Their inclusion needs explicit metric keys
and bases before extending this manifest.

## Validation

Run `npm test`, `npm run check`, `npm run build`, then
`npx vitest run tests/figures-manifest.test.ts` and the other built-site guards.
Both CI workflows run the manifest guard after the build. Unit tests skip the
built-site section when no build exists.

## Current draft blockers

The first build detects three existing display disagreements at one decimal:
Birmingham is 18.1 in the support explainer and 18.2 on its place page; Manchester
is 25.6 in the explainer and 25.7 on its place page; Rugby is 45.1 on the homepage
and 45.2 on its place page. The stored values agree. The different output comes
from `toFixed(1)` and `toLocaleString` rounding. No published figure has been
changed. The guard deliberately fails until a separately authorised presentation
change reconciles these displays. Do not merge this draft with that failure.
