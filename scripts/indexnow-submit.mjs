/**
 * Tell IndexNow which canonical URLs this deploy actually changed.
 *
 *   node scripts/indexnow-submit.mjs --changed          diff the built sitemap against the live one
 *   node scripts/indexnow-submit.mjs --sitemap          URLs whose lastmod is on or after --lastmod
 *   node scripts/indexnow-submit.mjs --url <absolute>   submit named URLs
 *
 * `--changed` is what CI uses, and it is the only mode that cannot over-report. It reads
 * dist/sitemap.xml, fetches the sitemap the live site is still serving, and submits the
 * URLs that are new or whose lastmod moved. It therefore has to run BEFORE the deploy
 * replaces the live sitemap, which is why the workflow calls it from the build job.
 *
 * The mode it replaces in CI, `--sitemap` with the cutoff defaulting to today, could not
 * do this job once the sitemap started carrying real release dates. lastmod on a place
 * page is the day the Home Office published the release, not the day this site ingested
 * it, and those are days apart: the year ending June 2026 release was published on
 * 27 August and ingested on 4 September. A cutoff of "today" matches neither, so the one
 * event worth announcing, 426 place pages changing at once, was the event it would miss.
 * `--sitemap` is kept for manual use where you know the date you mean.
 */
import process from "node:process";
import { readFile } from "node:fs/promises";

const SITE_URL = "https://asylumstats.co.uk";
const KEY = "c0d15baf467d49dcab4b9849a77a0fb6";
const BUILT_SITEMAP = "dist/sitemap.xml";

await submitIndexNow({ siteUrl: SITE_URL, key: KEY, args: process.argv.slice(2) });

async function submitIndexNow({ siteUrl, key, args }) {
  if (process.env.INDEXNOW_SUBMIT !== "1") {
    console.log("IndexNow disabled (set INDEXNOW_SUBMIT=1 after a successful production deploy).");
    return;
  }

  const urls = args.includes("--changed")
    ? await changedAgainstLive(siteUrl)
    : args.includes("--sitemap")
      ? await urlsChangedSince(
          `${siteUrl}/sitemap.xml`,
          option(args, "--lastmod") ?? new Date().toISOString().slice(0, 10)
        )
      : values(args, "--url");

  if (!urls.length) {
    console.log("IndexNow: no canonical URLs changed in this deploy.");
    return;
  }
  if (urls.length > 10_000 || urls.some((url) => new URL(url).origin !== siteUrl)) {
    throw new Error("IndexNow accepts at most 10,000 same-host canonical URLs per notification.");
  }

  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(siteUrl).host, key, keyLocation: `${siteUrl}/${key}.txt`, urlList: urls }),
  });
  if (!response.ok) throw new Error(`IndexNow rejected ${urls.length} URLs: HTTP ${response.status}`);
  console.log(`IndexNow notified of ${urls.length} changed canonical URL${urls.length === 1 ? "" : "s"}.`);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function values(args, name) {
  return args.flatMap((arg, index) => arg === name && args[index + 1] ? [args[index + 1]] : []);
}

/** loc -> lastmod (empty string where the URL carries none). */
function parseSitemap(xml) {
  const entries = new Map();
  for (const [, loc, lastmod] of xml.matchAll(
    /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?\s*<\/url>/g
  )) {
    entries.set(loc.replaceAll("&amp;", "&"), lastmod ?? "");
  }
  return entries;
}

async function urlsChangedSince(sitemapUrl, cutoff) {
  const response = await fetch(sitemapUrl);
  if (!response.ok) throw new Error(`Could not read ${sitemapUrl}: HTTP ${response.status}`);
  return [...parseSitemap(await response.text())]
    .filter(([, lastmod]) => lastmod && lastmod >= cutoff)
    .map(([loc]) => loc);
}

async function changedAgainstLive(siteUrl) {
  const built = parseSitemap(await readFile(BUILT_SITEMAP, "utf8"));

  // A first deploy, or a site that is briefly unreachable, must not turn into a
  // submission of every URL on it. Announce nothing rather than announce everything.
  let live;
  try {
    const response = await fetch(`${siteUrl}/sitemap.xml`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    live = parseSitemap(await response.text());
  } catch (error) {
    console.log(`IndexNow: could not read the live sitemap (${error.message}); submitting nothing.`);
    return [];
  }
  if (live.size === 0) {
    console.log("IndexNow: the live sitemap parsed to no URLs; submitting nothing.");
    return [];
  }

  // New URLs, and URLs whose lastmod moved. A URL that carries no lastmod on either side
  // is skipped: there is nothing to compare, and submitting it every deploy would be the
  // noise IndexNow asks publishers not to send.
  const changed = [];
  for (const [loc, lastmod] of built) {
    if (!live.has(loc)) changed.push(loc);
    else if (lastmod && lastmod !== live.get(loc)) changed.push(loc);
  }
  return changed;
}
