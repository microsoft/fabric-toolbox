import type { Principal } from "./model";

export interface PrincipalIndexes {
  byId: Map<string, Principal[]>;
  byEmail: Map<string, Principal[]>;
  byName: Map<string, Principal[]>;
}

export function normalizePrincipalReference(
  value: string | undefined,
): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function buildPrincipalIndexes(
  principals: readonly Principal[],
): PrincipalIndexes {
  const indexes: PrincipalIndexes = {
    byId: new Map(),
    byEmail: new Map(),
    byName: new Map(),
  };
  const add = (
    index: Map<string, Principal[]>,
    value: string | undefined,
    principal: Principal,
  ) => {
    const key = normalizePrincipalReference(value);
    if (!key) return;
    const matches = index.get(key) ?? [];
    matches.push(principal);
    index.set(key, matches);
  };

  for (const principal of principals) {
    add(indexes.byId, principal.principalId, principal);
    add(indexes.byEmail, principal.email, principal);
    add(indexes.byName, principal.displayName, principal);
  }
  return indexes;
}

export function principalCandidates(
  indexes: PrincipalIndexes,
  reference: string,
): Principal[] {
  const key = normalizePrincipalReference(reference);
  return indexes.byId.get(key) ??
    indexes.byEmail.get(key) ??
    indexes.byName.get(key) ??
    [];
}

export function uniquePrincipal(
  indexes: PrincipalIndexes,
  reference: string,
): Principal | undefined {
  const matches = principalCandidates(indexes, reference);
  return matches.length === 1 ? matches[0] : undefined;
}
