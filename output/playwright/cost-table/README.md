# Cost table review captures

Captured locally on 25 October 2026 from this feature branch. These are review evidence, not visual regression baselines.

The table captures show `/cost/` at widths of 390 and 1440 CSS pixels. Each place capture shows its complete cost section at those same widths. The sticky header was placed in normal document flow for the section captures so it could not obscure a tall image. No content was hidden. Source drawers were also opened to check for page overflow at both widths.

| Page | Mobile | Desktop |
| --- | --- | --- |
| Cost table | [Mobile](cost-mobile.png) | [Desktop](cost-desktop.png) |
| Burnley | [Mobile](burnley-mobile.png) | [Desktop](burnley-desktop.png) |
| Hillingdon | [Mobile](hillingdon-mobile.png) | [Desktop](hillingdon-desktop.png) |
| Braintree | [Mobile](braintree-mobile.png) | [Desktop](braintree-desktop.png) |
| Glasgow City | [Mobile](glasgow-city-mobile.png) | [Desktop](glasgow-city-desktop.png) |

`check-interactions.js` records the dated browser check of all eight numeric sort directions, missing values sorting last, the four requested place searches, Torbay, an empty result and reset. `capture-place.js` captures the current place page and checks overflow with its source drawer closed and open. Both are functions for Playwright CLI's `run-code` command, not scripts that send or publish anything.

The local preview used port 4323 because another worktree occupied 4322. The required Playwright suites use `PLAYWRIGHT_PORT=4323` to select this branch's preview.
