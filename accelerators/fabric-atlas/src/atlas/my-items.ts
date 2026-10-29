import type { GovernanceFinding } from "./governance";
import type { Item, Principal } from "./model";
import type { RadarEntry } from "./radar";

// "My items" scoping. Ownership is matched on the email only; an item whose
// owner Fabric did not expose is reported as unknown, never silently hidden.

export type Ownership = "mine" | "other" | "unknown";

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function itemOwnership(
  item: Pick<Item, "ownerEmail"> | undefined,
  userEmail: string | undefined,
): Ownership {
  const owner = normalized(item?.ownerEmail);
  if (!item || !owner) return "unknown";
  return owner === normalized(userEmail) ? "mine" : "other";
}

/** True when the user holds the Admin workspace role directly. */
export function isWorkspaceAdmin(
  principals: readonly Pick<Principal, "email" | "workspaceRole">[],
  userEmail: string | undefined,
): boolean {
  const email = normalized(userEmail);
  return (
    !!email &&
    principals.some(
      (principal) =>
        principal.workspaceRole === "Admin" && normalized(principal.email) === email,
    )
  );
}

export interface MyItemsScope {
  email: string;
  itemById: ReadonlyMap<string, Item>;
  workspaceAdmin: boolean;
}

export function myItemsScope(
  items: readonly Item[],
  principals: readonly Principal[],
  userEmail: string | undefined,
): MyItemsScope {
  return {
    email: normalized(userEmail),
    itemById: new Map(items.map((item) => [item.fabricId, item])),
    workspaceAdmin: isWorkspaceAdmin(principals, userEmail),
  };
}

function ownershipOfItemId(
  scope: MyItemsScope,
  itemId: string | undefined,
): Ownership {
  if (!itemId) return scope.workspaceAdmin ? "mine" : "other";
  return itemOwnership(scope.itemById.get(itemId), scope.email);
}

/** Item findings follow the item owner; workspace findings follow the Admin role. */
export function findingOwnership(
  finding: Pick<GovernanceFinding, "itemId">,
  scope: MyItemsScope,
): Ownership {
  return ownershipOfItemId(scope, finding.itemId);
}

export function radarEntryItemId(entry: RadarEntry): string | undefined {
  return (
    entry.delta?.finding.itemId ??
    entry.risk?.change.itemFabricId ??
    entry.incident?.incident.itemId ??
    undefined
  );
}

export function radarEntryOwnership(
  entry: RadarEntry,
  scope: MyItemsScope,
): Ownership {
  return ownershipOfItemId(scope, radarEntryItemId(entry));
}

/** Mine and unknown are kept in scope so a missing owner stays visible. */
export function inMyScope(ownership: Ownership): boolean {
  return ownership !== "other";
}

export function myScopedItems(
  items: readonly Item[],
  userEmail: string | undefined,
): Item[] {
  return items.filter((item) => inMyScope(itemOwnership(item, userEmail)));
}

export interface MyItemsSummary {
  mine: number;
  unknown: number;
  total: number;
}

export function summarizeMyItems(
  items: readonly Item[],
  userEmail: string | undefined,
): MyItemsSummary {
  let mine = 0;
  let unknown = 0;
  for (const item of items) {
    const ownership = itemOwnership(item, userEmail);
    if (ownership === "mine") mine += 1;
    else if (ownership === "unknown") unknown += 1;
  }
  return { mine, unknown, total: items.length };
}
