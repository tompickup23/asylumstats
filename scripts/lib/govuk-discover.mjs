/**
 * Find the current version of a GOV.UK statistics file.
 *
 * Every dataset this site uses sits at a URL containing both a release period and a
 * media hash, so a hardcoded link goes stale at the next release and keeps working,
 * silently, on old data. That is not hypothetical here:
 *
 *   fetch-routes.mjs held eight dec-2025 URLs months after the mar-2026 release, so
 *   `npm run ingest:routes` would have re-fetched December 2025 and the routes manifest
 *   still described files that were no longer the ones the site used.
 *
 *   The small boats statistical-data-set URL has been dead since February 2023.
 *
 * So: name the stable part of the filename, name the page that lists it, and let the
 * code find the newest. Throw rather than fall back, because a silent fallback is how
 * the stale fetch went unnoticed for months.
 */

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

/**
 * Sortable key from a filename's trailing period.
 *
 * Naming is not consistent on GOV.UK: alongside `-mar-2026` there is `-jun-24` with a
 * two-digit year, and the same series switched from .ods to .xlsx for one quarter. Both
 * are handled; anything unparseable sorts last rather than being silently treated as
 * old, so a new convention shows up as "not found" instead of quietly picking a
 * three-year-old file.
 */
export function periodKey(fileName) {
  const match = fileName
    .toLowerCase()
    .match(/-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-(\d{2}|\d{4})(?=[.-]|$)/);
  if (!match) return null;
  const [, month, rawYear] = match;
  const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  return year * 100 + MONTHS[month];
}

/** Every .xlsx/.ods asset linked from a GOV.UK page. */
export async function listDataFiles(pageUrl) {
  const response = await fetch(pageUrl, { headers: { "user-agent": "asylumstats-data-fetch" } });
  if (!response.ok) throw new Error(`${pageUrl} returned ${response.status}`);
  const html = await response.text();
  const urls = [
    ...html.matchAll(
      /https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"' ]+\.(?:xlsx|ods)/gi
    )
  ].map((match) => match[0]);
  return [...new Set(urls)].map((url) => ({
    url,
    fileName: decodeURIComponent(url.split("/").pop())
  }));
}

/**
 * The newest file whose name starts with `stem`.
 *
 * Returns { url, fileName, periodKey }. Throws if nothing matches, naming the page, so
 * a layout or naming change is loud.
 */
export function newestMatching(files, stem) {
  const candidates = files
    .filter((file) => file.fileName.toLowerCase().startsWith(stem.toLowerCase()))
    .map((file) => ({ ...file, periodKey: periodKey(file.fileName) }))
    .filter((file) => file.periodKey !== null)
    .sort((a, b) => b.periodKey - a.periodKey);
  return candidates[0] ?? null;
}

export async function discover(pageUrl, stem) {
  const files = await listDataFiles(pageUrl);
  const newest = newestMatching(files, stem);
  if (!newest) {
    throw new Error(
      `No file starting "${stem}" with a parseable period on ${pageUrl}. ` +
        `The page listed ${files.length} data files; the naming convention has probably changed.`
    );
  }
  return newest;
}
