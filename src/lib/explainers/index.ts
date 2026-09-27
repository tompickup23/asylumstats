/**
 * Every /explained/ page, in one list. The page route, the hub, the research page, the
 * sitemap, the search index and the social cards all read this, so adding an explainer is
 * one entry and none of them can disagree about which exist.
 */
import { systemExplainers } from "./system";
import { costExplainers } from "./cost";
import { TOPIC_ORDER, type Explainer, type ExplainerTopic } from "./types";

export type { Explainer, ExplainerTopic } from "./types";
export { TOPIC_LABELS, TOPIC_ORDER } from "./types";

let cache: Explainer[] | null = null;

export function getExplainers(): Explainer[] {
  cache ??= [...systemExplainers(), ...costExplainers()];
  return cache;
}

export function getExplainer(slug: string): Explainer | undefined {
  return getExplainers().find((explainer) => explainer.slug === slug);
}

export function explainerPath(slug: string): string {
  return `/explained/${slug}/`;
}

/** Explainers grouped by topic, in hub order, dropping empty topics. */
export function explainersByTopic(): Array<{ topic: ExplainerTopic; items: Explainer[] }> {
  const all = getExplainers();
  return TOPIC_ORDER.map((topic) => ({ topic, items: all.filter((item) => item.topic === topic) })).filter(
    (group) => group.items.length > 0
  );
}
