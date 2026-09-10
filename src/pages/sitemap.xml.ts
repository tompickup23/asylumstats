import type { APIRoute } from "astro";
import { buildAbsoluteUrl, getIndexableSitePaths, getPublicPlaceAreas, buildPlacePath } from "../lib/site";
import { getCollection } from "astro:content";
import { ROUTES_RELEASE_DATE, newestDate } from "../lib/data-releases";
import { parseCorrections } from "../lib/corrections-parse";
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

  // lastmod where a real date exists, and nowhere else. A sitemap that stamps every URL
  // with today's date teaches a crawler that the dates mean nothing, which is worse than
  // having none: the point of lastmod is to tell it which of 471 pages is worth refetching,
  // and the trust decision is made once for the whole domain. Every date below is either
  // the publication date of the government release the page renders or the date the piece
  // itself was written or revised. No build times. See src/lib/data-releases.ts.
  //
  // changefreq and priority are deliberately absent: Google ignores both entirely.
  const lastmod = new Map<string, string>();

  // Every page whose figures come out of the Home Office quarterly release changed on the
  // day that release was published, and changes again on the next one. That is a real
  // per-record date rather than a build stamp: it comes from the fetch manifest, so it
  // only moves when the underlying data does. Pages built on data with no published
  // release date, and the editorial pages, are deliberately left without one.
  if (ROUTES_RELEASE_DATE) {
    const routeDriven = [
      "/places/", "/places/counties/", "/national/", "/regional/", "/compare/", "/routes/"
    ];
    for (const path of routeDriven) lastmod.set(path, ROUTES_RELEASE_DATE);
    for (const area of getPublicPlaceAreas()) lastmod.set(buildPlacePath(area), ROUTES_RELEASE_DATE);
    for (const path of paths) {
      if (path.startsWith("/places/counties/") || path.startsWith("/places/regions/")) {
        lastmod.set(path, ROUTES_RELEASE_DATE);
      }
    }
  }

  // A superseded article declares another page canonical, so listing it here would ask
  // search engines to index a URL we have just told them is not the canonical one.
  const findings = (await getCollection("findings")).filter((f) => !f.data.superseded_by);
  for (const finding of findings) {
    const path = `/findings/${finding.id.replace(/\.md$/, "")}/`;
    paths.push(path);
    const changed = finding.data.updated ?? finding.data.date;
    if (changed) lastmod.set(path, changed);
  }
  if (!paths.includes("/findings/")) paths.push("/findings/");

  const newestFinding = newestDate(...findings.map((f) => f.data.updated ?? f.data.date));
  if (newestFinding) lastmod.set("/findings/", newestFinding);

  // The homepage carries the release KPIs and the newest findings, so it changed on
  // whichever of the two is later.
  const homeChanged = newestDate(newestFinding, ROUTES_RELEASE_DATE);
  if (homeChanged) lastmod.set("/", homeChanged);

  const newestRelease = newestDate(...releases.map((r) => r.date));
  if (newestRelease) lastmod.set("/releases/", newestRelease);

  // /corrections/ collects every dated correction from two places, and this reads the same
  // two so the date cannot drift from the page: the inline "Correction, <date>." leads in
  // the findings, and the release-diary entries the page selects by title.
  const newestCorrection = newestDate(
    ...findings.flatMap((f) => parseCorrections(f.body ?? "").map((c) => c.date)),
    ...releases.filter((r) => /correction|withdraw|recalibrat/i.test(r.title)).map((r) => r.date)
  );
  if (newestCorrection) lastmod.set("/corrections/", newestCorrection);

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
