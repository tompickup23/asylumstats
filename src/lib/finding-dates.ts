/**
 * Findings dates, rendered for a reader rather than a machine.
 *
 * The listing and the article head both printed the raw ISO string, and both printed
 * `date` even where the frontmatter carried an `updated` that was months newer. A piece
 * revised on the current release then read as older than a piece that had not been
 * touched, which is the opposite of what the reader needs from a date.
 */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function formatFindingDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d] = m;
  return `${Number(d)} ${MONTHS[Number(mo) - 1]} ${y}`;
}

/** The date a reader should see: the revision where there is one, else publication. */
export function findingDisplayDate(data: { date: string; updated?: string }): string {
  return data.updated ?? data.date;
}

/** True when the piece has been revised since publication, so the label can say so. */
export function findingIsRevised(data: { date: string; updated?: string }): boolean {
  return Boolean(data.updated && data.updated !== data.date);
}
