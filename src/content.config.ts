import { defineCollection, z } from "astro:content";

const findings = defineCollection({
  type: "content",
  schema: z.object({
    headline: z.string(),
    date: z.string(),
    category: z.enum(["spending", "routes", "demographics", "backlog", "accountability"]),
    stat_value: z.string(),
    stat_label: z.string(),
    verdict: z.enum(["alert", "critical", "resolved", "info"]).default("info"),
    source_url: z.string().url(),
    source_label: z.string().default("Source"),
    summary: z.string()
  })
});

export const collections = { findings };
