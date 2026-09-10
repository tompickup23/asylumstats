/**
 * When the official release behind each page was published.
 *
 * This exists for one caller, the sitemap's `lastmod`, and the rule it follows is the
 * whole reason it is not a one-liner. Google uses lastmod to decide what to recrawl and
 * assesses whether to trust it at domain level: Gary Illyes has described the signal as
 * binary, "we either trust it or not". Stamping build time on every URL is therefore
 * worse than publishing none, because a crawler that learns the field is noise on 400
 * pages stops reading it on the forty where it was telling the truth, and that is not
 * quickly recoverable.
 *
 * So every date here is the publication date of the government release the page renders,
 * read from the fetch manifests, which the ingestion scripts rewrite each time they pull
 * a new one. A page whose release date cannot be derived gets no lastmod at all rather
 * than a guess. That is why `/spending/` and `/entities/` are absent: the Home Office
 * transparency files carry no publication date in their manifest, only the period they
 * cover, and a coverage period is not the day the page changed.
 */
import ukRoutes from "../../data/raw/manifests/uk_routes.json";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function releaseDate(manifest: { releaseDate?: string | null }): string | null {
  const value = manifest.releaseDate;
  return typeof value === "string" && ISO_DATE.test(value) ? value : null;
}

/**
 * Home Office immigration system statistics: the quarterly release every page built on
 * local authority asylum counts is showing. Currently year ending June 2026, published
 * 27 August 2026.
 */
export const ROUTES_RELEASE_DATE = releaseDate(ukRoutes);

/** The newest of a set of ISO dates, ignoring nulls. Null when there are none. */
export function newestDate(...dates: Array<string | null | undefined>): string | null {
  const valid = dates.filter((d): d is string => typeof d === "string" && ISO_DATE.test(d));
  return valid.length ? valid.sort().at(-1)! : null;
}
