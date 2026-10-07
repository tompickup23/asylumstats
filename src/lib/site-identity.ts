// The site's name and origin, and the one way to build a place URL, in a module with no imports, so that anything can use them
// without an import cycle through site.ts (which imports most of src/lib).
export const SITE_NAME = "asylumstats";
export const SITE_URL = "https://asylumstats.co.uk";

export function slugifyAreaName(areaName: string): string {
  return areaName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * A place page lives at its name, never its code. Five modules once built
 * `/places/<area code>/`, which has never existed: the top-areas cards on /places/, the
 * entity pages' place links and the region map explorer all pointed at 404s. Build every
 * place link through this.
 */
export function buildPlacePath(area: { areaName: string }): string {
  return `/places/${slugifyAreaName(area.areaName)}/`;
}
