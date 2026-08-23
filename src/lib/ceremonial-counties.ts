/**
 * Local authority to ceremonial county, for England.
 *
 * Why ceremonial rather than administrative: someone searching "how many asylum seekers
 * in Lancashire" means the county as people speak of it, which includes Blackpool and
 * Blackburn with Darwen. The ONS administrative county geography excludes both, because
 * they are unitary authorities. Using it alone would drop 24,764 people on asylum
 * support, 29 per cent of the England total, out of county figures without any warning.
 *
 * Two sources, combined:
 *
 *  1. ONS LAD24_CTY24_EN_LU covers 233 authorities: the two-tier districts, the 36
 *     metropolitan boroughs (mapped to their metropolitan county) and the 33 London
 *     boroughs (mapped to Inner or Outer London, merged here into Greater London).
 *     That part is authoritative and is loaded at build time, not restated here.
 *
 *  2. The 63 unitary authorities below, which the ONS lookup does not place in any
 *     county. These are assigned by hand and are the part to check.
 *
 * Judgement calls, all deliberate and all visible on the page footnote:
 *
 *  - Stockton-on-Tees straddles the historic Durham and North Yorkshire boundary along
 *    the Tees. It is assigned whole to County Durham rather than split, because the
 *    asylum support figures are published per authority and cannot be divided.
 *  - Isles of Scilly is its own ceremonial area. It is grouped with Cornwall, which is
 *    how people search for it, and it holds nobody on asylum support in any case.
 *  - Inner London and Outer London are merged into Greater London.
 *  - Bristol is a ceremonial county in its own right and is kept separate from
 *    Gloucestershire and Somerset.
 *
 * Nothing here is a boundary claim. It is a lookup for grouping published per-authority
 * figures under the name a member of the public would actually type.
 */

/** The 63 unitary authorities the ONS county lookup leaves unplaced. */
export const UNITARY_TO_CEREMONIAL_COUNTY: Readonly<Record<string, string>> = {
  E06000022: "Somerset", // Bath and North East Somerset
  E06000055: "Bedfordshire", // Bedford
  E06000008: "Lancashire", // Blackburn with Darwen
  E06000009: "Lancashire", // Blackpool
  E06000058: "Dorset", // Bournemouth, Christchurch and Poole
  E06000036: "Berkshire", // Bracknell Forest
  E06000043: "East Sussex", // Brighton and Hove
  E06000023: "Bristol", // Bristol, City of
  E06000060: "Buckinghamshire", // Buckinghamshire
  E06000056: "Bedfordshire", // Central Bedfordshire
  E06000049: "Cheshire", // Cheshire East
  E06000050: "Cheshire", // Cheshire West and Chester
  E06000052: "Cornwall", // Cornwall
  E06000047: "County Durham", // County Durham
  E06000063: "Cumbria", // Cumberland
  E06000005: "County Durham", // Darlington
  E06000015: "Derbyshire", // Derby
  E06000059: "Dorset", // Dorset
  E06000011: "East Riding of Yorkshire", // East Riding of Yorkshire
  E06000006: "Cheshire", // Halton
  E06000001: "County Durham", // Hartlepool
  E06000019: "Herefordshire", // Herefordshire, County of
  E06000046: "Isle of Wight", // Isle of Wight
  E06000053: "Cornwall", // Isles of Scilly
  E06000010: "East Riding of Yorkshire", // Kingston upon Hull, City of
  E06000016: "Leicestershire", // Leicester
  E06000032: "Bedfordshire", // Luton
  E06000035: "Kent", // Medway
  E06000002: "North Yorkshire", // Middlesbrough
  E06000042: "Buckinghamshire", // Milton Keynes
  E06000012: "Lincolnshire", // North East Lincolnshire
  E06000013: "Lincolnshire", // North Lincolnshire
  E06000061: "Northamptonshire", // North Northamptonshire
  E06000024: "Somerset", // North Somerset
  E06000065: "North Yorkshire", // North Yorkshire
  E06000057: "Northumberland", // Northumberland
  E06000018: "Nottinghamshire", // Nottingham
  E06000031: "Cambridgeshire", // Peterborough
  E06000026: "Devon", // Plymouth
  E06000044: "Hampshire", // Portsmouth
  E06000038: "Berkshire", // Reading
  E06000003: "North Yorkshire", // Redcar and Cleveland
  E06000017: "Rutland", // Rutland
  E06000051: "Shropshire", // Shropshire
  E06000039: "Berkshire", // Slough
  E06000066: "Somerset", // Somerset
  E06000025: "Gloucestershire", // South Gloucestershire
  E06000045: "Hampshire", // Southampton
  E06000033: "Essex", // Southend-on-Sea
  E06000004: "County Durham", // Stockton-on-Tees, straddles, see header
  E06000021: "Staffordshire", // Stoke-on-Trent
  E06000030: "Wiltshire", // Swindon
  E06000020: "Shropshire", // Telford and Wrekin
  E06000034: "Essex", // Thurrock
  E06000027: "Devon", // Torbay
  E06000007: "Cheshire", // Warrington
  E06000037: "Berkshire", // West Berkshire
  E06000062: "Northamptonshire", // West Northamptonshire
  E06000064: "Cumbria", // Westmorland and Furness
  E06000054: "Wiltshire", // Wiltshire
  E06000040: "Berkshire", // Windsor and Maidenhead
  E06000041: "Berkshire", // Wokingham
  E06000014: "North Yorkshire" // York
};

/** Inner and Outer London are one place as far as anybody searching is concerned. */
export const ONS_COUNTY_RENAMES: Readonly<Record<string, string>> = {
  "Inner London": "Greater London",
  "Outer London": "Greater London"
};

export function normaliseCountyName(onsCountyName: string): string {
  return ONS_COUNTY_RENAMES[onsCountyName] ?? onsCountyName;
}

export function countySlug(countyName: string): string {
  return countyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
