/**
 * The two Home Office local authority releases the site holds, for "change since the
 * last release" on each place page.
 *
 * Reg_02 in the regional and local authority dataset is a snapshot: one column per
 * measure, as at one quarter end, with no earlier quarters beside it. So the previous
 * quarter's count for an area exists only in the previous release, and the site keeps it
 * in data/marts/uk_routes/local-route-releases.json: the release now on the site first,
 * the one before it second, each with the file, hash and date it was read from.
 *
 * The transform advances the file when a newer quarter arrives and otherwise rewrites the
 * current entry in place, so a Monday refresh on the same release never pushes the
 * previous release out. Nothing here estimates: a withheld cell stays null, with the
 * marker the Home Office printed, and an area missing from either release has no change.
 */

/** One release, read from Reg_02 rows (the title and header rows already removed). */
export function heldReleaseFromReg02(rows, meta) {
  const areas = {};
  for (const row of rows) {
    const code = String(row?.[2] ?? "").trim();
    if (!/^[EWSN]\d{8}$/.test(code)) continue;
    const cell = row[8];
    const numeric = typeof cell === "number" && Number.isFinite(cell);
    areas[code] = {
      areaName: String(row[0]).trim(),
      supportedAsylum: numeric ? cell : null,
      ...(numeric ? {} : { withheld: String(cell ?? "").trim() || "blank" })
    };
  }
  if (!Object.keys(areas).length) throw new Error("Reg_02 gave no local authority rows.");
  return {
    snapshotDate: meta.snapshotDate,
    release: meta.release,
    releaseDate: meta.releaseDate,
    releasePage: meta.releasePage,
    table: "Reg_02",
    column: "Supported Asylum (population)",
    fileName: meta.fileName,
    sourceUrl: meta.sourceUrl,
    fileSha256: meta.fileSha256,
    areas
  };
}

/** The held releases after reading `current`: newest first, never more than two. */
export function advanceHeldReleases(existing, current) {
  const held = Array.isArray(existing?.releases) ? existing.releases : [];
  const [latest] = held;
  if (!latest) return { releases: [current] };
  if (latest.snapshotDate === current.snapshotDate) return { releases: [current, ...held.slice(1, 2)] };
  if (latest.snapshotDate < current.snapshotDate) return { releases: [current, latest] };
  throw new Error(
    `The fetched local authority table is as at ${current.snapshotDate}, older than the ` +
      `${latest.snapshotDate} release already held. Refusing to move the site backwards.`
  );
}
