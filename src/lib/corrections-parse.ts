/**
 * Corrections live inline in the findings as a bold "Correction, <date>." lead,
 * usually inside a blockquote at the top of the piece. That is where a reader of
 * the piece needs them. The corrections page collects every one of them so the
 * record is visible in one place, and it reads the same text rather than a
 * separate list that could drift from it.
 */
export interface ParsedCorrection {
  /** ISO date, from the "Correction, 7 September 2026." lead. */
  date: string;
  /** The correction paragraph with markdown and blockquote markers stripped. */
  text: string;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
};

export function parseCorrectionDate(label: string): string | undefined {
  const m = label.trim().match(/^(\d{1,2}) ([A-Za-z]+) (\d{4})$/);
  if (!m) return undefined;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return undefined;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/^\s*>\s?/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every correction paragraph in a markdown body, in document order. */
export function parseCorrections(body: string): ParsedCorrection[] {
  const out: ParsedCorrection[] = [];
  const lead = /\*\*Correction, ([^.*]+)\.\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = lead.exec(body))) {
    const date = parseCorrectionDate(m[1]);
    if (!date) throw new Error(`Unparseable correction date "${m[1]}"`);
    const rest = body.slice(m.index + m[0].length);
    const paragraphs = rest.split(/\n\s*\n/);
    // A blockquoted correction is one paragraph. A correction written as running
    // text (the appeal article's is a one-line lead and three paragraphs) continues
    // until a heading or a list, or until there is enough of it to stand alone.
    const inQuote = /^\s*>/.test(body.slice(Math.max(0, m.index - 4), m.index + 1)) || /^>/.test(paragraphs[0]?.trimStart() ?? "");
    let text = stripMarkdown(paragraphs[0] ?? "");
    for (const next of inQuote ? [] : paragraphs.slice(1)) {
      if (text.length >= 300 || /^\s*(#|[-*] |\d+\. |\||>)/.test(next)) break;
      text = `${text} ${stripMarkdown(next)}`;
    }
    out.push({ date, text });
  }
  return out;
}
