import type { APIRoute } from "astro";
import { getPublicSearchEntries } from "../lib/site-search";
import { getCollection } from "astro:content";
import { explainerPath, getExplainers } from "../lib/explainers";

export const prerender = true;

export const GET: APIRoute = async () => {
  const entries = getPublicSearchEntries();

  // Add findings to search index
  const findings = (await getCollection("findings")).filter((f) => !f.data.superseded_by);
  const findingEntries = findings.map((f) => ({
    href: `/findings/${f.id.replace(/\.md$/, "")}/`,
    title: f.data.headline,
    kind: "finding" as const,
    kicker: f.data.category,
    description: f.data.summary,
    priority: 80,
    searchText: `${f.data.headline} ${f.data.summary} ${f.data.category} ${f.data.stat_value} finding research analysis`.toLowerCase()
  }));

  // Explainers are "page" entries: every consumer already handles that kind (see the
  // search-index-consumers note), and they answer the question a searcher typed.
  const explainerEntries = getExplainers().map((e) => ({
    href: explainerPath(e.slug),
    title: e.question,
    kind: "page" as const,
    kicker: "Explained",
    description: e.answer,
    priority: 100,
    searchText: `${e.question} ${e.figure} ${e.figureLabel} ${e.answer} explained question`.toLowerCase()
  }));

  return new Response(JSON.stringify([...entries, ...explainerEntries, ...findingEntries]), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
};

