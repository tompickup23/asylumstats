import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const findings = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/findings" }),
  schema: z.object({
    headline: z.string(),
    date: z.string(),
    category: z.enum(["spending", "routes", "demographics", "backlog", "accountability", "crime", "send", "social-care", "pressure-index"]),
    stat_value: z.string(),
    stat_label: z.string(),
    content_type: z.enum(["finding", "article"]).default("finding"),
    verdict: z.enum(["alert", "critical", "resolved", "info"]).default("info"),
    source_url: z.string().url(),
    source_label: z.string().default("Source"),
    summary: z.string(),
    /**
     * Slug of the article that replaces this one.
     *
     * Set when a later article covers the same claim on a newer data release. The page
     * stays at its URL, because deleting a published URL throws away whatever inbound
     * links and ranking it has, but it points its canonical at the replacement so search
     * engines consolidate the two rather than treating them as competing duplicates.
     * It also drops out of the listings, the sitemap and the search index.
     */
    superseded_by: z.string().optional(),
    // SR integration
    sr_article_id: z.string().optional(),
    sr_published: z.boolean().default(false),
    // Social
    video_url: z.string().optional(),
    video_poster: z.string().optional()
  })
});

export const collections = { findings };
