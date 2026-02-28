import { describe, it, expect } from "vitest";
import { loadRouteDashboard, loadLocalRouteLatest } from "../src/lib/route-data";
import { loadHotelEntityLedger } from "../src/lib/hotel-data";
import { loadMoneyLedger } from "../src/lib/money-data";

describe("route-data loader", () => {
  const dashboard = loadRouteDashboard();
  const local = loadLocalRouteLatest();

  it("loads route dashboard with national cards", () => {
    expect(dashboard.nationalCards.length).toBeGreaterThan(0);
    expect(dashboard.nationalCards[0]).toHaveProperty("label");
    expect(dashboard.nationalCards[0]).toHaveProperty("value");
    expect(dashboard.nationalCards[0]).toHaveProperty("sourceUrl");
  });

  it("loads route families", () => {
    expect(dashboard.routeFamilies.length).toBeGreaterThan(0);
    expect(dashboard.routeFamilies[0]).toHaveProperty("id");
    expect(dashboard.routeFamilies[0]).toHaveProperty("series");
  });

  it("loads local route areas", () => {
    expect(local.areas.length).toBeGreaterThan(100);
    expect(local.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("areas have required fields", () => {
    const area = local.areas[0];
    expect(area).toHaveProperty("areaCode");
    expect(area).toHaveProperty("areaName");
    expect(area).toHaveProperty("supportedAsylum");
    expect(area).toHaveProperty("contingencyAccommodation");
    expect(area).toHaveProperty("homesForUkraineArrivals");
    expect(typeof area.population).toBe("number");
  });

  it("top areas by metric includes supportedAsylum", () => {
    const asylumGroup = local.topAreasByMetric.find((g) => g.metricId === "supportedAsylum");
    expect(asylumGroup).toBeDefined();
    expect(asylumGroup!.rows.length).toBeGreaterThan(0);
  });
});

describe("hotel-data loader", () => {
  const ledger = loadHotelEntityLedger();

  it("loads hotel entity ledger with summary", () => {
    expect(ledger.summary).toHaveProperty("totalNamedSites");
    expect(ledger.summary.totalNamedSites).toBeGreaterThan(0);
  });

  it("sites have required fields", () => {
    const site = ledger.sites[0];
    expect(site).toHaveProperty("siteId");
    expect(site).toHaveProperty("siteName");
    expect(site).toHaveProperty("status");
    expect(site).toHaveProperty("entityCoverage");
  });

  it("areas have sighting data", () => {
    expect(ledger.areas.length).toBeGreaterThan(0);
    expect(ledger.areas[0]).toHaveProperty("areaName");
    expect(ledger.areas[0]).toHaveProperty("unnamedSiteCount");
  });
});

describe("money-data loader", () => {
  const ledger = loadMoneyLedger();

  it("loads money ledger with records", () => {
    expect(ledger.records.length).toBeGreaterThan(0);
    expect(ledger.summary.totalRecords).toBeGreaterThan(0);
  });

  it("records have required fields", () => {
    const record = ledger.records[0];
    expect(record).toHaveProperty("recordId");
    expect(record).toHaveProperty("title");
    expect(record).toHaveProperty("buyerName");
    expect(record).toHaveProperty("scopeClass");
  });

  it("supplier profiles exist", () => {
    expect(ledger.supplierProfiles.length).toBeGreaterThan(0);
    expect(ledger.supplierProfiles[0]).toHaveProperty("entityName");
  });
});
