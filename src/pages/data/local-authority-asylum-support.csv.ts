import type { APIRoute } from "astro";
import { buildLocalAuthorityCsv } from "../../lib/datasets";

export const prerender = true;

// The table behind every place page, as a file. Declared as the distribution of the
// Dataset on /places/; see src/lib/datasets.ts for what the columns may and may not hold.
export const GET: APIRoute = () =>
  new Response(buildLocalAuthorityCsv(), {
    headers: { "content-type": "text/csv; charset=utf-8" }
  });
