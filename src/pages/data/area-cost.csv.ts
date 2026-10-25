import type { APIRoute } from "astro";
import { buildAreaCostCsv } from "../../lib/area-cost-dataset";
export const prerender = true;
export const GET: APIRoute = () => new Response(buildAreaCostCsv(), {
  headers: { "content-type": "text/csv; charset=utf-8" }
});
