import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://asylumstats.co.uk",
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
