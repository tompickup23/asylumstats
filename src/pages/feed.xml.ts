import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { SITE_NAME, SITE_URL, DEFAULT_DESCRIPTION, buildAbsoluteUrl } from "../lib/site";
import releases from "../data/site/releases.json";

export const prerender = true;

/**
 * /feed.xml, RSS 2.0 over the findings and the release diary.
 *
 * The site had no feed at all, which for a statistics publisher is the one syndication
 * mechanism that costs nothing and is read by everything: aggregators, newsreaders, the
 * other sites in the estate, and anyone who wants to know when a Home Office release has
 * been ingested without checking the site.
 *
 * Findings and releases are interleaved by date rather than published as two feeds. A
 * reader following this wants to know when something changed, and "the model was
 * recalibrated" is the same kind of event to them as "here is a new finding".
 */

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** RFC 822, which is what RSS 2.0 requires and ISO dates are not. */
function rfc822(date: string): string {
  return new Date(`${date}T09:00:00Z`).toUTCString();
}

export const GET: APIRoute = async () => {
  const findings = (await getCollection("findings")).filter((f) => !f.data.superseded_by);

  const items = [
    ...findings.map((finding) => ({
      date: finding.data.updated ?? finding.data.date,
      title: finding.data.headline,
      description: finding.data.summary,
      link: buildAbsoluteUrl(`/findings/${finding.id.replace(/\.md$/, "")}/`),
      category: "Finding"
    })),
    ...releases.map((release) => ({
      date: release.date,
      title: release.title,
      description: release.summary,
      link: buildAbsoluteUrl("/releases/"),
      category: "Release"
    }))
  ]
    .filter((item) => item.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 50);

  const body = items
    .map(
      (item) =>
        `    <item>\n` +
        `      <title>${escapeXml(item.title)}</title>\n` +
        `      <link>${escapeXml(item.link)}</link>\n` +
        `      <guid isPermaLink="false">${escapeXml(`${item.link}#${item.date}`)}</guid>\n` +
        `      <pubDate>${rfc822(item.date)}</pubDate>\n` +
        `      <category>${escapeXml(item.category)}</category>\n` +
        `      <description>${escapeXml(item.description)}</description>\n` +
        `    </item>`
    )
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n` +
      `  <channel>\n` +
      `    <title>${escapeXml(SITE_NAME)}</title>\n` +
      `    <link>${SITE_URL}</link>\n` +
      `    <description>${escapeXml(DEFAULT_DESCRIPTION)}</description>\n` +
      `    <language>en-GB</language>\n` +
      `    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />\n` +
      `${body}\n` +
      `  </channel>\n` +
      `</rss>\n`,
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } }
  );
};
