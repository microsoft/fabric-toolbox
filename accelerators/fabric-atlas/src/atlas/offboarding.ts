import {
  buildAccessReviewRows,
  getCoverageDiagnostics,
  selectAccessByPrincipal,
  type AccessReviewRow,
  type CoverageMetric,
  type PrincipalResolution,
} from "./governance";
import {
  createLineageIndex,
  getLineageImpact,
  type LineageImpactItem,
} from "./lineage";
import type { AtlasData, Item, Principal } from "./model";

export type OffboardingKind = "person-offboarding" | "principal-removal";
export type OwnershipStatus = "sole" | "shared" | "indeterminate";
export type ReassignmentReason =
  | "nearest-upstream-owner"
  | "component-owner"
  | "no-owner-candidate";

export interface OffboardingSubject {
  key: string;
  ref: string;
  resolution: PrincipalResolution;
  principal?: Principal;
  candidates: Principal[];
}

export interface OwnershipAssessment {
  item: Item;
  status: OwnershipStatus;
  otherOwners: Principal[];
  uncertainOwnerRefs: string[];
}

export interface OrphanRisk {
  item: Item;
  consumers: LineageImpactItem[];
}

export interface Reassignment {
  item: Item;
  suggested?: Principal;
  reasonCode: ReassignmentReason;
  reason: string;
}

export interface OffboardingReport {
  kind: OffboardingKind;
  subject: OffboardingSubject;
  blocked: boolean;
  warnings: string[];
  access: AccessReviewRow[];
  ownershipCoverage: CoverageMetric;
  owned: Item[];
  effectiveOwnerItems: Item[];
  ownership: OwnershipAssessment[];
  soleOwned: Item[];
  indeterminateOwnership: Item[];
  blastRadius: LineageImpactItem[];
  blastSources: Record<string, string[]>;
  orphanRisk: OrphanRisk[];
  reassignment: Reassignment[];
}

function normalize(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function uniquePrincipals(values: Array<Principal | undefined>): Principal[] {
  return [
    ...new Map(
      values
        .filter((value): value is Principal => !!value)
        .map((principal) => [normalize(principal.principalId), principal]),
    ).values(),
  ].sort((left, right) =>
    normalize(left.principalId).localeCompare(normalize(right.principalId)),
  );
}

function itemOwners(
  item: Item,
  rows: AccessReviewRow[],
  principals: Principal[],
): Principal[] {
  const byEmail = principals.filter(
    (principal) =>
      item.ownerEmail &&
      normalize(principal.email) === normalize(item.ownerEmail),
  );
  if (byEmail.length === 1) return byEmail;
  return uniquePrincipals(
    rows
      .filter(
        (row) =>
          row.itemId === item.fabricId &&
          row.effectiveAccess === "owner" &&
          row.principalResolution === "resolved",
      )
      .map((row) => row.principal),
  );
}

function eligibleSuccessors(
  owners: Principal[],
  subject: Principal,
): Principal[] {
  return owners.filter(
    (principal) =>
      principal.kind === "user" &&
      principal.external !== true &&
      normalize(principal.principalId) !==
        normalize(subject.principalId),
  );
}

export function buildOffboardingReport(
  data: AtlasData,
  principalIdOrKey: string,
): OffboardingReport {
  const allRows = buildAccessReviewRows(data);
  const access = selectAccessByPrincipal(allRows, principalIdOrKey);
  const exact = data.principals.find(
    (principal) =>
      normalize(principal.principalId) === normalize(principalIdOrKey),
  );
  const candidates = uniquePrincipals([
    exact,
    ...access.flatMap((row) => row.principalCandidates),
    ...access.map((row) => row.principal),
  ]);
  const ambiguous =
    access.some((row) => row.principalResolution === "ambiguous") ||
    (!exact && candidates.length > 1);
  const principal = exact ?? (candidates.length === 1 ? candidates[0] : undefined);
  const resolution: PrincipalResolution = ambiguous
    ? "ambiguous"
    : principal
      ? "resolved"
      : "unresolved";
  const subject: OffboardingSubject = {
    key: normalize(principal?.principalId ?? principalIdOrKey),
    ref: principal?.displayName ?? principalIdOrKey,
    resolution,
    principal,
    candidates,
  };
  const ownershipCoverage = getCoverageDiagnostics(data).byId.owners;
  const kind: OffboardingKind =
    principal?.kind === "user" || principal?.kind === "guest"
      ? "person-offboarding"
      : "principal-removal";
  const warnings = [
    "Ownership is limited to documented type-specific Fabric metadata.",
  ];
  if (kind === "principal-removal" && principal) {
    warnings.push(
      "Group membership is not expanded; this report evaluates the principal itself.",
    );
  }
  const blocked = resolution !== "resolved" || !principal;
  if (blocked) {
    warnings.unshift(
      "The principal is unresolved or ambiguous; ownership and reassignment claims are blocked.",
    );
    return {
      kind,
      subject,
      blocked,
      warnings,
      access,
      ownershipCoverage,
      owned: [],
      effectiveOwnerItems: [],
      ownership: [],
      soleOwned: [],
      indeterminateOwnership: [],
      blastRadius: [],
      blastSources: {},
      orphanRisk: [],
      reassignment: [],
    };
  }

  const owned =
    kind === "person-offboarding" && principal.email
      ? data.items.filter(
          (item) =>
            item.ownerEmail &&
            normalize(item.ownerEmail) === normalize(principal.email),
        )
      : [];
  const effectiveOwnerItems =
    kind === "principal-removal"
      ? access
          .filter((row) => row.effectiveAccess === "owner")
          .map((row) => row.item)
      : [];
  const roots = [
    ...new Map(
      [...owned, ...effectiveOwnerItems].map((item) => [
        item.fabricId,
        item,
      ]),
    ).values(),
  ];
  const ownership = roots.map((item): OwnershipAssessment => {
    const ownerRows = allRows.filter(
      (row) =>
        row.itemId === item.fabricId &&
        row.effectiveAccess === "owner" &&
        normalize(row.principalKey) !== subject.key &&
        normalize(row.principalId) !== normalize(principal.principalId),
    );
    const otherOwners = uniquePrincipals(
      ownerRows
        .filter((row) => row.principalResolution === "resolved")
        .map((row) => row.principal),
    );
    const uncertainOwnerRefs = [
      ...new Set(
        ownerRows
          .filter((row) => row.principalResolution !== "resolved")
          .map((row) => row.principalRef),
      ),
    ].sort();
    return {
      item,
      status: otherOwners.length
        ? "shared"
        : uncertainOwnerRefs.length
          ? "indeterminate"
          : "sole",
      otherOwners,
      uncertainOwnerRefs,
    };
  });
  const soleOwned = ownership
    .filter((assessment) => assessment.status === "sole")
    .map((assessment) => assessment.item);
  const indeterminateOwnership = ownership
    .filter((assessment) => assessment.status === "indeterminate")
    .map((assessment) => assessment.item);

  const lineage = createLineageIndex(data.edges);
  const blast = new Map<string, LineageImpactItem>();
  const blastSources = new Map<string, Set<string>>();
  const downstreamByRoot = new Map<string, LineageImpactItem[]>();
  for (const root of roots) {
    const path = getLineageImpact(lineage, root.fabricId).downstream;
    const consumers = [...path.ids]
      .map((id) => ({
        id,
        distance: path.distance.get(id) ?? Number.POSITIVE_INFINITY,
        item: data.items.find((item) => item.fabricId === id),
      }))
      .sort(
        (left, right) =>
          left.distance - right.distance || left.id.localeCompare(right.id),
      );
    downstreamByRoot.set(root.fabricId, consumers);
    for (const consumer of consumers) {
      const existing = blast.get(consumer.id);
      if (!existing || consumer.distance < existing.distance) {
        blast.set(consumer.id, consumer);
      }
      const sources = blastSources.get(consumer.id) ?? new Set<string>();
      sources.add(root.fabricId);
      blastSources.set(consumer.id, sources);
    }
  }
  const blastRadius = [...blast.values()].sort(
    (left, right) =>
      left.distance - right.distance || left.id.localeCompare(right.id),
  );
  const orphanRisk = soleOwned
    .map((item) => ({
      item,
      consumers: downstreamByRoot.get(item.fabricId) ?? [],
    }))
    .filter((risk) => risk.consumers.length > 0);

  const reassignment = soleOwned.map((item): Reassignment => {
    const upstream = getLineageImpact(lineage, item.fabricId).upstream;
    const upstreamItems = [...upstream.ids]
      .map((id) => ({
        item: data.items.find((candidate) => candidate.fabricId === id),
        distance: upstream.distance.get(id) ?? Number.POSITIVE_INFINITY,
      }))
      .filter(
        (value): value is { item: Item; distance: number } => !!value.item,
      )
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          left.item.fabricId.localeCompare(right.item.fabricId),
      );
    for (const distance of [...new Set(upstreamItems.map((value) => value.distance))]) {
      const atDistance = upstreamItems.filter(
        (value) => value.distance === distance,
      );
      const candidatesAtDistance = eligibleSuccessors(
        uniquePrincipals(
          atDistance.flatMap((value) =>
            itemOwners(value.item, allRows, data.principals),
          ),
        ),
        principal,
      );
      if (candidatesAtDistance.length) {
        const suggested = candidatesAtDistance[0];
        return {
          item,
          suggested,
          reasonCode: "nearest-upstream-owner",
          reason: `Nearest upstream owner: ${suggested.displayName} at distance ${distance}`,
        };
      }
    }

    const component = new Set<string>([item.fabricId]);
    const queue = [item.fabricId];
    for (let head = 0; head < queue.length; head += 1) {
      for (const neighbor of lineage.neighbors.get(queue[head]) ?? []) {
        if (!component.has(neighbor)) {
          component.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    const frequencies = new Map<string, { principal: Principal; count: number }>();
    for (const componentItem of data.items.filter((candidate) =>
      component.has(candidate.fabricId),
    )) {
      for (const candidate of eligibleSuccessors(
        itemOwners(componentItem, allRows, data.principals),
        principal,
      )) {
        const key = normalize(candidate.principalId);
        const value = frequencies.get(key) ?? { principal: candidate, count: 0 };
        value.count += 1;
        frequencies.set(key, value);
      }
    }
    const componentCandidate = [...frequencies.values()].sort(
      (left, right) =>
        right.count - left.count ||
        normalize(left.principal.principalId).localeCompare(
          normalize(right.principal.principalId),
        ),
    )[0];
    return componentCandidate
      ? {
          item,
          suggested: componentCandidate.principal,
          reasonCode: "component-owner",
          reason: `Most frequent owner in connected component: ${componentCandidate.principal.displayName} (${componentCandidate.count} items)`,
        }
      : {
          item,
          reasonCode: "no-owner-candidate",
          reason: "No eligible owner candidate",
        };
  });

  return {
    kind,
    subject,
    blocked,
    warnings,
    access,
    ownershipCoverage,
    owned,
    effectiveOwnerItems,
    ownership,
    soleOwned,
    indeterminateOwnership,
    blastRadius,
    blastSources: Object.fromEntries(
      [...blastSources].map(([id, sources]) => [id, [...sources].sort()]),
    ),
    orphanRisk,
    reassignment,
  };
}
