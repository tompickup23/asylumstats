/**
 * Publications by other bodies that cite the site (src/data/site/citations.json).
 * Read by /cited-by/ and by the Organization node's subjectOf. tests/citations.test.ts
 * checks that every cited page and anchor still exists, so a citation keeps landing
 * where its author's figures came from. Same shape of record as UK Demographics keeps.
 */
import raw from "../data/site/citations.json";

export interface CitationCopy {
  publisher: string;
  title: string;
  url: string;
  note: string;
  linked: boolean;
}

export interface Citation {
  id: string;
  title: string;
  publisher: string;
  datePublished: string;
  url: string;
  location: string;
  used: string;
  nameUsed: string;
  linked: boolean;
  asPath: string;
  asLabel: string;
  checked: string;
  checkedNote: string;
  alsoIn: CitationCopy[];
}

export const CITATIONS: Citation[] = [...(raw.citations as Citation[])].sort((a, b) =>
  b.datePublished.localeCompare(a.datePublished)
);

/** schema.org nodes for Organization.subjectOf: each citing article, and any outlet carrying a copy. */
export function citationSubjectOf(siteUrl: string): Record<string, unknown>[] {
  return CITATIONS.flatMap((c) => [
    {
      "@type": "NewsArticle",
      headline: c.title,
      url: c.url,
      datePublished: c.datePublished,
      publisher: { "@type": "NewsMediaOrganization", name: c.publisher },
      citation: `${siteUrl}${c.asPath}`
    },
    ...c.alsoIn.map((copy) => ({
      "@type": "NewsArticle",
      headline: copy.title,
      url: copy.url,
      datePublished: c.datePublished,
      publisher: { "@type": "Organization", name: copy.publisher },
      isBasedOn: c.url,
      citation: `${siteUrl}${c.asPath}`
    }))
  ]);
}

/** "15 November 2026" from an ISO date, without the timezone shifting the day. */
export function citationDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
