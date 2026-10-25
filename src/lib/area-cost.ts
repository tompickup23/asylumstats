/** Local comparisons at a dated stock and rate, never a record of expenditure. */
import taxpayers from "../data/live/income-taxpayers-la.json";
import population from "../data/live/population-estimates.json";
import dwellings from "../data/live/council-tax-spd.json";
import dashboard from "../data/live/route-dashboard.json";
import { loadLocalRouteLatest, type LocalRouteAreaSummary } from "./route-data";
import { projectionCode } from "./ethnic-projections";
import { ASYLUM_DISPERSAL_GRANT, COST_PER_NIGHT, SUPPORT_RATES } from "./official-figures";
import { PER_TAXPAYER_GBP, UK_TAXPAYERS, UK_TAXPAYERS_SOURCE, TRUE_COST_SOURCE } from "./true-cost";

/**
 * Do the letters of 26 August 2026 and 8 October 2025 include cash support in
 * their nightly costs? Tom must read them; automated retrieval is forbidden.
 * Until verified, do not add accommodated allowances to the priced subtotal.
 * Meal coverage is also unknown: full board receives the catered rate instead.
 */
export const ACCOMMODATED_ALLOWANCE_BASIS = "unverified" as const;
const DAYS = 365;
const WEEKS = 52;
const taxAreas: Partial<Record<string, (typeof taxpayers.areas)[keyof typeof taxpayers.areas]>> = taxpayers.areas;
const popAreas: Partial<Record<string, (typeof population.areas)[keyof typeof population.areas]>> = population.areas;
const dwellingAreas: Partial<Record<string, (typeof dwellings.areas)[keyof typeof dwellings.areas]>> = dwellings.areas;
const snapshot = loadLocalRouteLatest();
const countSource = dashboard.sources.find(s => s.source_id === "local_immigration_groups");
if (!countSource) throw new Error("Area costs require the local Home Office source record.");

export const AREA_COST_SOURCES = {
  counts: { ...countSource, table: "Reg_02", accommodationNotes: "Notes 24, 26 and 27" },
  taxpayers: taxpayers.sources.hmrc_spi,
  population: population.source,
  dwellings: { url: dwellings.sourceUrl, title: dwellings.source, updated: dwellings.lastUpdated },
  rates: COST_PER_NIGHT,
  support: SUPPORT_RATES,
  grant: ASYLUM_DISPERSAL_GRANT
};
export const AREA_COST_DATES = {
  count: snapshot.snapshotDate,
  rate: COST_PER_NIGHT.dispersal2026.appliesTo,
  lowerRate: COST_PER_NIGHT.dispersal2025.appliesTo,
  taxpayers: taxpayers.edition,
  population: population.source.referenceDate,
  dwellings: dwellings.snapshotDate,
  allowance: SUPPORT_RATES.standard.appliesTo,
  grant: ASYLUM_DISPERSAL_GRANT.appliesTo
};
export const AREA_COST_UK = {
  supported: snapshot.areas.reduce((n, a) => n + a.supportedAsylum, 0),
  taxpayers: Object.values(taxpayers.areas).reduce((n, a) => n + (a.taxpayers ?? 0), 0),
  missingTaxpayerCodes: Object.values(taxpayers.areas).filter(a => a.taxpayers === null).map(a => a.code)
};
const nationalYear = `${UK_TAXPAYERS_SOURCE.financialYear.slice(0, 4)} to ${Number(UK_TAXPAYERS_SOURCE.financialYear.slice(0, 4)) + 1}`;
const nationalRecord = taxpayers.national.years[nationalYear as keyof typeof taxpayers.national.years];
if (!nationalRecord || nationalRecord.taxpayers !== UK_TAXPAYERS ||
    nationalRecord.source.cell !== UK_TAXPAYERS_SOURCE.cell) {
  throw new Error("Area cost national comparison must match True Cost and HMRC Table 2.1.");
}
export const NATIONAL_COST_COMPARISON = {
  perTaxpayer: PER_TAXPAYER_GBP.central,
  taxpayers: UK_TAXPAYERS,
  year: UK_TAXPAYERS_SOURCE.financialYear,
  source: UK_TAXPAYERS_SOURCE,
  costSource: TRUE_COST_SOURCE,
  note: "An equal division of the estimated national system cost, not an individual's tax payment."
};
export const AREA_COST_NOTES = {
  basis: "Annualised priced subtotal, paid by the Home Office. This uses 365 nights and 52 weekly payments at a constant count; it is not expenditure recorded for this area.",
  contingency: "Contingency accommodation is priced at the published hotel rate as a scenario. The source category includes hotels and may include other temporary accommodation.",
  allowance: "Accommodated cash allowances are excluded pending verification of what the nightly rates include. Meal coverage is unknown. The standard and catered allowances differ.",
  grant: "Actual grant payments are unavailable. The annual grant uses the March baseline, excludes Large Sites CA and covers England, Scotland and Wales. Monthly growth payments and local eligibility cannot be calculated from this snapshot.",
  burden: "The UK comparison uses the sum of published local taxpayer counts, not Table 2.1. Two local counts are unavailable. Ratios are relative comparisons, not a statutory allocation target.",
  interval: "The interval reverses the HMRC 95% taxpayer bounds, holding the cost subtotal fixed. It is not a confidence interval for costs and excludes uncertainty in rates, allowances and grants.",
  hypothetical: "Local equivalents show what the priced subtotal would be if divided locally. They are not bills charged to local taxpayers or households."
};
export const roundTen = (value: number) => Math.round(value / 10) * 10;
export const formatAreaCost = (value: number | null) => value === null ? "Unavailable" :
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);
export const formatAreaCostCompact = (value: number) => value >= 1_000_000
  ? `£${(value / 1_000_000).toFixed(1)} million` : formatAreaCost(value < 10000 ? Math.round(value) : Math.round(value / 1000) * 1000);
export const formatCostDate = (value: string) => new Date(`${value}T00:00:00Z`)
  .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Exported for independent scenario tests; production callers use getAreaCost. */
export function calculateAreaCost(area: LocalRouteAreaSummary) {
  const code = projectionCode(area.areaCode);
  const tax = taxAreas[code] ?? null;
  const pop = popAreas[code] ?? null;
  const dwelling = area.countryName === "England" ? dwellingAreas[code] ?? null : null;
  const counts = {
    supported: area.supportedAsylum, dispersal: area.dispersalAccommodation,
    contingency: area.contingencyAccommodation, initial: area.initialAccommodation,
    other: area.otherAccommodation, subsistenceOnly: area.subsistenceOnly
  };
  if (Object.values(counts).some(n => !Number.isFinite(n) || n < 0) ||
      counts.supported !== counts.dispersal + counts.contingency + counts.initial + counts.other + counts.subsistenceOnly) {
    throw new Error(`Invalid support breakdown for ${area.areaCode}`);
  }
  if (area.snapshotDate !== snapshot.snapshotDate) throw new Error(`Mixed count dates for ${area.areaCode}`);
  const unpricedPeople = counts.initial + counts.other;
  const accommodated = counts.supported - counts.subsistenceOnly;
  const dispersal = counts.dispersal * COST_PER_NIGHT.dispersal2026.value * DAYS;
  const contingency = counts.contingency * COST_PER_NIGHT.hotel2026.value * DAYS;
  const subsistenceOnly = counts.subsistenceOnly * SUPPORT_RATES.standard.value * WEEKS;
  const pricedSubtotal = dispersal + contingency + subsistenceOnly;
  const lowerRateSubtotal = counts.dispersal * COST_PER_NIGHT.dispersal2025.value * DAYS +
    counts.contingency * COST_PER_NIGHT.hotel2025.value * DAYS + subsistenceOnly;
  const taxpayerCount = tax?.taxpayers ?? null;
  const taxable = taxpayerCount !== null && taxpayerCount > 0;
  const publishPerTaxpayer = counts.supported >= 50 && taxable && unpricedPeople === 0;
  const unpricedNote = unpricedPeople > 0
    ? `${unpricedPeople.toLocaleString("en-GB")} people in initial or other accommodation are unpriced. This includes large sites where present; no current comparable rate is held.` : null;
  const unpricedEquivalentNote = unpricedPeople > 0 ? "Withheld while some accommodation is unpriced." : null;
  const perTaxpayerNote = unpricedEquivalentNote ?? (counts.supported < 50 ? "Withheld below 50 people on support." :
    !taxable ? "HMRC has no published taxpayer count for this area." : null);
  return {
    areaCode: area.areaCode, sourceCode: code, areaName: area.areaName, counts,
    countryName: area.countryName, regionName: area.regionName,
    basis: "derived" as const, dates: { ...AREA_COST_DATES, count: area.snapshotDate },
    inputs: { taxpayers: tax, population: pop, dwellings: dwelling },
    m1: {
      supportedShare: counts.supported / AREA_COST_UK.supported,
      taxpayerShare: taxable ? taxpayerCount / AREA_COST_UK.taxpayers : null,
      burdenShare: taxable ? (counts.supported / AREA_COST_UK.supported) / (taxpayerCount / AREA_COST_UK.taxpayers) : null,
      per1000Taxpayers: taxable ? counts.supported / taxpayerCount * 1000 : null,
      ukPer1000Taxpayers: AREA_COST_UK.supported / AREA_COST_UK.taxpayers * 1000,
      note: taxable ? AREA_COST_NOTES.burden : "HMRC taxpayer count unavailable; no burden ratio is inferred."
    },
    m2: {
      total: null, pricedSubtotal, lowerRateSubtotal, dispersal, contingency, subsistenceOnly,
      hotelRateSharePct: pricedSubtotal > 0 ? contingency / pricedSubtotal * 100 : null,
      includesHotelRateScenario: counts.contingency > 0,
      allPeoplePriced: unpricedPeople === 0,
      status: [unpricedPeople > 0
        ? `Incomplete: ${unpricedPeople.toLocaleString("en-GB")} of ${counts.supported.toLocaleString("en-GB")} people have no published rate`
        : "Complete rate coverage", counts.contingency > 0 ? "Includes a hotel-rate scenario" : null].filter(Boolean).join(". "),
      accommodatedAllowance: null, actualGrant: null,
      // A sensitivity ceiling for the ordinary allowance, not a total cost bound.
      standardAllowanceSensitivity: ACCOMMODATED_ALLOWANCE_BASIS === "unverified"
        ? accommodated * SUPPORT_RATES.standard.value * WEEKS : null,
      // A comparison using current DA and contingency counts, never a payment estimate.
      grantEquivalent: area.countryName === "Northern Ireland" ? null :
        (counts.dispersal + counts.contingency) * ASYLUM_DISPERSAL_GRANT.value,
      unpricedPeople, unpricedNote, partial: true,
      contingencyNote: counts.contingency > 0 ? AREA_COST_NOTES.contingency : null,
      note: AREA_COST_NOTES.basis
    },
    m3: {
      perTaxpayer: publishPerTaxpayer ? roundTen(pricedSubtotal / taxpayerCount) : null,
      perTaxpayer95: publishPerTaxpayer && tax?.taxpayersLower95 && tax?.taxpayersUpper95
        ? { lower: roundTen(pricedSubtotal / tax.taxpayersUpper95), upper: roundTen(pricedSubtotal / tax.taxpayersLower95) } : null,
      perTaxpayerNote,
      perDwelling: unpricedPeople === 0 && dwelling && dwelling.chargeableDwellings > 0 ? Math.round(pricedSubtotal / dwelling.chargeableDwellings) : null,
      dwellingNote: dwelling ? unpricedEquivalentNote : "Chargeable dwellings are available for England only; no denominator is substituted.",
      perResident: unpricedPeople === 0 && pop && pop.population > 0 ? Math.round(pricedSubtotal / pop.population) : null,
      residentNote: pop ? unpricedEquivalentNote : "The synced ONS population file covers England and Wales only.",
      note: AREA_COST_NOTES.hypothetical
    },
    m4: NATIONAL_COST_COMPARISON
  };
}
export type AreaCost = ReturnType<typeof calculateAreaCost>;
const costs = new Map(snapshot.areas.map(a => [a.areaCode, calculateAreaCost(a)]));
export const getAllAreaCosts = () => [...costs.values()];
export function getAreaCost(code: string): AreaCost {
  const result = costs.get(code);
  if (!result) throw new Error(`No local cost inputs for ${code}`);
  return result;
}
export function areaCostSummary(cost: AreaCost): string {
  const contingency = cost.counts.contingency, unpriced = cost.m2.unpricedPeople;
  const hotels = contingency > 0
    ? " Contingency places are priced at the hotel rate as a scenario."
    : " None are in contingency accommodation, the category that includes hotels.";
  return ` Priced from the local accommodation mix, housing and support come to about ${formatAreaCostCompact(cost.m2.pricedSubtotal)} a year, paid by the Home Office.${hotels}${unpriced > 0 ? ` ${unpriced.toLocaleString("en-GB")} people in initial or other accommodation are unpriced, so this is a partial figure.` : ""} The working is shown below.`;
}
export function regionalCostSummary(codes: string[]): string {
  const rows = [...new Set(codes)].map(getAreaCost);
  const subtotal = rows.reduce((n, a) => n + a.m2.pricedSubtotal, 0);
  const unpriced = rows.reduce((n, a) => n + a.m2.unpricedPeople, 0);
  return ` Priced components annualise to about ${formatAreaCostCompact(subtotal)}, paid by the Home Office. This partial subtotal excludes grants and any separate accommodated allowance.${unpriced > 0 ? ` ${unpriced.toLocaleString("en-GB")} people in initial or other accommodation, including large sites where present, remain unpriced.` : ""}${rows.some(a => a.counts.contingency > 0) ? ` ${AREA_COST_NOTES.contingency}` : ""} Count: ${formatCostDate(AREA_COST_DATES.count)}; nightly rates: ${AREA_COST_DATES.rate}; taxpayer edition: ${AREA_COST_DATES.taxpayers}.`;
}

/** Shared labels used on the table, download and cards. Never implies full expenditure. */
export const formatBurden = (value: number | null) => value === null ? "Unavailable" : `${value.toFixed(1)} times`;
export const formatSupportRate = (value: number | null) => value === null ? "Unavailable" : value.toFixed(1);
export const formatHotelShare = (value: number | null) => value === null ? "Unavailable" : `${value.toFixed(1)}%`;
export const AREA_COST_PERIODS = { nights: DAYS, weeklyPayments: WEEKS };
export const AREA_COST_INPUT_RATES = {
  dispersalPerNight: COST_PER_NIGHT.dispersal2026.value,
  contingencyPerNight: COST_PER_NIGHT.hotel2026.value,
  initialPerNight: null, otherPerNight: null,
  subsistenceOnlyPerWeek: SUPPORT_RATES.standard.value
};
export function areaCostCard(cost: AreaCost) {
  return {
    title: cost.areaName,
    stat: formatAreaCostCompact(cost.m2.pricedSubtotal),
    statLabel: "Annualised priced subtotal, paid by the Home Office",
    details: [
      `${cost.counts.supported.toLocaleString("en-GB")} people on support. Burden share: ${formatBurden(cost.m1.burdenShare)}.`,
      `Per 1,000 income taxpayers: local ${formatSupportRate(cost.m1.per1000Taxpayers)}, UK ${formatSupportRate(cost.m1.ukPer1000Taxpayers)}.`,
      `${cost.m2.status}. Excludes grants and separate accommodated allowances.`,
      cost.m1.burdenShare === null ? cost.m1.note : "Relative comparison, not an allocation target.",
      `Home Office Reg_02 count: ${formatCostDate(cost.dates.count)}. Rates: ${cost.dates.rate}.`,
      `HMRC Tables 3.14 and 3.14a: ${cost.dates.taxpayers}. Not recorded expenditure.`,
      `Home Office rates letter published ${formatCostDate(AREA_COST_SOURCES.rates.dispersal2026.published)}.`
    ],
    verdict: "info"
  };
}
