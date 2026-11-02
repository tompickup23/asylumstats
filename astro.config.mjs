import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { buildPlacePath } from "./src/lib/site-identity.ts";

// Place pages were served at /places/<area code>/ until 11 April 2026 (commit 4dded5f),
// and internal links kept pointing at code URLs until October 2026, so Google still
// holds them and Search Console reports them as 404. One static redirect per area code,
// built from the routes mart (the same data the place pages are built from) and pointed
// through buildPlacePath, so the target is always the page that exists. Every area code
// in the mart's history up to April 2026 is present in the current mart.
const routeAreas = JSON.parse(
  readFileSync(new URL("./data/marts/uk_routes/local-route-latest.json", import.meta.url), "utf8")
).areas;
const areaCodeRedirects = Object.fromEntries(
  routeAreas.map((area) => [`/places/${area.areaCode}`, buildPlacePath(area)])
);

// Pages removed in April 2026 that Search Console still reports as 404. Each points at
// the nearest current page on the same subject. /hotels went on 10 April 2026; its
// question is now answered by the hotels explainer. The five demographic findings were
// deleted on 11 April 2026 (commit 5774d91).
const removedPageRedirects = {
  "/hotels": "/explained/how-many-asylum-hotels-are-there/",
  "/findings/blackburn-minority-white-british-2028": "/findings/blackburn-minority-wb-2027/",
  "/findings/five-councils-minority-wb-by-2050": "/findings/86-areas-minority-wbi-2051/",
  "/findings/cohort-component-projections-318-areas": "/findings/86-areas-minority-wbi-2051/",
  "/findings/census-decade-white-british-decline": "/findings/shift-share-what-drives-change/",
  "/findings/stochastic-projections-confidence": "/methodology/"
};

export default defineConfig({
  site: "https://asylumstats.co.uk",
  // The slug said 109 while the page said 86.
  //
  // That count was withdrawn on 13 August 2026 and the page carries the correction, but
  // the URL kept publishing the retracted number to anyone reading a link rather than a
  // page. It is renamed to match what the page says. The old path is cited, so it is not
  // being deleted: in a static build Astro emits an HTML page at the old URL that
  // redirects and sets a canonical, which is what a static host can honour.
  // Four more slugs renamed on 31 August 2026, for the same reason as the 109 above:
  // each one had a figure baked into the URL, and every one of those figures has since
  // moved. A slug that states a number will always rot, so the replacements state the
  // subject instead. Blackburn is the exception: its slug said 2028 while every line of
  // the page said 2027, so it was wrong on the day it was published.
  //
  // One entry per path. trailingSlash is unset, so Astro treats "/x" and "/x/" as the
  // same route and a pair of entries was a route collision, ten warnings per build and
  // a hard error in a later Astro. The slash form of each URL still redirects, and the
  // targets carry the slash so the hop lands on the page rather than on a second redirect.
  redirects: {
    "/findings/109-areas-minority-wbi-2051": "/findings/86-areas-minority-wbi-2051/",
    "/findings/blackburn-minority-wb-2028": "/findings/blackburn-minority-wb-2027/",
    "/findings/backlog-64k-awaiting-decision": "/findings/backlog-awaiting-decision/",
    "/findings/small-boats-41k-2025": "/findings/small-boats-arrivals/",
    "/findings/daily-hotel-cost-5-77m": "/findings/daily-hotel-cost/",
    ...removedPageRedirects,
    ...areaCodeRedirects
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Never inline fonts as data: URIs.
      //
      // Vite inlines assets under ~4 kB, which caught one variable-font subset and
      // emitted it into BaseLayout's CSS as `data:font/woff2;base64,...`. The site's
      // CSP sets `font-src 'self'`, so the browser blocked it on every single page
      // load and silently fell back to a system font. It was visible only as a console
      // error, which is why it survived.
      //
      // Loosening the CSP to `font-src 'self' data:` would also have fixed it, but this
      // keeps the stricter policy and fixes the cause: emitted as a file, the font is
      // same-origin and loads normally. Everything else may still inline.
      assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined)
    }
  }
});
