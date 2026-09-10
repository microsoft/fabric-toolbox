import { typeMeta, type Item } from "./model";

export type CatalogSortKey = "name" | "health" | "owner" | "refresh";
export type CatalogSortDirection = "asc" | "desc";

const HEALTH_ORDER = { failing: 0, stale: 1, healthy: 2, unknown: 3 };

function sortValue(item: Item, key: CatalogSortKey): string | number | undefined {
  if (key === "name") return item.displayName;
  if (key === "health") return HEALTH_ORDER[item.health];
  if (key === "owner") return item.ownerName?.trim() || item.ownerEmail?.trim() || undefined;
  const date = item.lastRefresh ? Date.parse(item.lastRefresh) : NaN;
  return Number.isFinite(date) ? date : undefined;
}

export function sortCatalogItems(
  items: readonly Item[],
  key: CatalogSortKey,
  direction: CatalogSortDirection,
): Item[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...items].sort((left, right) => {
    const a = sortValue(left, key);
    const b = sortValue(right, key);
    if (a == null && b != null) return 1;
    if (a != null && b == null) return -1;
    const difference =
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
    return difference * sign || left.fabricId.localeCompare(right.fabricId);
  });
}

export function groupCatalogItems(items: readonly Item[]) {
  const groups = new Map<Item["itemType"], Item[]>();
  for (const item of items) {
    const group = groups.get(item.itemType) ?? [];
    group.push(item);
    groups.set(item.itemType, group);
  }
  return [...groups].sort(([left], [right]) =>
    typeMeta(left).label.localeCompare(typeMeta(right).label),
  );
}
