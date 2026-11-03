import { describe, expect, it, vi } from "vitest";
import { announcementUrl, createAnnouncementLoader, placeFreshness, type RoutesManifest, type ReleaseAnnouncement } from "../src/lib/place-freshness";

const manifest: RoutesManifest = {
  periodSlug: "june-2026",
  releasePage: "https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-june-2026",
  nextEdition: "2026-11-30"
};
const confirmed: ReleaseAnnouncement = {
  details: { state: "confirmed", release_timestamp: "2026-11-26T09:30:00.000+00:00" }
};
const now = new Date("2026-11-03T12:00:00Z");

describe("place freshness with fixture manifests and GOV.UK responses", () => {
  it.each([
    { name: "confirmed", manifest, announcement: confirmed, date: "2026-11-26", label: "Next:" },
    { name: "provisional", manifest, announcement: { details: { ...confirmed.details, state: "provisional" } }, date: "2026-11-30", label: "Next: due by" },
    { name: "missing announcement", manifest, announcement: undefined, date: "2026-11-30", label: "Next: due by" },
    { name: "missing state", manifest, announcement: { details: { release_timestamp: confirmed.details!.release_timestamp } }, date: "2026-11-30", label: "Next: due by" },
    { name: "missing confirmed date", manifest, announcement: { details: { state: "confirmed" } }, date: "2026-11-30", label: "Next: due by" },
    { name: "passed derived date", manifest: { ...manifest, nextEdition: "2026-11-02" }, announcement: undefined, date: undefined, label: undefined },
    { name: "missing dates", manifest: { ...manifest, nextEdition: undefined }, announcement: undefined, date: undefined, label: undefined },
    { name: "invalid derived date", manifest: { ...manifest, nextEdition: "2026-02-30" }, announcement: undefined, date: undefined, label: undefined }
  ])("handles $name", ({ manifest, announcement, date, label }) => {
    const result = placeFreshness(manifest, "2026-06-30", announcement, now);
    expect(result.nextUpdate).toBe(date);
    expect(result.nextUpdateLabel).toBe(label);
    expect(result.sourceUrl).toBe(manifest.releasePage);
  });

  it("drops the confirmed line at publication without reverting to the later derived deadline", () => {
    expect(placeFreshness(manifest, undefined, confirmed, new Date("2026-11-26T09:29:59Z")).nextUpdate).toBe("2026-11-26");
    for (const date of ["2026-11-26T09:30:00Z", "2026-11-27T12:00:00Z"]) {
      expect(placeFreshness(manifest, undefined, confirmed, new Date(date)).nextUpdate).toBeUndefined();
    }
    expect(placeFreshness(manifest, undefined, confirmed, now).nextUpdateExpiresAt).toBe(confirmed.details!.release_timestamp);
  });

  it.each([
    { document_type: "statistics" },
    { document_type: "redirect", redirects: [{ destination: "/government/statistics/immigration-system-statistics-year-ending-september-2026" }] },
    { details: { state: "published" } }
  ])("drops the line when GOV.UK reports publication", (announcement) => {
    expect(placeFreshness(manifest, undefined, announcement, now).nextUpdate).toBeUndefined();
  });

  it("does not mistake an unrelated redirect for publication", () => {
    const announcement = { document_type: "redirect", redirects: [{ destination: "/government/statistics" }] };
    expect(placeFreshness(manifest, undefined, announcement, now).nextUpdateLabel).toBe("Next: due by");
  });

  it.each([
    ["2026-11-30", "2026-11-30T23:59:59Z", "2026-12-01T00:00:00Z"],
    ["2027-05-31", "2027-05-31T22:59:59Z", "2027-05-31T23:00:00Z"]
  ])("keeps the whole due day in UK time for %s", (nextEdition, before, expiry) => {
    const fixture = { ...manifest, nextEdition };
    expect(placeFreshness(fixture, undefined, undefined, new Date(before)).nextUpdate).toBe(nextEdition);
    expect(placeFreshness(fixture, undefined, undefined, new Date(before)).nextUpdateExpiresAt).toBe(expiry.replace("Z", ".000Z"));
    expect(placeFreshness(fixture, undefined, undefined, new Date(expiry)).nextUpdate).toBeUndefined();
  });

  it("prefers the snapshot and otherwise uses the manifest data period, never its publication date", () => {
    expect(placeFreshness(manifest, "2026-03-31", undefined, now).updated).toBe("2026-03-31");
    expect(placeFreshness({ ...manifest, periodSlug: "september-2026" }, undefined, undefined, now).updated).toBe("2026-09-30");
    expect(placeFreshness(manifest, "", undefined, now).updated).toBe("2026-06-30");
    expect(placeFreshness(manifest, "2026-02-30", undefined, now).updated).toBe("2026-06-30");
  });

  it("fails when neither data date is present, or the release source is missing", () => {
    expect(() => placeFreshness({ ...manifest, periodSlug: undefined }, undefined)).toThrow("snapshot date or a data period");
    expect(() => placeFreshness({ ...manifest, periodSlug: "unknown" }, "invalid")).toThrow("snapshot date or a data period");
    expect(() => placeFreshness({ ...manifest, releasePage: undefined }, "2026-06-30")).toThrow("releasePage");
  });

  it("moves the source and announcement to the next release, including the year boundary", () => {
    const fixture = { ...manifest, periodSlug: "december-2026", releasePage: "https://www.gov.uk/government/statistics/immigration-system-statistics-year-ending-december-2026" };
    expect(placeFreshness(fixture, undefined, undefined, now).sourceUrl).toBe(fixture.releasePage);
    expect(announcementUrl(fixture)).toBe("https://www.gov.uk/api/content/government/statistics/announcements/immigration-system-statistics-year-ending-march-2027");
    expect(announcementUrl(manifest)).toBe("https://www.gov.uk/api/content/government/statistics/announcements/immigration-system-statistics-year-ending-september-2026");
    expect(announcementUrl({})).toBeUndefined();
  });

  it("shares one GOV.UK request across place pages", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(confirmed)));
    const load = createAnnouncementLoader(fetchImpl);
    expect(await Promise.all([load(manifest), load(manifest), load(manifest)])).toEqual([confirmed, confirmed, confirmed]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(announcementUrl(manifest), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it.each(["unavailable", "invalid JSON", "network failure"])("falls back safely for %s", async (failure) => {
    const fetchImpl = vi.fn<typeof fetch>();
    if (failure === "network failure") fetchImpl.mockRejectedValue(new Error("Unavailable"));
    else fetchImpl.mockResolvedValue(failure === "invalid JSON" ? new Response("invalid") : new Response("", { status: 404 }));
    const announcement = await createAnnouncementLoader(fetchImpl)(manifest);
    expect(placeFreshness(manifest, undefined, announcement, now).nextUpdateLabel).toBe("Next: due by");
  });
});
