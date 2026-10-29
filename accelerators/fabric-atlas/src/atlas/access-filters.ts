import type { AccessReviewRow } from "./governance";

export const PRINCIPAL_TYPE_FILTERS = ["user", "group", "servicePrincipal", "guest", "unknown"] as const;
export type PrincipalTypeFilter = "all" | (typeof PRINCIPAL_TYPE_FILTERS)[number];

export const PRINCIPAL_TYPE_LABELS: Record<(typeof PRINCIPAL_TYPE_FILTERS)[number], string> = {
  user: "User",
  group: "Group",
  // Fabric reports managed identities with the service principal type.
  servicePrincipal: "Service principal / managed identity",
  guest: "Guest (external)",
  unknown: "Unknown",
};

export const ROLE_FILTERS = ["Admin", "Member", "Contributor", "Viewer", "item"] as const;
export type RoleFilter = "all" | (typeof ROLE_FILTERS)[number];

export const ROLE_LABELS: Record<(typeof ROLE_FILTERS)[number], string> = {
  Admin: "Admin",
  Member: "Member",
  Contributor: "Contributor",
  Viewer: "Viewer",
  item: "Item-level",
};

/** Guest detection is a heuristic: Entra guest kind, external flag or a `#EXT#` UPN. */
export function isGuestPrincipal(row: AccessReviewRow): boolean {
  return (
    row.principal?.kind === "guest" ||
    row.principal?.external === true ||
    row.flags.includes("external") ||
    /#ext#/i.test(row.principal?.email ?? row.principalRef)
  );
}

export function principalTypeOf(row: AccessReviewRow): (typeof PRINCIPAL_TYPE_FILTERS)[number] {
  if (isGuestPrincipal(row)) return "guest";
  if (!row.principal || row.principalResolution !== "resolved") return "unknown";
  return row.principal.kind === "guest" ? "guest" : row.principal.kind;
}

export function rolesOf(row: AccessReviewRow): Set<(typeof ROLE_FILTERS)[number]> {
  const roles = new Set<(typeof ROLE_FILTERS)[number]>();
  for (const grant of row.applicableGrants) {
    if (grant.itemFabricId) roles.add("item");
    else if (grant.source === "workspaceRole" && ROLE_FILTERS.includes(grant.roleName as never)) {
      roles.add(grant.roleName as (typeof ROLE_FILTERS)[number]);
    }
  }
  return roles;
}

export function matchesAccessFilters(
  row: AccessReviewRow,
  principalType: PrincipalTypeFilter,
  role: RoleFilter,
): boolean {
  return (
    (principalType === "all" || principalTypeOf(row) === principalType) &&
    (role === "all" || rolesOf(row).has(role))
  );
}

/** Distinct principals per type, so a principal with many grants counts once. */
export function countPrincipalTypes(rows: readonly AccessReviewRow[]): Record<(typeof PRINCIPAL_TYPE_FILTERS)[number], number> {
  const seen = new Map<string, (typeof PRINCIPAL_TYPE_FILTERS)[number]>();
  for (const row of rows) if (!seen.has(row.principalKey)) seen.set(row.principalKey, principalTypeOf(row));
  const counts = Object.fromEntries(PRINCIPAL_TYPE_FILTERS.map((type) => [type, 0])) as Record<
    (typeof PRINCIPAL_TYPE_FILTERS)[number],
    number
  >;
  for (const type of seen.values()) counts[type] += 1;
  return counts;
}

export function parsePrincipalTypeFilter(value: unknown): PrincipalTypeFilter {
  return typeof value === "string" && (PRINCIPAL_TYPE_FILTERS as readonly string[]).includes(value)
    ? (value as PrincipalTypeFilter)
    : "all";
}

export function parseRoleFilter(value: unknown): RoleFilter {
  return typeof value === "string" && (ROLE_FILTERS as readonly string[]).includes(value) ? (value as RoleFilter) : "all";
}
