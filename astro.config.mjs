import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://asylumstats.co.uk",
  vite: {
    plugins: [tailwindcss()]
  }
});
