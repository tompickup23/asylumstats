import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://asylumstats.co.uk",
  // The slug said 109 while the page said 86.
  //
  // That count was withdrawn on 13 August 2026 and the page carries the correction, but
  // the URL kept publishing the retracted number to anyone reading a link rather than a
  // page. It is renamed to match what the page says. The old path is cited, so it is not
  // being deleted: in a static build Astro emits an HTML page at the old URL that
  // redirects and sets a canonical, which is what a static host can honour.
  redirects: {
    "/findings/109-areas-minority-wbi-2051": "/findings/86-areas-minority-wbi-2051",
    "/findings/109-areas-minority-wbi-2051/": "/findings/86-areas-minority-wbi-2051/"
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
