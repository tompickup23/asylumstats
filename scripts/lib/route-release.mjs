/**
 * Which Home Office quarterly release the route data came from, and how to cite it.
 *
 * The Home Office publishes the whole asylum corpus four times a year, and every part of
 * a citation moves at once: the filename (`-mar-2026` to `-jun-2026`), the media URL and
 * its hash, the release page (`year-ending-march-2026` to `year-ending-june-2026`) and
 * the publication date. Before this module those five things were written out by hand in
 * transform-routes.mjs, nine times over.
 *
 * That was already half-broken. fetch-routes.mjs discovers the newest file, but the
 * transform opened `...-mar-2026.ods` by name, so on the morning of the next release the
 * two would disagree: in CI a fresh checkout would fail with ENOENT (which is how the
 * 10 August refresh died), and on a machine that still had the old file on disk it would
 * quietly transform the previous quarter while the manifest claimed the new one. The
 * site would have shown March data under a June headline.
 *
 * So the period is read from the files that were actually fetched, and everything else
 * is derived from it. Nothing here needs editing at a release.
 */

import { readFileSync } from "node:fs";
import { periodParts } from "./govuk-discover.mjs";

const RELEASE_BASE =
  "https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-";
const CONTENT_API =
  "https://www.gov.uk/api/content/government/statistics/immigration-system-statistics-year-ending-";

/** The release page for a quarter, e.g. ...year-ending-june-2026. */
export function releasePageUrl(slug) {
  return `${RELEASE_BASE}${slug}`;
}

/**
 * A section of the release, e.g. .../year-ending-june-2026/how-many-people-claim-asylum-in-the-uk.
 * Sections whose home is the standing statistical data set rather than the quarterly
 * release pass an absolute URL instead, and get it back untouched.
 */
export function releaseSectionUrl(slug, section) {
  if (!section) return null;
  if (section.startsWith("https://")) return section;
  return `${RELEASE_BASE}${slug}/${section}`;
}

/**
 * The date a quarter was published, from GOV.UK's own content API.
 *
 * `first_published_at` on the release page is the release moment (2026-05-21 for year
 * ending March 2026, 2026-02-26 for December 2025). The page's `public_updated_at` is
 * not: pages get revised weeks later, and the data tables page last moved on 10 June for
 * a May release. Taking the wrong one would date every chart on the site incorrectly.
 */
export async function fetchReleaseDate(slug, { fetchImpl = fetch } = {}) {
  const url = `${CONTENT_API}${slug}`;
  const response = await fetchImpl(url, { headers: { "user-agent": "asylumstats-data-fetch" } });
  if (!response.ok) {
    throw new Error(
      `Release page for ${slug} returned ${response.status} (${url}). ` +
        "The files were found but the release they belong to was not, so their " +
        "publication date cannot be established. Refusing to guess it."
    );
  }
  const body = await response.json();
  const published = body.first_published_at;
  if (!published) {
    throw new Error(`No first_published_at for ${slug} at ${url}.`);
  }
  return String(published).slice(0, 10);
}

/**
 * When to start complaining that a release has been missed.
 *
 * A quarter is published about two months after the period it covers: the year ending
 * March 2026 landed on 21 May, and the year ending June 2026 is calendared for 27 August.
 * So the next one is due around five months after the current period end, and this
 * returns the last day of that month: deliberately a few days late, so an on-time
 * release never trips the alarm and a genuinely missed one always does.
 *
 * Derived rather than written down, because a hardcoded next-edition date is the same
 * maintenance burden as the hardcoded URLs this module exists to remove.
 */
export function nextEditionFrom(period) {
  const endOfMonth = new Date(Date.UTC(period.year, period.month + 5, 0));
  return endOfMonth.toISOString().slice(0, 10);
}

/**
 * The fetched files, keyed by the source id fetch-routes.mjs recorded.
 *
 * Throws rather than returning an empty map: a transform running against a manifest that
 * does not exist means nobody fetched anything, and reading whatever is on disk is how
 * a stale quarter survives a release.
 */
export function readRoutesManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Cannot read ${manifestPath}: ${error.message}. ` +
        'Run "npm run fetch:routes" before transforming routes.'
    );
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error(`${manifestPath} lists no files. Re-run "npm run fetch:routes".`);
  }
  return manifest;
}

/**
 * Look up one fetched file and work out which release it belongs to.
 *
 * Each file carries its own period rather than inheriting a single release-wide one.
 * They normally move together, but the local authority dataset sits on a different page
 * from the other eight, and a quarter where one lags should cite the release it actually
 * came from rather than the one its neighbours came from.
 */
export function resolveSource(manifest, sourceId) {
  const entry = manifest.files.find((file) => file.sourceId === sourceId);
  if (!entry) {
    throw new Error(
      `No file for "${sourceId}" in the routes manifest. It lists: ` +
        `${manifest.files.map((file) => file.sourceId).join(", ")}.`
    );
  }
  const period = periodParts(entry.fileName);
  if (!period) {
    throw new Error(
      `Cannot read a period from "${entry.fileName}" (${sourceId}). ` +
        "GOV.UK has changed its filename convention; scripts/lib/govuk-discover.mjs " +
        "needs to learn the new one before this file can be cited."
    );
  }
  if (!entry.releaseDate) {
    throw new Error(
      `No releaseDate for "${sourceId}" in the routes manifest. It predates release ` +
        'provenance being recorded; re-run "npm run fetch:routes" so every citation ' +
        "names the release it came from."
    );
  }
  return { ...entry, period };
}
