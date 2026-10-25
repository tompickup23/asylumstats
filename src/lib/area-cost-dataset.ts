/** Lossless scalar export of the shared model, including nulls and source locators. */
import { getAllAreaCosts, AREA_COST_SOURCES, AREA_COST_UK, AREA_COST_DATES, AREA_COST_NOTES, AREA_COST_PERIODS, AREA_COST_INPUT_RATES, ACCOMMODATED_ALLOWANCE_BASIS } from "./area-cost";
import { OGL_V3, SITE_ORGANIZATION, HOME_OFFICE_LOCAL_AUTHORITY_SOURCE } from "./datasets";
import { SITE_URL } from "./site-identity";
export const AREA_COST_CSV_PATH = "/data/area-cost.csv";
type Scalar = string | number | boolean | null;
function flatten(value: unknown, prefix = "", out: Record<string, Scalar> = {}): Record<string, Scalar> {
  if (value === null || typeof value !== "object") out[prefix] = value as Scalar;
  else if (Array.isArray(value)) out[prefix] = JSON.stringify(value);
  else for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  return out;
}
export const AREA_COST_METADATA_PATH = "/data/area-cost-metadata.json";
/** Rows carry what differs by area plus the rates needed to recompute; shared text lives in the metadata file. */
export function areaCostExportRows() {
  return getAllAreaCosts().sort((a, b) => a.areaCode.localeCompare(b.areaCode)).map(cost => {
    const { m4: _national, ...area } = cost;
    const { note: _m2Note, ...m2 } = area.m2;
    const { note: _m3Note, ...m3 } = area.m3;
    return flatten({ ...area, m2, m3, inputRates: AREA_COST_INPUT_RATES, periods: AREA_COST_PERIODS,
      accommodatedAllowanceBasis: ACCOMMODATED_ALLOWANCE_BASIS });
  });
}
/** Union, so a column survives even when the first area's value for it is null. */
export const areaCostColumns = (rows = areaCostExportRows()) => [...new Set(rows.flatMap(row => Object.keys(row)))];
export function buildAreaCostMetadata() {
  const [first] = getAllAreaCosts();
  return {
    description: "Companion to area-cost.csv. Sources, notes and UK totals shared by every row. Blank CSV cells are unavailable values, never zero.",
    columns: areaCostColumns(),
    uk: AREA_COST_UK, dates: AREA_COST_DATES, inputRates: AREA_COST_INPUT_RATES, periods: AREA_COST_PERIODS,
    accommodatedAllowanceBasis: ACCOMMODATED_ALLOWANCE_BASIS, notes: { ...AREA_COST_NOTES, basis: first.m2.note, hypothetical: first.m3.note },
    nationalComparison: first.m4, sources: AREA_COST_SOURCES
  };
}
export function buildAreaCostCsv() {
  const rows = areaCostExportRows();
  const columns = areaCostColumns(rows);
  const cell = (value: Scalar | undefined) => value == null ? "" : `"${String(value).replaceAll('"', '""')}"`;
  return [columns.map(cell).join(","), ...rows.map(row => columns.map(key => cell(row[key])).join(","))].join("\r\n") + "\r\n";
}
export function buildAreaCostDataset(description: string) {
  return {
    "@context": "https://schema.org", "@type": "Dataset", "@id": `${SITE_URL}/cost/#dataset`,
    name: "Asylum support costs and relative burden by local authority", description,
    url: `${SITE_URL}/cost/`, creator: SITE_ORGANIZATION, publisher: SITE_ORGANIZATION,
    license: OGL_V3, isAccessibleForFree: true, temporalCoverage: AREA_COST_DATES.count,
    spatialCoverage: { "@type": "Country", name: "United Kingdom" },
    isBasedOn: [HOME_OFFICE_LOCAL_AUTHORITY_SOURCE,
      { "@type": "Dataset", name: AREA_COST_SOURCES.taxpayers.title, url: AREA_COST_SOURCES.taxpayers.landingPage },
      { "@type": "CreativeWork", name: `Home Office nightly rates, ${AREA_COST_DATES.rate}`, url: AREA_COST_SOURCES.rates.dispersal2026.url },
      { "@type": "CreativeWork", name: "Home Office asylum support allowances", url: AREA_COST_SOURCES.support.standard.url }],
    measurementTechnique: "Annualised priced components at a constant count. Full expenditure is unknown. Hotel pricing is a scenario. Null cells are blank, never zero.",
    variableMeasured: ["People on asylum support", "Annualised priced subtotal in GBP", "Unpriced people", "Hotel-rate share of subtotal", "Relative burden share", "Income taxpayers and 95% bounds"],
    distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE_URL}${AREA_COST_CSV_PATH}` },
      { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${SITE_URL}${AREA_COST_METADATA_PATH}` }]
  };
}
