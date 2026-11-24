import { fabricItemUrl } from "./fabric-portal";
import { buildAccessReviewRows } from "./governance";
import type { AtlasData, Item } from "./model";

const normalize = (value: string | undefined) => value?.trim().toLowerCase() ?? "";

/**
 * Whether the snapshot records a grant for this user on the item. Group
 * membership is not expanded, so `false` means "no known access", not denial.
 */
export function hasRecordedAccess(
  data: Pick<AtlasData, "items" | "principals" | "grants">,
  itemId: string,
  email: string | undefined,
): boolean {
  const expected = normalize(email);
  if (!expected) return false;
  const item = data.items.find((entry) => entry.fabricId === itemId);
  if (!item) return false;
  return buildAccessReviewRows({ ...data, items: [item] }).some(
    (row) =>
      row.effectiveAccess !== "none" &&
      (normalize(row.principal?.email) === expected ||
        row.applicableGrants.some((grant) => normalize(grant.principalRef) === expected)),
  );
}

export interface RequestAccessLinks {
  fabricUrl: string;
  mailto?: string;
}

export function requestAccessLinks(
  item: Pick<Item, "fabricId" | "displayName" | "itemType" | "ownerEmail">,
  workspace: Pick<AtlasData["workspace"], "fabricId" | "displayName">,
  portalBase?: string,
): RequestAccessLinks {
  const fabricUrl = fabricItemUrl(workspace.fabricId, item.fabricId, item.itemType, portalBase);
  const owner = item.ownerEmail?.trim();
  if (!owner || !owner.includes("@")) return { fabricUrl };
  const subject = `Access request: ${item.displayName}`;
  const body = [
    `Hello,`,
    ``,
    `Could you grant me access to the ${item.itemType} "${item.displayName}" in workspace "${workspace.displayName}"?`,
    `Fabric link: ${fabricUrl}`,
    ``,
    `Reason: `,
  ].join("\n");
  return {
    fabricUrl,
    mailto: `mailto:${owner.replace(/[?&#\s]/g, "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}
