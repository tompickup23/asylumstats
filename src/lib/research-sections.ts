/**
 * How /findings/ is ordered. Three kinds of piece do three jobs, so they are not one
 * reverse-chronological list:
 *
 *   Latest       the newest three by the date shown, whatever their type
 *   Featured     the flagship investigations, in the order set by `featured`
 *   By topic     everything else, grouped, money first and demographics last
 *
 * Sorting all of them by date alone meant a strong investigation sank the week anything
 * newer landed.
 */
import { findingDisplayDate } from "./finding-dates";

type Category =
  | "spending"
  | "routes"
  | "demographics"
  | "backlog"
  | "accountability"
  | "crime"
  | "send"
  | "social-care"
  | "pressure-index";

export interface ResearchItem {
  id: string;
  data: {
    category: Category;
    date: string;
    updated?: string;
    featured?: number;
    content_type: "finding" | "article" | "news";
    superseded_by?: string;
  };
}

export const RESEARCH_GROUPS: Array<{ id: string; label: string; categories: Category[] }> = [
  { id: "money", label: "Money and contracts", categories: ["spending", "accountability"] },
  { id: "arrivals", label: "Arrivals, decisions and returns", categories: ["routes", "backlog"] },
  { id: "local", label: "Local pressure", categories: ["pressure-index", "crime", "send", "social-care"] },
  { id: "demographics", label: "Demographic change", categories: ["demographics"] }
];

// Newest shown date first. On a tie, news before anything else, then the piece first
// published most recently, so a refresh of an old finding does not push today's news off.
const byDisplayDate = <T extends ResearchItem>(a: T, b: T) =>
  findingDisplayDate(b.data).localeCompare(findingDisplayDate(a.data)) ||
  Number(b.data.content_type === "news") - Number(a.data.content_type === "news") ||
  b.data.date.localeCompare(a.data.date);

export function arrangeResearch<T extends ResearchItem>(items: T[]) {
  const live = items.filter((item) => !item.data.superseded_by);
  const latest = [...live].sort(byDisplayDate).slice(0, 3);
  const featured = live
    .filter((item) => item.data.featured !== undefined)
    .sort((a, b) => (a.data.featured ?? 0) - (b.data.featured ?? 0));
  const placed = new Set([...latest, ...featured].map((item) => item.id));
  const groups = RESEARCH_GROUPS.map((group) => ({
    ...group,
    items: live
      .filter((item) => group.categories.includes(item.data.category) && !placed.has(item.id))
      .sort(byDisplayDate)
  })).filter((group) => group.items.length > 0);

  const grouped = new Set(groups.flatMap((group) => group.items.map((item) => item.id)));
  const orphans = live.filter((item) => !placed.has(item.id) && !grouped.has(item.id));
  if (orphans.length > 0) {
    throw new Error(`Findings with no research group: ${orphans.map((item) => item.id).join(", ")}`);
  }
  return { latest, featured, groups };
}
