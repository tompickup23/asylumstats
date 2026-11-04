/**
 * "Change since the last release" for a place page: the count of people on asylum
 * support in the area against the same count in the previous Home Office release, as the
 * regional press reports each quarter ("up 16 since March").
 *
 * Both counts come from table Reg_02 of the regional and local authority dataset, one
 * per release, held in data/marts/uk_routes/local-route-releases.json by the routes
 * transform (scripts/lib/held-releases.mjs). Nothing is estimated. Where either release
 * has no figure for the area's code, or the Home Office withheld it, the change is "not
 * comparable" and no number is printed.
 */
import heldReleasesFile from "../data/live/local-route-releases.json";
import { formatLongDate, fmtInt } from "./headline-figures";

export interface HeldArea {
  areaName: string;
  supportedAsylum: number | null;
  withheld?: string;
}

export interface HeldRelease {
  snapshotDate: string;
  release: string;
  releaseDate: string;
  releasePage: string;
  table: string;
  fileName: string;
  sourceUrl: string;
  fileSha256: string;
  areas: Record<string, HeldArea>;
}

interface ChangeBase {
  current: number | null;
  currentDate: string;
  previousDate: string | null;
  currentRelease: HeldRelease;
  previousRelease: HeldRelease | null;
}

export type ReleaseChange =
  | (ChangeBase & { comparable: true; current: number; previous: number; delta: number; direction: "up" | "down" | "unchanged" })
  | (ChangeBase & { comparable: false; reason: "no_previous_release" | "not_in_both_releases" | "withheld" });

export function heldReleases(): HeldRelease[] {
  return (heldReleasesFile as unknown as { releases: HeldRelease[] }).releases;
}

export function releaseChange(areaCode: string, releases: HeldRelease[] = heldReleases()): ReleaseChange {
  const [currentRelease, previousRelease = null] = releases;
  if (!currentRelease) throw new Error("No Home Office release is held.");
  const now = currentRelease.areas[areaCode];
  const before = previousRelease?.areas[areaCode];
  const base = {
    current: now?.supportedAsylum ?? null,
    currentDate: currentRelease.snapshotDate,
    previousDate: previousRelease?.snapshotDate ?? null,
    currentRelease,
    previousRelease
  };
  if (!previousRelease) return { ...base, comparable: false, reason: "no_previous_release" };
  if (!now || !before) return { ...base, comparable: false, reason: "not_in_both_releases" };
  if (now.supportedAsylum === null || before.supportedAsylum === null) {
    return { ...base, comparable: false, reason: "withheld" };
  }
  const delta = now.supportedAsylum - before.supportedAsylum;
  return {
    ...base,
    comparable: true,
    current: now.supportedAsylum,
    previous: before.supportedAsylum,
    delta,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "unchanged"
  };
}

const monthOf = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

/** "up 16 since March", for the title. Null where there is no comparable change to state. */
export function changeTitleClause(change: ReleaseChange): string | null {
  if (!change.comparable || !change.previousDate) return null;
  const since = `since ${monthOf(change.previousDate)}`;
  return change.direction === "unchanged" ? `unchanged ${since}` : `${change.direction} ${fmtInt(Math.abs(change.delta))} ${since}`;
}

/** The page's first line: the count, its date and the change, or why there is none. */
export function changeFirstLine(change: ReleaseChange): string {
  const now = change.current === null ? null : `${fmtInt(change.current)} on asylum support at ${formatLongDate(change.currentDate)}`;
  if (change.comparable) {
    const before = `${fmtInt(change.previous)} at ${formatLongDate(change.previousDate!)}`;
    return change.direction === "unchanged"
      ? `${now}, unchanged from ${before}.`
      : `${now}, ${change.direction} ${fmtInt(Math.abs(change.delta))} from ${before}.`;
  }
  const lead = now ? `${now}.` : `No published count at ${formatLongDate(change.currentDate)}.`;
  if (change.reason === "no_previous_release") return `${lead} Change since the last release: not comparable, as only one release is held.`;
  const since = formatLongDate(change.previousDate!);
  const why = change.reason === "withheld"
    ? "the Home Office withheld one of the two figures"
    : "the two releases do not both list this area's code";
  return `${lead} Change since ${since}: not comparable, because ${why}.`;
}

/** What both figures count and where they come from. */
export function changeSourceLine(change: ReleaseChange): string {
  const releases = [change.currentRelease, change.previousRelease]
    .filter((release): release is HeldRelease => release !== null)
    .map((release) => `${release.release.replace(/^Immigration system statistics, /, "")} (published ${formatLongDate(release.releaseDate)})`);
  return `People in receipt of Home Office asylum support living in the area. Home Office, Immigration system statistics, regional and local authority data, table ${change.currentRelease.table}: ${releases.join(" and ")}.`;
}
