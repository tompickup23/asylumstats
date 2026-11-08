export interface RoutesManifest {
  periodSlug?: string | null;
  releaseDate?: string | null;
  releasePage?: string | null;
  nextEdition?: string | null;
}

export interface ReleaseAnnouncement {
  document_type?: string;
  details?: { state?: string; release_timestamp?: string };
  redirects?: Array<{ destination?: string }>;
}

const QUARTERS = ["march", "june", "september", "december"];

function dataDate(manifest: RoutesManifest): string | undefined {
  // periodSlug names the quarter covered by the data. releaseDate is publication day.
  const match = /^(march|june|september|december)-(\d{4})$/.exec(manifest.periodSlug ?? "");
  if (!match) return undefined;
  return new Date(Date.UTC(Number(match[2]), (QUARTERS.indexOf(match[1]) + 1) * 3, 0))
    .toISOString().slice(0, 10);
}

function validDate(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

/** Derive the following quarter from the manifest, never from today's calendar. */
export function announcementUrl(manifest: RoutesManifest): string | undefined {
  const end = dataDate(manifest);
  if (!end) return undefined;
  const next = new Date(end);
  next.setUTCMonth(next.getUTCMonth() + 3, 1);
  const month = next.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" }).toLowerCase();
  return `https://www.gov.uk/api/content/government/statistics/announcements/immigration-system-statistics-year-ending-${month}-${next.getUTCFullYear()}`;
}

/** One bounded request per build, shared by all place pages. No manifest is written. */
export function createAnnouncementLoader(fetchImpl: typeof fetch = fetch) {
  const requests = new Map<string, Promise<ReleaseAnnouncement | undefined>>();
  return (manifest: RoutesManifest): Promise<ReleaseAnnouncement | undefined> => {
    const url = announcementUrl(manifest);
    if (!url) return Promise.resolve(undefined);
    if (!requests.has(url)) {
      requests.set(url, (async () => {
        try {
          const response = await fetchImpl(url, {
            headers: { "user-agent": "asylumstats-data-fetch" },
            signal: AbortSignal.timeout(5000)
          });
          if (response.ok) return await response.json() as ReleaseAnnouncement;
        } catch {
          // An unavailable announcement cannot establish a confirmed date.
        }
        return undefined;
      })());
    }
    return requests.get(url)!;
  };
}

export const loadPlaceAnnouncement = createAnnouncementLoader();

export function placeFreshness(
  manifest: RoutesManifest,
  snapshotDate: string | null | undefined,
  announcement?: ReleaseAnnouncement,
  now = new Date()
) {
  const updated = validDate(snapshotDate) ? snapshotDate : dataDate(manifest);
  if (!updated) throw new Error("Place freshness needs a snapshot date or a data period in the uk_routes manifest.");
  if (!manifest.releasePage) throw new Error("Place freshness needs releasePage in the uk_routes manifest.");

  const result: {
    updated: string;
    published?: string;
    sourceUrl: string;
    nextUpdate?: string;
    nextUpdateLabel?: "Next:" | "Next: due by";
    nextUpdateExpiresAt?: string;
  } = { updated, sourceUrl: manifest.releasePage };
  // The data date is the end of the period covered; publication comes about two months later.
  // Showing only the first made a current page read as four months old.
  if (validDate(manifest.releaseDate)) result.published = manifest.releaseDate;

  // GOV.UK may redirect an announcement to the statistics once they are published.
  const publicationPath = announcementUrl(manifest)?.replace("https://www.gov.uk/api/content", "").replace("/announcements/", "/");
  const publishedRedirect = announcement?.document_type === "redirect" && publicationPath
    && announcement.redirects?.some((redirect) => redirect.destination === publicationPath);
  if (publishedRedirect || announcement?.document_type === "statistics" || announcement?.details?.state === "published") return result;

  const details = announcement?.details;
  const timestamp = details?.release_timestamp;
  const confirmed = details?.state === "confirmed" && !!timestamp
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)
    && validDate(timestamp.slice(0, 10)) && Number.isFinite(Date.parse(timestamp));
  if (confirmed) {
    // Do not fall back to the later grace date between publication and our refresh.
    if (Date.parse(timestamp) <= now.getTime()) return result;
    result.nextUpdate = timestamp.slice(0, 10);
    result.nextUpdateLabel = "Next:";
    result.nextUpdateExpiresAt = timestamp;
  } else if (validDate(manifest.nextEdition)) {
    // The derived deadline is a whole UK calendar day. A local midnight also handles BST.
    const expires = new Date(`${manifest.nextEdition}T00:00:00Z`);
    expires.setUTCDate(expires.getUTCDate() + 1);
    const ukHour = Number(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23"
    }).format(expires));
    expires.setUTCHours(expires.getUTCHours() - ukHour);
    if (expires.getTime() <= now.getTime()) return result;
    result.nextUpdate = manifest.nextEdition;
    result.nextUpdateLabel = "Next: due by";
    result.nextUpdateExpiresAt = expires.toISOString();
  }
  return result;
}
