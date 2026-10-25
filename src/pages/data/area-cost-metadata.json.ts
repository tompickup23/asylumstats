import type { APIRoute } from "astro";
import { buildAreaCostMetadata } from "../../lib/area-cost-dataset";
export const prerender = true;
export const GET: APIRoute = () => new Response(`${JSON.stringify(buildAreaCostMetadata(), null, 2)}\n`, {
  headers: { "content-type": "application/json; charset=utf-8" }
});
