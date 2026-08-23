/**
 * Which MOJ tribunal release the appeals data came from, and how to cite it.
 *
 * The same fault the routes pipeline had until #62, in a second pipeline. Release title,
 * period label, publication date, next edition date and both asset URLs were written by
 * hand into fetch-tribunals.mjs, and the ODS filename was written a second time into
 * transform-tribunals.mjs. On 10 September 2026 the fetcher would have pulled the April to
 * June files and the transform would have opened `..._Q4_2025_26.ods` by name: ENOENT on a
 * fresh CI checkout, or a silent transform of the previous quarter on a machine that still
 * had the old file. The site would have shown January to March data under a June headline.
 *
 * So the release is discovered from GOV.UK and everything else derives from it. Nothing
 * here needs editing at a release.
 */

const COLLECTION = "https://www.gov.uk/api/content/government/collections/tribunals-statistics";
const CONTENT_API = "https://www.gov.uk/api/content";

const QUARTERS = [
  { coverage: "January to March", periodOffset: -1, quarter: 4, endMonth: 3 },
  { coverage: "April to June", periodOffset: 0, quarter: 1, endMonth: 6 },
  { coverage: "July to September", periodOffset: 0, quarter: 2, endMonth: 9 },
  { coverage: "October to December", periodOffset: 0, quarter: 3, endMonth: 12 },
];

/** "January to March 2026" -> the financial-year quarter label MOJ publishes on. */
export function periodLabelFor(coverage, calendarYear) {
  const quarter = QUARTERS.find((q) => q.coverage === coverage);
  if (!quarter) throw new Error(`Unrecognised tribunal coverage "${coverage}".`);
  const startYear = calendarYear + quarter.periodOffset;
  return `Q${quarter.quarter} ${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** The quarter that follows this one. */
export function nextPeriod(coverage, calendarYear) {
  const index = QUARTERS.findIndex((q) => q.coverage === coverage);
  if (index < 0) throw new Error(`Unrecognised tribunal coverage "${coverage}".`);
  const next = QUARTERS[(index + 1) % QUARTERS.length];
  return { coverage: next.coverage, year: index === QUARTERS.length - 1 ? calendarYear + 1 : calendarYear };
}

/**
 * When the next edition is expected.
 *
 * GOV.UK does not carry a next-release date for this series in its content API, so this is
 * derived, not announced: MOJ has published on the second Thursday of the third month after
 * the quarter ends for most of the last two years. It has slipped, twice and badly (April to
 * June 2024 landed on 3 October 2024, October to December 2025 on 15 May 2026), so treat
 * this as the date the freshness alarm should start asking rather than a commitment. That is
 * the right behaviour for an alarm: it should nag when a release is late.
 */
export function expectedPublicationDate(coverage, calendarYear) {
  const quarter = QUARTERS.find((q) => q.coverage === coverage);
  if (!quarter) throw new Error(`Unrecognised tribunal coverage "${coverage}".`);
  let month = quarter.endMonth + 3;
  let year = calendarYear;
  if (month > 12) {
    month -= 12;
    year += 1;
  }
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstThursday = 1 + ((4 - first.getUTCDay() + 7) % 7);
  const secondThursday = firstThursday + 7;
  return `${year}-${String(month).padStart(2, "0")}-${String(secondThursday).padStart(2, "0")}`;
}

async function getJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { "user-agent": "asylumstats-data-fetch" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
  return response.json();
}

/**
 * The newest quarterly tribunal release, with the two files this site parses.
 *
 * Ordered by the period the release covers, not by GOV.UK's public_updated_at. A page gets
 * revised weeks after publication, and October to December 2025 was published after July to
 * September 2025 but covers an earlier quarter, so sorting by either timestamp puts the
 * wrong release first.
 */
export async function discoverLatestTribunalRelease({ fetchImpl = fetch } = {}) {
  const collection = await getJson(COLLECTION, fetchImpl);
  const documents = collection?.links?.documents ?? [];

  const releases = [];
  for (const document of documents) {
    const match = /^\/government\/statistics\/tribunals-statistics-quarterly-([a-z]+)-to-([a-z]+)-(\d{4})$/.exec(
      document.base_path ?? ""
    );
    if (!match) continue;
    const coverage = `${match[1][0].toUpperCase()}${match[1].slice(1)} to ${match[2][0].toUpperCase()}${match[2].slice(1)}`;
    const year = Number(match[3]);
    const quarter = QUARTERS.find((q) => q.coverage === coverage);
    if (!quarter) continue;
    releases.push({ basePath: document.base_path, coverage, year, sortKey: year * 100 + quarter.endMonth });
  }

  if (!releases.length) {
    throw new Error(
      `No quarterly tribunal releases found in ${COLLECTION}. The collection exists but nothing ` +
        "matched the release slug pattern, which means GOV.UK has restructured it. Refusing to guess."
    );
  }

  releases.sort((a, b) => b.sortKey - a.sortKey);
  const latest = releases[0];

  const page = await getJson(`${CONTENT_API}${latest.basePath}`, fetchImpl);
  const attachments = page?.details?.attachments ?? [];

  const findAttachment = (pattern, label) => {
    const found = attachments.find((a) => pattern.test(a.title ?? "") && (a.url ?? "").startsWith("https://"));
    if (!found) {
      throw new Error(
        `No ${label} attachment on ${latest.basePath}. Titles present: ` +
          attachments.map((a) => JSON.stringify(a.title)).join(", ") +
          ". The release was found but its files were not, so refusing to fetch a partial release."
      );
    }
    return found.url;
  };

  const published = page?.first_published_at;
  if (!published) throw new Error(`No first_published_at on ${latest.basePath}.`);

  const following = nextPeriod(latest.coverage, latest.year);

  return {
    title: `Tribunal Statistics Quarterly: ${latest.coverage} ${latest.year}`,
    coverage: `${latest.coverage} ${latest.year}`,
    periodLabel: periodLabelFor(latest.coverage, latest.year),
    publishedDate: String(published).slice(0, 10),
    releasePage: `https://www.gov.uk${latest.basePath}`,
    mainTablesUrl: findAttachment(/^Main Tables/i, "Main Tables"),
    csvsUrl: findAttachment(/CSV Files/i, "CSV Files"),
    nextEditionCoverage: `${following.coverage} ${following.year}`,
    nextEditionDate: expectedPublicationDate(following.coverage, following.year),
    nextEditionIsExpected: true,
  };
}
