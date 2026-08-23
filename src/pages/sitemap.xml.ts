import type { APIRoute } from "astro";
import { buildAbsoluteUrl, getIndexableSitePaths } from "../lib/site";
import { getCollection } from "astro:content";

export const prerender = true;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const GET: APIRoute = async () => {
  const paths = getIndexableSitePaths();

  // Add findings
  // A superseded article declares another page canonical, so listing it here would ask
  // search engines to index a URL we have just told them is not the canonical one.
  const findings = (await getCollection("findings")).filter((f) => !f.data.superseded_by);
  for (const finding of findings) {
    paths.push(`/findings/${finding.id.replace(/\.md$/, "")}/`);
  }
  if (!paths.includes("/findings/")) paths.push("/findings/");

  const urlEntries = paths
    .map((path) => `  <url>\n    <loc>${escapeXml(buildAbsoluteUrl(path))}</loc>\n  </url>`)
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`,
    {
      headers: {
        "Content-Type": "application/xml; charset=utf-8"
      }
    }
  );
};
