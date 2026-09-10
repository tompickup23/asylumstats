import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const findings = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/findings" }),
  schema: z.object({
    headline: z.string(),
    date: z.string(),
    /**
     * When the piece was last materially revised. Present in the frontmatter of several
     * findings and, until now, silently dropped: it was never in this schema, so Zod
     * stripped it and the site rendered and syndicated a stale date. Feeds and the sitemap
     * use it in preference to `date`.
     */
    updated: z.string().optional(),
    category: z.enum(["spending", "routes", "demographics", "backlog", "accountability", "crime", "send", "social-care", "pressure-index"]),
    stat_value: z.string(),
    stat_label: z.string(),
    content_type: z.enum(["finding", "article"]).default("finding"),
    verdict: z.enum(["alert", "critical", "resolved", "info"]).default("info"),
    source_url: z.string().url(),
    source_label: z.string().default("Source"),
    summary: z.string(),
    /**
     * Title and description for search results only. The page keeps `headline` as its H1
     * and `summary` on the listing, in the feed and in the JSON-LD, because those are
     * editorial text written for a reader who is already here.
     *
     * They are separate fields because the two jobs have different budgets. Google clips
     * a title at about 600px and a snippet at about 920px, and every headline on this site
     * ran 900-1,050px: the reader saw a sentence, the searcher saw half of one. Google
     * rewrites roughly seven descriptions in ten anyway, and rewrites those over about 180
     * characters far more often than ones in range, so the gain from fitting is control of
     * the wording rather than any ranking effect.
     *
     * Check with `node scripts/audit/serp-widths.mjs --check` after the build.
     */
    seo_title: z.string().optional(),
    seo_description: z.string().optional(),
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
