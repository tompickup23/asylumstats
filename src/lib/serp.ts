/**
 * How wide a title or description actually renders in a Google result.
 *
 * Google truncates on pixels, not characters, so a character count is the wrong
 * instrument: `Kingston upon Hull, City of` and `Windsor and Maidenhead` differ by
 * six characters and by barely eight pixels, while `Wiltshire` and `illllllll` are
 * the same length and 30px apart. Everything here works in pixels.
 *
 * The table is Arial advance widths measured in headless Chromium, normalised to a
 * 1px font size. Arial applies no kerning to these strings, so summing per-character
 * advances reproduces `ctx.measureText` to within 0.002px on a 42-character title,
 * and the widths scale linearly with font size to within 0.0005px. That is why this
 * can be a static table rather than a browser call at build time.
 * Regenerate with: node scripts/audit/serp-widths.mjs --regenerate-table
 */

/** Arial advance width per character, as a multiple of the font size. */
const ARIAL: Record<string, number> = {
  "0": 0.5561, "1": 0.5561, "2": 0.5561, "3": 0.5561, "4": 0.5561, "5": 0.5561, "6": 0.5561, "7": 0.5561,
  "8": 0.5561, "9": 0.5561, " ": 0.2779, "!": 0.2779, "\"": 0.355, "#": 0.5561, "$": 0.5561, "%": 0.8892,
  "&": 0.667, "'": 0.1909, "(": 0.333, ")": 0.333, "*": 0.3892, "+": 0.584, ",": 0.2779, "-": 0.333,
  ".": 0.2779, "/": 0.2779, ":": 0.2779, ";": 0.2779, "<": 0.584, "=": 0.584, ">": 0.584, "?": 0.5561,
  "@": 1.0152, "A": 0.667, "B": 0.667, "C": 0.7222, "D": 0.7222, "E": 0.667, "F": 0.6109, "G": 0.7779,
  "H": 0.7222, "I": 0.2779, "J": 0.5, "K": 0.667, "L": 0.5561, "M": 0.833, "N": 0.7222, "O": 0.7779,
  "P": 0.667, "Q": 0.7779, "R": 0.7222, "S": 0.667, "T": 0.6109, "U": 0.7222, "V": 0.667, "W": 0.9439,
  "X": 0.667, "Y": 0.667, "Z": 0.6109, "[": 0.2779, "\\": 0.2779, "]": 0.2779, "^": 0.4693, "_": 0.5561,
  "`": 0.333, "a": 0.5561, "b": 0.5561, "c": 0.5, "d": 0.5561, "e": 0.5561, "f": 0.2779, "g": 0.5561,
  "h": 0.5561, "i": 0.2222, "j": 0.2222, "k": 0.5, "l": 0.2222, "m": 0.833, "n": 0.5561, "o": 0.5561,
  "p": 0.5561, "q": 0.5561, "r": 0.333, "s": 0.5, "t": 0.2779, "u": 0.5561, "v": 0.5, "w": 0.7222,
  "x": 0.5, "y": 0.5, "z": 0.5, "{": 0.334, "|": 0.2598, "}": 0.334, "~": 0.584, "’": 0.2222,
  "‘": 0.2222, "“": 0.333, "”": 0.333, "–": 0.5561, "—": 1, " ": 0.2779, "é": 0.5561, "è": 0.5561,
  "ô": 0.5561, "û": 0.5561, "â": 0.5561, "î": 0.2779, "ç": 0.5, "ÿ": 0.5, "É": 0.667, "£": 0.5561,
  "€": 0.5561, "…": 1, "·": 0.333, "•": 0.3501
};

/** Anything not in the table: the width of a lowercase 'n', a fair middle. */
const FALLBACK = 0.5561;

/** Google renders result titles in 20px Arial and truncates the container at ~600px. */
export const TITLE_FONT_PX = 20;
export const TITLE_LIMIT_PX = 600;

/** Descriptions render at 14px; the two-line snippet clips at roughly 920px. */
export const DESCRIPTION_FONT_PX = 14;
export const DESCRIPTION_LIMIT_PX = 920;

/** Rendered width of `text` in pixels at `fontPx`. */
export function pixelWidth(text: string, fontPx: number): number {
  let total = 0;
  for (const ch of text) total += (ARIAL[ch] ?? FALLBACK) * fontPx;
  return Math.round(total * 100) / 100;
}

export const titleWidth = (text: string) => pixelWidth(text, TITLE_FONT_PX);
export const descriptionWidth = (text: string) => pixelWidth(text, DESCRIPTION_FONT_PX);

/** True when Google would clip this title. */
export const titleFits = (text: string) => titleWidth(text) <= TITLE_LIMIT_PX;
export const descriptionFits = (text: string) => descriptionWidth(text) <= DESCRIPTION_LIMIT_PX;

/**
 * The first candidate that fits, else the last one.
 *
 * Callers pass their variants longest-first, so the fallback is the shortest form they
 * were willing to publish. Returning that rather than a hard-truncated string keeps the
 * clipping decision with the author: a title cut mid-word by the browser reads as broken,
 * one that dropped a whole clause reads as written.
 */
export function firstThatFits(candidates: string[], limitPx = TITLE_LIMIT_PX, fontPx = TITLE_FONT_PX): string {
  for (const candidate of candidates) {
    if (pixelWidth(candidate, fontPx) <= limitPx) return candidate;
  }
  return candidates[candidates.length - 1];
}

/**
 * The brand suffix `normalisePageTitle` appends to any title that does not name the site.
 * Titles built here have to be measured with it, because that is what ships in `<title>`.
 */
export const BRAND_SUFFIX = " | asylumstats";

function ordinal(value: number): string {
  const rest = value % 100;
  if (rest >= 11 && rest <= 13) return `${value}th`;
  return `${value}${["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
}

export interface PlaceTitleInput {
  areaName: string;
  supportedAsylum: number;
}

/**
 * Title for a place page: the question people type, answered in the title.
 *
 * The old template was `Asylum seekers in X: N on support`, which reads to Google as a
 * request for help rather than a statistic. A live check on "asylum seekers in Birmingham
 * number on support" returned the council's asylum support team, Refugee Action, Restore
 * UK and St Chad's Sanctuary — organisations that help asylum seekers — and no statistics
 * page at all. "On support" alone matches people who need support; the question frame in
 * front of it matches people counting.
 *
 * The frame is "how many asylum seekers in X", not "how many asylum seekers ARE in X",
 * because that is the query as typed, and the missing word buys 35px.
 *
 * There is no rank or rate clause, and this is a measurement rather than a preference.
 * The question and the count spend 539px of the 600px Google gives a title on a name as
 * short as Birmingham. The shortest rank clause worth writing, ", 2nd highest", needs
 * another 115px. Every combination overruns — the version this replaces, carrying rank,
 * was 776px, 176px past the cut. The rank still ships in the meta description, where the
 * budget is 920px and it already appears.
 *
 * Degrading drops the question frame before the count: an area whose name is long enough
 * to break the frame still gets its number, because the number is what the page is for.
 */
export function buildPlaceTitle({ areaName, supportedAsylum }: PlaceTitleInput): string {
  const figure =
    supportedAsylum === 1
      ? "1 person on support"
      : `${supportedAsylum.toLocaleString("en-GB")} on support`;

  return firstThatFits([
    `How many asylum seekers in ${areaName}? ${figure}`,
    `Asylum seekers in ${areaName}: ${figure}`,
    // Two areas are named too long for either frame. Leading with the place still spends
    // fewer pixels than "Asylum seekers in " does, which is enough to keep the count, and
    // spelling out "asylum support" here restores the topic the dropped frame carried.
    `${areaName}: ${figure.replace(" on support", " on asylum support")}`,
    `Asylum seekers in ${areaName}`
  ]);
}

export interface PlaceDescriptionInput {
  areaName: string;
  supportedAsylum: number;
  /** Position by supported asylum count, 1 = highest. */
  rank: number;
  /** How many areas the rank is out of. */
  areaCount: number;
  /** Supported asylum per 10,000 residents, where the population is known. */
  ratePer10k?: number | null;
  /** "Charlotte Cane (Liberal Democrats)", or null where the area has no single MP. */
  mp?: string | null;
  /** People in contingency accommodation, the category that includes hotels. */
  contingencyAccommodation?: number;
}

/**
 * Meta description for a place page, longest form that fits Google's two-line snippet.
 *
 * Google rewrites roughly seven descriptions in ten regardless, and rewrites the ones
 * over about 180 characters far more often than the ones in range. Trimming does not buy
 * ranking; it buys control of the wording on the occasions Google does use ours.
 *
 * The rate is here rather than in the title because the title has no room for it and
 * "asylum seekers per 10,000 [area]" is a query this page should win. The rank is here
 * for the same reason.
 *
 * The trailing list of everything else on the page goes first when space runs out. It is
 * there for a reader deciding whether to click, not for a keyword, and a reader who has
 * already been told the count, the rate and the rank has enough to decide.
 */
export function buildPlaceDescription({
  areaName, supportedAsylum, rank, areaCount, ratePer10k, mp, contingencyAccommodation = 0
}: PlaceDescriptionInput): string {
  const people = supportedAsylum === 1 ? "1 person" : `${supportedAsylum.toLocaleString("en-GB")} people`;
  const rate = typeof ratePer10k === "number" && ratePer10k > 0
    ? `, ${ratePer10k.toLocaleString("en-GB")} per 10,000 residents`
    : "";
  const position = rank === 1 ? "Highest" : `${ordinal(rank)} highest`;
  const core =
    `${people} on asylum support in ${areaName}${rate}. ` +
    `${position} of ${areaCount} UK councils.`;
  const mpClause = mp ? ` MP: ${mp}.` : "";

  // This used to be " Hotels, demographics, crime, SEND and social care for the area." —
  // a list of what else is on the page. It survived on 5 of 362 pages, because it cost
  // 405px of a 920px budget, and on the five where it did fit it was keyword padding
  // rather than information. A count of people in contingency accommodation costs a
  // quarter of that and answers "asylum hotels in [area]", which is a query this page
  // type is meant to win. Contingency is the Home Office category that includes hotels,
  // so the wording says contingency and lets the page explain the rest.
  const hotels = contingencyAccommodation > 0
    ? ` ${contingencyAccommodation.toLocaleString("en-GB")} in contingency accommodation.`
    : "";

  return firstThatFits(
    [core + hotels + mpClause, core + hotels, core + mpClause, core],
    DESCRIPTION_LIMIT_PX,
    DESCRIPTION_FONT_PX
  );
}
