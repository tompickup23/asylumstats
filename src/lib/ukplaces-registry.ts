import registry from "../data/live/ukplaces-places.json";

export type UkPlacesRecord = {
  slug: string;
  coverage: {
    ukdemographics: { hasPage: boolean; url: string | null };
  };
};

const records = registry as Record<string, UkPlacesRecord>;

export function getUkPlacesRecord(gss: string | null | undefined): UkPlacesRecord | null {
  return gss ? records[gss] ?? null : null;
}

export function ukPlacesUrl(record: UkPlacesRecord): string {
  return `https://ukplaces.co.uk/places/${record.slug}/`;
}
