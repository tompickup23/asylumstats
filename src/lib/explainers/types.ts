/**
 * An explainer answers one question people search for, on figures that update themselves.
 *
 * The shape is fixed because the page is: a question as the h1, a 40 to 60 word answer
 * that leads with the number (the part a search engine lifts), the figure's date and
 * source, a chart, what the figure does and does not include, related questions, and the
 * areas behind the national number. Every string is built from the data at build time, so
 * a refresh moves the answer without anyone editing prose.
 */
export type ExplainerTopic = "numbers" | "accommodation" | "arrivals" | "decisions";

export const TOPIC_LABELS: Record<ExplainerTopic, string> = {
  numbers: "How many",
  accommodation: "Hotels, support and cost",
  arrivals: "Arrivals",
  decisions: "Decisions and appeals"
};

/** Topic order on the hubs: the questions with the most search interest first. */
export const TOPIC_ORDER: ExplainerTopic[] = ["numbers", "accommodation", "arrivals", "decisions"];

export interface ExplainerSource {
  label: string;
  url: string;
}

export interface Explainer {
  slug: string;
  topic: ExplainerTopic;
  /** The h1, phrased as the search. */
  question: string;
  /** Under 600px at 20px Arial. Leads with the query, ends with the figure and its date. */
  seoTitle: string;
  /** Under 920px at 14px Arial. */
  seoDescription: string;
  /** The live figure on the hub card and the social card. */
  figure: string;
  figureLabel: string;
  /** 40 to 60 words. The first sentence answers the question on its own. */
  answer: string;
  /** ISO date the figure describes. */
  asAt: string;
  /** Where the source dates the figure by month or period rather than a day ("April 2026"). */
  asAtLabel?: string;
  /** ISO date the source was published. Drives sitemap lastmod and dateModified. */
  published: string;
  /** ISO date the next edition is due, where the publisher states one. */
  nextUpdate?: { date: string; label: string };
  sources: ExplainerSource[];
  keyFigures?: Array<{ label: string; value: string; note?: string }>;
  chart?: {
    title: string;
    description: string;
    points: Array<{ label: string; value: number }>;
    valueSuffix?: string;
    source: string;
    sourceUrl: string;
  };
  /** Paragraphs on what the figure counts and what it leaves out. */
  basis: string[];
  questions: Array<{ question: string; answer: string }>;
  areas?: {
    title: string;
    note: string;
    rows: Array<{ name: string; href: string; value: string; detail?: string }>;
  };
  relatedFindings: string[];
  relatedExplainers: string[];
  relatedPages: Array<{ href: string; label: string }>;
}
