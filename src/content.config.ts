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
    /**
     * Set on any article whose numbers come from a model version that has since been
     * recalibrated, where the article's own figures are still what this site publishes.
     *
     * It is not `superseded_by`: nothing replaces the article, and the figures are not
     * transcription errors. They are the honest output of the model this site currently
     * ships. The banner exists because the same model, recalibrated, is already live on
     * ukdemographics.co.uk producing different counts, and a reader comparing the two
     * sites deserves to know which is which rather than concluding one of them is lying.
     */
    model_recalibrated: z.boolean().default(false),
    // SR integration
    sr_article_id: z.string().optional(),
    sr_published: z.boolean().default(false),
    // Social
    video_url: z.string().optional(),
    video_poster: z.string().optional()
  })
});

export const collections = { findings };
