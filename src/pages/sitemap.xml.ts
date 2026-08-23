import type { APIRoute } from "astro";
import { buildAbsoluteUrl, getIndexableSitePaths } from "../lib/site";
import { getCollection } from "astro:content";
import releases from "../data/site/releases.json";

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
  // lastmod where a real date exists, and nowhere else. A sitemap that stamps every URL
  // with today's date teaches a crawler that the dates mean nothing, which is worse than
  // having none: the point of lastmod is to tell it which of 463 pages is worth refetching.
  const lastmod = new Map<string, string>();

  const findings = (await getCollection("findings")).filter((f) => !f.data.superseded_by);
  for (const finding of findings) {
    const path = `/findings/${finding.id.replace(/\.md$/, "")}/`;
    paths.push(path);
    const changed = finding.data.updated ?? finding.data.date;
    if (changed) lastmod.set(path, changed);
  }
  if (!paths.includes("/findings/")) paths.push("/findings/");

  const newestFinding = [...lastmod.values()].sort().at(-1);
  if (newestFinding) {
    lastmod.set("/findings/", newestFinding);
    lastmod.set("/", newestFinding);
  }
  const newestRelease = releases.map((r) => r.date).sort().at(-1);
  if (newestRelease) lastmod.set("/releases/", newestRelease);

  const urlEntries = paths
    .map((path) => {
      const changed = lastmod.get(path);
      return (
        `  <url>\n    <loc>${escapeXml(buildAbsoluteUrl(path))}</loc>` +
        (changed ? `\n    <lastmod>${escapeXml(changed)}</lastmod>` : "") +
        `\n  </url>`
      );
    })
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
