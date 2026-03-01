import { describe, expect, it } from "vitest";
import {
  filterEntityExplorerItems,
  sortEntityExplorerItems,
  summarizeEntityExplorerItems,
  type EntityExplorerItem
} from "../src/lib/entity-explorer";

const items: EntityExplorerItem[] = [
  {
    entityId: "supplier_serco",
    entityName: "Serco",
    primaryRole: "prime_provider",
    routeFamilies: ["asylum_support"],
    currentSiteCount: 2,
    moneyRecordCount: 1,
    linkedAreaCount: 1,
    unresolvedCurrentSiteCount: 2,
    moneyRowsWithPublishedValueCount: 0,
    score: 520,
    searchText: "serco prime provider asylum support phoenix hotel bell hotel epping forest"
  },
  {
    entityId: "supplier_oc331910",
    entityName: "Splendid Hospitality Group LLP",
    primaryRole: "owner_group",
    routeFamilies: [],
    currentSiteCount: 1,
    moneyRecordCount: 0,
    linkedAreaCount: 1,
    unresolvedCurrentSiteCount: 1,
    moneyRowsWithPublishedValueCount: 0,
    score: 280,
    searchText: "splendid hospitality group llp owner group stanwell hotel spelthorne"
  },
  {
    entityId: "supplier_participating_local_authorities",
    entityName: "Participating local authorities",
    primaryRole: "public_body",
    routeFamilies: ["homes_for_ukraine", "asylum_support"],
    currentSiteCount: 0,
    moneyRecordCount: 6,
    linkedAreaCount: 0,
    unresolvedCurrentSiteCount: 0,
    moneyRowsWithPublishedValueCount: 3,
    score: 300,
    searchText: "participating local authorities public body homes for ukraine asylum support"
  }
];

describe("entity explorer helpers", () => {
  it("filters by query, role, route family, and footprint", () => {
    const filtered = filterEntityExplorerItems(items, {
      query: "hotel",
      role: "owner_group",
      routeFamily: "all",
      footprint: "named_estate",
      sort: "exposure"
    });

    expect(filtered.map((item) => item.entityId)).toEqual(["supplier_oc331910"]);
  });

  it("filters money-only public bodies and sorts by money rows", () => {
    const filtered = filterEntityExplorerItems(items, {
      query: "",
      role: "public_body",
      routeFamily: "homes_for_ukraine",
      footprint: "money_only",
      sort: "money"
    });
    const ordered = sortEntityExplorerItems(filtered, "money");

    expect(ordered.map((item) => item.entityId)).toEqual(["supplier_participating_local_authorities"]);
  });

  it("summarizes named-estate and money-linked counts", () => {
    const summary = summarizeEntityExplorerItems(items);

    expect(summary.profileCount).toBe(3);
    expect(summary.namedEstateCount).toBe(2);
    expect(summary.moneyLinkedCount).toBe(2);
    expect(summary.unresolvedEstateCount).toBe(2);
    expect(summary.leadRole).toBe("owner_group");
  });
});
