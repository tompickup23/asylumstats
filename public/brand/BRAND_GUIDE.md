# Asylum Stats brand

This site is one of five in a shared visual system, along with UK Food Hygiene Ratings,
UK Demographics, UK Elections and UK School Holiday Dates. The five share everything
except an accent triple and a glyph.

The full specification, the reasoning behind each decision and the generator that
produces every asset live in the private clawd repository at
`briefings/uk-network-brand/BRAND-SYSTEM-2026-08-23.md`. What follows is the short form.

## Mark

Two columns, one taller. A plain comparison of two quantities, which is the job. It
replaced a radar scanner in August 2026: the guide that used to sit in this file
described that mark as "actively monitoring data points" with "orange blips = alerts",
and a surveillance-and-alarm metaphor on a site publishing official statistics about
people seeking asylum undercuts the credibility the numbers depend on.

`icon.svg` for light grounds, `icon-light.svg` for the dark ground.

## Colour

| Token | Hex | Use |
|---|---|---|
| accent deep | `#2f5773` | links, headings, rules, the mark on white |
| accent bright | `#82abcb` | the mark and the URL on the dark ground |
| accent wash | `#eef3f7` | stat tiles and card hovers |
| ground | `#0f1317` | every social and Open Graph surface |
| text | `#171b1f` | body and headings |
| page | `#ffffff` | the page |

The hue sits at 205, deliberately spaced from the other four sites. It replaced a cyan
that sat 27 degrees from the food hygiene green and did too little work in a system where
hue is the only differentiator.

Every pairing that carries text is computed rather than eyeballed, and asserted in
`tests/brand-contrast.test.mjs`.

## Type

Source Serif 4 at 600 for display, Source Sans 3 at 400 and 600 for everything else. Both
are SIL Open Font License, self-hosted, latin and latin-ext only. Figures are lining and
tabular throughout: every page here is a column of numbers.

## Header

The accent is a 4px rule along the top of the header, never a fill behind it. A solid
brand-coloured bar pushes a public-data site towards looking like an official scheme.
