/** Lossless scalar export of the shared model, including nulls and source locators. */
import { getAllAreaCosts, AREA_COST_SOURCES, AREA_COST_UK, AREA_COST_DATES, AREA_COST_NOTES, AREA_COST_PERIODS, AREA_COST_INPUT_RATES, ACCOMMODATED_ALLOWANCE_BASIS } from "./area-cost";
import { OGL_V3, SITE_ORGANIZATION, HOME_OFFICE_LOCAL_AUTHORITY_SOURCE } from "./datasets";
import { SITE_URL } from "./site-identity";
export const AREA_COST_CSV_PATH = "/data/area-cost.csv";
type Scalar = string | number | boolean | null;
function flatten(value: unknown, prefix = "", out: Record<string, Scalar> = {}): Record<string, Scalar> {
  if (typeof value === "string" && /locator/i.test(prefix)) out[prefix] = encodeURI(value);
  else if (value === null || typeof value !== "object") out[prefix] = value as Scalar;
  else if (Array.isArray(value)) out[prefix] = JSON.stringify(value);
  else for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  return out;
}
export function areaCostExportRows() {
  return getAllAreaCosts().sort((a, b) => a.areaCode.localeCompare(b.areaCode)).map(cost => flatten({
    ...cost, inputRates: AREA_COST_INPUT_RATES, periods: AREA_COST_PERIODS, uk: AREA_COST_UK, sources: AREA_COST_SOURCES,
    locatorEncoding: "Source locators are URI encoded. Decode URI escapes for the exact workbook sheet names.",
    notes: AREA_COST_NOTES, accommodatedAllowanceBasis: ACCOMMODATED_ALLOWANCE_BASIS
  }));
}
export function buildAreaCostCsv() {
  const rows = areaCostExportRows();
  // Union preserves columns even when the first area's denominator or interval is null.
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
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
    distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE_URL}${AREA_COST_CSV_PATH}` }]
  };
}
