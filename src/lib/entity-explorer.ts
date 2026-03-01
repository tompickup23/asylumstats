export interface EntityExplorerItem {
  entityId: string;
  entityName: string;
  primaryRole: string;
  routeFamilies: string[];
  currentSiteCount: number;
  moneyRecordCount: number;
  linkedAreaCount: number;
  unresolvedCurrentSiteCount: number;
  moneyRowsWithPublishedValueCount: number;
  score: number;
  searchText: string;
}

export interface EntityExplorerState {
  query: string;
  role: string;
  routeFamily: string;
  footprint: "all" | "named_estate" | "money_only" | "unresolved_estate";
  sort: "exposure" | "money" | "estate" | "title";
}

export interface EntityExplorerSummary {
  profileCount: number;
  namedEstateCount: number;
  moneyLinkedCount: number;
  unresolvedEstateCount: number;
  leadRole: string | null;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function compareExposure(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return (
    right.score - left.score ||
    right.unresolvedCurrentSiteCount - left.unresolvedCurrentSiteCount ||
    right.currentSiteCount - left.currentSiteCount ||
    right.moneyRecordCount - left.moneyRecordCount ||
    left.entityName.localeCompare(right.entityName)
  );
}

function compareMoney(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return (
    right.moneyRecordCount - left.moneyRecordCount ||
    right.moneyRowsWithPublishedValueCount - left.moneyRowsWithPublishedValueCount ||
    compareExposure(left, right)
  );
}

function compareEstate(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return (
    right.currentSiteCount - left.currentSiteCount ||
    right.linkedAreaCount - left.linkedAreaCount ||
    right.unresolvedCurrentSiteCount - left.unresolvedCurrentSiteCount ||
    compareExposure(left, right)
  );
}

function compareTitle(left: EntityExplorerItem, right: EntityExplorerItem): number {
  return left.entityName.localeCompare(right.entityName) || compareExposure(left, right);
}

export function filterEntityExplorerItems<T extends EntityExplorerItem>(
  items: T[],
  state: EntityExplorerState
): T[] {
  const query = normalise(state.query);

  return items.filter((item) => {
    const matchesQuery = !query || item.searchText.includes(query);
    const matchesRole = state.role === "all" || item.primaryRole === state.role;
    const matchesRoute = state.routeFamily === "all" || item.routeFamilies.includes(state.routeFamily);
    const matchesFootprint =
      state.footprint === "all" ||
      (state.footprint === "named_estate" && item.currentSiteCount > 0) ||
      (state.footprint === "money_only" && item.currentSiteCount === 0 && item.moneyRecordCount > 0) ||
      (state.footprint === "unresolved_estate" && item.unresolvedCurrentSiteCount > 0);

    return matchesQuery && matchesRole && matchesRoute && matchesFootprint;
  });
}

export function sortEntityExplorerItems<T extends EntityExplorerItem>(
  items: T[],
  sort: EntityExplorerState["sort"]
): T[] {
  const copy = [...items];

  copy.sort((left, right) => {
    switch (sort) {
      case "money":
        return compareMoney(left, right);
      case "estate":
        return compareEstate(left, right);
      case "title":
        return compareTitle(left, right);
      default:
        return compareExposure(left, right);
    }
  });

  return copy;
}

export function summarizeEntityExplorerItems(items: EntityExplorerItem[]): EntityExplorerSummary {
  const roleCounts = new Map<string, number>();

  for (const item of items) {
    roleCounts.set(item.primaryRole, (roleCounts.get(item.primaryRole) ?? 0) + 1);
  }

  const leadRole =
    [...roleCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ??
    null;

  return {
    profileCount: items.length,
    namedEstateCount: items.filter((item) => item.currentSiteCount > 0).length,
    moneyLinkedCount: items.filter((item) => item.moneyRecordCount > 0).length,
    unresolvedEstateCount: items.filter((item) => item.unresolvedCurrentSiteCount > 0).length,
    leadRole
  };
}
