/**
 * MP directory loader and constituency-to-area matching.
 *
 * Constituencies don't map 1:1 to local authorities. A single LA may contain
 * multiple constituencies, and some constituencies span LA boundaries.
 * We use fuzzy name matching as a best-effort approach.
 */

import rawMpDirectory from "../data/live/mp-directory.json";

export interface MpRecord {
  memberId: number;
  mpName: string;
  party: string;
  constituencyName: string;
  photoUrl: string | null;
  majority: number | null;
  electedDate: string | null;
}

interface MpDirectory {
  source: string;
  lastUpdated: string;
  totalMPs: number;
  members: MpRecord[];
}

const data = rawMpDirectory as unknown as MpDirectory;

/**
 * Find MPs whose constituency name contains part of the area name,
 * or whose area name contains part of the constituency name.
 * Returns multiple MPs since areas typically span multiple constituencies.
 */
export function getMPsForArea(areaName: string): MpRecord[] {
  const normalised = areaName.toLowerCase()
    .replace(/\bcity of\b/gi, "")
    .replace(/\bborough of\b/gi, "")
    .replace(/\bcouncil\b/gi, "")
    .replace(/\band\b/gi, "")
    .replace(/\bwith\b/gi, "")
    .replace(/\bthe\b/gi, "")
    .trim();

  // Split compound names (e.g. "Blackburn with Darwen" -> ["blackburn", "darwen"])
  const areaParts = normalised.split(/[\s,]+/).filter(p => p.length > 3);

  return data.members.filter(mp => {
    const constNorm = mp.constituencyName.toLowerCase();
    // Check if any significant word from the area name appears in the constituency
    return areaParts.some(part => constNorm.includes(part));
  });
}

/**
 * Get the primary MP for an area (the one whose constituency most closely matches).
 * Returns null if no match found.
 */
export function getPrimaryMPForArea(areaName: string): MpRecord | null {
  const matches = getMPsForArea(areaName);
  if (matches.length === 0) return null;

  // Prefer exact constituency name match
  const normalised = areaName.toLowerCase();
  const exact = matches.find(mp => mp.constituencyName.toLowerCase().includes(normalised));
  if (exact) return exact;

  // Otherwise return the first match
  return matches[0];
}

/**
 * Get all MPs for display.
 */
export function getAllMPs(): MpRecord[] {
  return data.members;
}

export function getMpDirectoryLastUpdated(): string {
  return data.lastUpdated;
}
