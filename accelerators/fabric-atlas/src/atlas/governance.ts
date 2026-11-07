import type {
  AccessLevel,
  AtlasData,
  Edge,
  Grant,
  Item,
  Principal,
} from "./model";
import {
  buildPrincipalIndexes,
  normalizePrincipalReference,
  principalCandidates,
  type PrincipalIndexes,
} from "./principal-resolution";
import { isItemMetadataSchemaEntry } from "./item-metadata";
import { lineageEdgeKey } from "./lineage";
import { searchJobId } from "./search";
import { buildAccessEvidenceCoverage, type AccessEvidenceCoverage } from "./access-coverage";
import { domainIndex, domainPath, type GovernanceEvidence } from "./governance-evidence";

export type AccessOrigin = "workspace" | "item" | "mixed";
export type PrincipalResolution = "resolved" | "unresolved" | "ambiguous";

export interface AccessReviewRow {
  id: string;
  item: Item;
  itemId: string;
  principal?: Principal;
  principalId?: string;
  principalRef: string;
  principalKey: string;
  principalResolution: PrincipalResolution;
  principalCandidates: Principal[];
  effectiveAccess: AccessLevel;
  origin: AccessOrigin;
  applicableGrants: Grant[];
  effectiveGrants: Grant[];
  flags: NonNullable<Grant["flag"]>[];
  coverage: AccessEvidenceCoverage;
}

export interface AccessReviewSummary {
  rows: number;
  items: number;
  principals: number;
  byAccessLevel: Record<AccessLevel, number>;
  byOrigin: Record<AccessOrigin, number>;
  flagged: number;
  unresolved: number;
  ambiguous: number;
}

export type GovernanceSeverity = "critical" | "high" | "medium" | "low";
export type GovernanceCategory =
  | "access"
  | "metadata"
  | "operations"
  | "lineage";

export interface GovernanceFindingTarget {
  kind: "workspace" | "item" | "principal" | "job" | "edge";
  itemId?: string;
  principalId?: string;
  principalRef?: string;
  jobId?: string;
  edgeKey?: string;
}

export interface GovernanceFinding {
  id: string;
  severity: GovernanceSeverity;
  category: GovernanceCategory;
  title: string;
  detail: string;
  recommendation: string;
  evidenceIds: string[];
  target?: GovernanceFindingTarget;
  itemId?: string;
  principalId?: string;
  jobId?: string;
  edgeKey?: string;
  /** Group summary shared by every finding of the same rule. */
  groupDetail?: string;
}

export type CoverageState =
  | "complete"
  | "partial"
  | "no-values"
  | "not-applicable";

export type CoverageMetricId =
  | "descriptions"
  | "owners"
  | "sensitivity"
  | "endorsement"
  | "schema-inventory"
  | "table-descriptions"
  | "column-descriptions"
  | "measure-descriptions"
  | "technical-metadata";

export interface CoverageMetric {
  id: CoverageMetricId;
  label: string;
  numerator: number;
  denominator: number;
  percentage: number | null;
  state: CoverageState;
}

export interface CoverageDiagnostics {
  metrics: CoverageMetric[];
  byId: Record<CoverageMetricId, CoverageMetric>;
}

const ACCESS_RANK: Record<AccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  owner: 3,
};

const ACCESS_LEVELS: AccessLevel[] = ["none", "view", "edit", "owner"];
const ACCESS_ORIGINS: AccessOrigin[] = ["workspace", "item", "mixed"];
const FLAG_ORDER: NonNullable<Grant["flag"]>[] = [
  "external",
  "broad",
  "servicePrincipal",
  "admin",
];
const SEVERITY_RANK: Record<GovernanceSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SCHEMA_CAPABLE_ITEM_TYPES = new Set<Item["itemType"]>([
  "Lakehouse",
  "Warehouse",
  "KQLDatabase",
  "SQLEndpoint",
  "SQLDatabase",
  "SemanticModel",
  "Ontology",
  "GraphModel",
  "DataAgent",
]);

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function meaningful(value: string | undefined): boolean {
  return normalize(value).length > 0;
}

function itemHasSensitivity(item: Item): boolean {
  return meaningful(item.sensitivity) || meaningful(item.sensitivityLabelId);
}

/**
 * Rank of a standard Microsoft Purview label name. Label priorities are not
 * collected, so only the well-known default taxonomy is compared; custom
 * names stay unranked and never raise a finding.
 */
export function standardLabelRank(name: string | undefined): number | undefined {
  const value = name?.trim().toLowerCase() ?? "";
  if (!value) return undefined;
  if (/highly confidential|restricted|secret/.test(value)) return 3;
  if (/confidential/.test(value)) return 2;
  if (/general|internal/.test(value)) return 1;
  if (/public|personal|non-business/.test(value)) return 0;
  return undefined;
}

/** Label name for a label id, read from items that carry both. */
function labelNameFromItems(items: readonly Item[], labelId: string): string | undefined {
  const id = labelId.toLowerCase();
  return items.find((item) => item.sensitivityLabelId?.toLowerCase() === id && meaningful(item.sensitivity))
    ?.sensitivity;
}

function eligibleItems(
  items: Item[],
  availability: keyof Pick<
    Item,
    | "ownerMetadataAvailable"
    | "sensitivityMetadataAvailable"
    | "endorsementMetadataAvailable"
    | "tagMetadataAvailable"
  >,
  hasLegacyEvidence: (item: Item) => boolean,
): Item[] {
  const hasExplicitStatus = items.some(
    (item) => item[availability] !== undefined,
  );
  if (hasExplicitStatus) {
    return items.filter((item) => item[availability] === true);
  }
  return items.some(hasLegacyEvidence) ? items : [];
}

function stablePart(value: string): string {
  return encodeURIComponent(normalize(value) || "(blank)");
}

function grantScope(grant: Grant): "workspace" | "item" {
  return grant.itemFabricId ? "item" : "workspace";
}

function compareGrants(left: Grant, right: Grant): number {
  return (
    compareText(grantScope(left), grantScope(right)) ||
    ACCESS_RANK[right.accessLevel] - ACCESS_RANK[left.accessLevel] ||
    compareText(left.source, right.source) ||
    compareText(normalize(left.roleName), normalize(right.roleName)) ||
    compareText(normalize(left.principalRef), normalize(right.principalRef)) ||
    compareText(left.itemFabricId ?? "", right.itemFabricId ?? "")
  );
}

interface ResolvedGrant {
  grant: Grant;
  key: string;
  resolution: PrincipalResolution;
  principal?: Principal;
  candidates: Principal[];
}

function resolveGrant(
  grant: Grant,
  indexes: PrincipalIndexes,
): ResolvedGrant {
  const ref = normalizePrincipalReference(grant.principalRef);
  const candidates = principalCandidates(indexes, grant.principalRef);
  const orderedCandidates = [...candidates].sort((left, right) =>
    compareText(left.principalId, right.principalId),
  );

  if (orderedCandidates.length === 1) {
    const principal = orderedCandidates[0];
    return {
      grant,
      key: `principal:${principal.principalId}`,
      resolution: "resolved",
      principal,
      candidates: orderedCandidates,
    };
  }

  const resolution: PrincipalResolution =
    orderedCandidates.length > 1 ? "ambiguous" : "unresolved";
  return {
    grant,
    key: `${resolution}:${ref || "(blank)"}`,
    resolution,
    candidates: orderedCandidates,
  };
}

export function highestRecordedGrant(grants: readonly Grant[]): AccessLevel {
  return grants.reduce<AccessLevel>(
    (highest, grant) =>
      ACCESS_RANK[grant.accessLevel] > ACCESS_RANK[highest]
        ? grant.accessLevel
        : highest,
    "none",
  );
}

export function buildAccessReviewRows(
  data: Pick<AtlasData, "items" | "principals" | "grants"> &
    Partial<Pick<AtlasData, "workspace">>,
): AccessReviewRow[] {
  const indexes = buildPrincipalIndexes(data.principals);
  const resolvedGrants = data.grants.map((grant) =>
    resolveGrant(grant, indexes),
  );
  const rows: AccessReviewRow[] = [];

  for (const item of data.items) {
    const applicable = resolvedGrants.filter(
      ({ grant }) =>
        !grant.itemFabricId || grant.itemFabricId === item.fabricId,
    );
    const byPrincipal = new Map<string, ResolvedGrant[]>();
    for (const resolved of applicable) {
      const grants = byPrincipal.get(resolved.key) ?? [];
      grants.push(resolved);
      byPrincipal.set(resolved.key, grants);
    }

    for (const [principalKey, grouped] of byPrincipal) {
      const applicableGrants = grouped
        .map(({ grant }) => grant)
        .sort(compareGrants);
      const effectiveAccess = highestRecordedGrant(applicableGrants);
      const effectiveGrants = applicableGrants.filter(
        (grant) => grant.accessLevel === effectiveAccess,
      );
      const hasWorkspace = applicableGrants.some(
        (grant) => !grant.itemFabricId,
      );
      const hasItem = applicableGrants.some(
        (grant) => grant.itemFabricId === item.fabricId,
      );
      const origin: AccessOrigin =
        hasWorkspace && hasItem ? "mixed" : hasWorkspace ? "workspace" : "item";
      const first = grouped[0];
      const refs = [...new Set(applicableGrants.map((grant) => grant.principalRef))]
        .sort((left, right) => compareText(normalize(left), normalize(right)));
      const flags = FLAG_ORDER.filter((flag) =>
        applicableGrants.some((grant) => grant.flag === flag),
      );

      rows.push({
        id: `access:${stablePart(item.fabricId)}:${stablePart(principalKey)}`,
        item,
        itemId: item.fabricId,
        principal: first.principal,
        principalId: first.principal?.principalId,
        principalRef:
          first.principal?.displayName ?? refs[0] ?? "(unresolved principal)",
        principalKey,
        principalResolution: first.resolution,
        principalCandidates: first.candidates,
        effectiveAccess,
        origin,
        applicableGrants,
        effectiveGrants,
        flags,
        coverage: buildAccessEvidenceCoverage(applicableGrants, data.workspace),
      });
    }
  }

  return rows.sort(
    (left, right) =>
      compareText(normalize(left.item.displayName), normalize(right.item.displayName)) ||
      compareText(left.itemId, right.itemId) ||
      compareText(normalize(left.principalRef), normalize(right.principalRef)) ||
      compareText(left.principalKey, right.principalKey),
  );
}

export const buildEffectiveAccess = buildAccessReviewRows;

export function selectAccessByItem(
  rows: AccessReviewRow[],
  itemId: string,
): AccessReviewRow[] {
  return rows.filter((row) => row.itemId === itemId);
}

export function selectAccessByPrincipal(
  rows: AccessReviewRow[],
  principalIdOrRef: string,
): AccessReviewRow[] {
  const expected = normalize(principalIdOrRef);
  return rows.filter(
    (row) =>
      normalize(row.principalId) === expected ||
      normalize(row.principalRef) === expected ||
      normalize(row.principalKey) === expected ||
      row.applicableGrants.some(
        (grant) => normalize(grant.principalRef) === expected,
      ),
  );
}

export const accessRowsForItem = selectAccessByItem;
export const accessRowsForPrincipal = selectAccessByPrincipal;

export function summarizeAccessReview(
  rows: AccessReviewRow[],
): AccessReviewSummary {
  const byAccessLevel = Object.fromEntries(
    ACCESS_LEVELS.map((level) => [level, 0]),
  ) as Record<AccessLevel, number>;
  const byOrigin = Object.fromEntries(
    ACCESS_ORIGINS.map((origin) => [origin, 0]),
  ) as Record<AccessOrigin, number>;

  for (const row of rows) {
    byAccessLevel[row.effectiveAccess] += 1;
    byOrigin[row.origin] += 1;
  }

  return {
    rows: rows.length,
    items: new Set(rows.map((row) => row.itemId)).size,
    principals: new Set(rows.map((row) => row.principalKey)).size,
    byAccessLevel,
    byOrigin,
    flagged: rows.filter((row) => row.flags.length > 0).length,
    unresolved: rows.filter(
      (row) => row.principalResolution === "unresolved",
    ).length,
    ambiguous: rows.filter(
      (row) => row.principalResolution === "ambiguous",
    ).length,
  };
}

export const getAccessReviewSummary = summarizeAccessReview;

function grantEvidence(grant: Grant): string {
  return [
    "grant",
    grant.itemFabricId ?? "workspace",
    normalize(grant.principalRef) || "(blank)",
    grant.source,
    grant.accessLevel,
    grant.roleName ?? "",
  ].join(":");
}

/**
 * Default sensitivity label that applies to the workspace domain (own default,
 * otherwise inherited from the parent domain). Undefined unless the admin
 * domain list was read completely and exposes a default label.
 */
export function workspaceDomainDefaultLabel(
  evidence: GovernanceEvidence | undefined,
  domainId: string | undefined,
): { labelId: string; domainId: string; domainPath: string } | undefined {
  if (!evidence || evidence.domains.status.status !== "complete") return undefined;
  if (!domainId || domainId === "unassigned") return undefined;
  const index = domainIndex(evidence);
  const domain = index.get(domainId.toLowerCase());
  if (!domain) return undefined;
  const parent = domain.parentDomainId ? index.get(domain.parentDomainId) : undefined;
  const source = domain.defaultSensitivityLabelId ? domain : parent?.defaultSensitivityLabelId ? parent : undefined;
  if (!source?.defaultSensitivityLabelId) return undefined;
  return {
    labelId: source.defaultSensitivityLabelId,
    domainId: source.id,
    domainPath: domainPath(evidence, domain.id) ?? domain.displayName,
  };
}

export type WorkspaceAdminStatus =
  | { status: "identified"; admins: string[] }
  | { status: "missing" }
  | { status: "unknown"; reason: string };

/**
 * Whether the workspace has an identified Admin. "missing" is only reported
 * from a complete access collection; anything else stays Unknown.
 */
export function workspaceAdminStatus(
  data: Pick<AtlasData, "principals" | "grants" | "workspace">,
): WorkspaceAdminStatus {
  const admins = new Set<string>();
  for (const principal of data.principals) {
    if (principal.workspaceRole === "Admin") admins.add(principal.displayName || principal.principalId);
  }
  for (const grant of data.grants) {
    if (!grant.itemFabricId && grant.source === "workspaceRole" && grant.roleName === "Admin") {
      admins.add(grant.principalRef);
    }
  }
  if (admins.size) return { status: "identified", admins: [...admins].sort() };
  const section = data.workspace.syncSections?.access;
  if (section?.status !== "complete") {
    return {
      status: "unknown",
      reason: section
        ? `Access collection is ${section.status}; workspace roles may be incomplete.`
        : "Access collection status is not recorded in this snapshot.",
    };
  }
  if (!data.principals.length && !data.grants.some((grant) => !grant.itemFabricId)) {
    return { status: "unknown", reason: "No workspace role assignment was returned." };
  }
  return { status: "missing" };
}

function findingId(rule: string, ...parts: string[]): string {
  return [rule, ...parts.map(stablePart)].join(":");
}

function accessTarget(row: AccessReviewRow): GovernanceFindingTarget {
  return row.principalId
    ? {
        kind: "principal",
        itemId: row.itemId,
        principalId: row.principalId,
        principalRef: row.principalRef,
      }
    : {
        kind: "item",
        itemId: row.itemId,
        principalRef: row.principalRef,
      };
}

function pushAccessFinding(
  findings: GovernanceFinding[],
  row: AccessReviewRow,
  rule: string,
  severity: GovernanceSeverity,
  title: string,
  detail: string,
  recommendation: string,
  grants: Grant[],
): void {
  findings.push({
    id: findingId(rule, row.itemId, row.principalKey),
    severity,
    category: "access",
    title,
    detail,
    recommendation,
    evidenceIds: [...new Set(grants.map(grantEvidence))].sort(compareText),
    target: accessTarget(row),
    itemId: row.itemId,
    principalId: row.principalId,
  });
}

function edgeEvidence(edge: Edge): string {
  return `edge:${lineageEdgeKey(edge)}`;
}

export function buildGovernanceFindings(
  data: Pick<
    AtlasData,
    "workspace" | "items" | "principals" | "grants" | "jobs" | "edges"
  > &
    Partial<Pick<AtlasData, "schema" | "governanceEvidence">>,
): GovernanceFinding[] {
  const findings: GovernanceFinding[] = [];
  const accessRows = buildAccessReviewRows(data);

  for (const row of accessRows) {
    if (row.effectiveAccess === "none") continue;
    const external =
      row.principal?.kind === "guest" ||
      row.principal?.external === true ||
      row.flags.includes("external");
    if (external) {
      pushAccessFinding(
        findings,
        row,
        "external-access",
        "high",
        `External access to ${row.item.displayName}`,
        `${row.principalRef} has recorded ${row.effectiveAccess} grants. Restriction evidence is not evaluated.`,
        "Confirm the external access is required and remove grants that are no longer justified.",
        row.applicableGrants,
      );
    }

    const broadGrants = row.applicableGrants.filter(
      (grant) =>
        grant.accessLevel !== "none" &&
        (grant.source === "orgLink" || grant.flag === "broad"),
    );
    if (broadGrants.length > 0) {
      pushAccessFinding(
        findings,
        row,
        "broad-access",
        "high",
        `Broad access to ${row.item.displayName}`,
        `${row.principalRef} receives access through an explicit organization link or broad grant.`,
        "Replace broad access with a named group or principal where practical.",
        broadGrants,
      );
    }

    if (row.origin === "item") {
      pushAccessFinding(
        findings,
        row,
        "item-only-access",
        "low",
        `Item-only access to ${row.item.displayName}`,
        `${row.principalRef} has access only through item-level grants.`,
        "Review the item grant and document why workspace access is not appropriate.",
        row.applicableGrants,
      );
    }

    const servicePrincipal =
      row.principal?.kind === "servicePrincipal" ||
      row.flags.includes("servicePrincipal");
    if (servicePrincipal) {
      pushAccessFinding(
        findings,
        row,
        "service-principal-access",
        "medium",
        `Service principal access to ${row.item.displayName}`,
        `${row.principalRef} has recorded ${row.effectiveAccess} grants. Restriction evidence is not evaluated.`,
        "Verify the application owner, credential lifecycle, and minimum required permission.",
        row.applicableGrants,
      );
    }
  }

  const adminPrincipals = data.principals.filter(
    (principal) => principal.workspaceRole === "Admin",
  );
  const workspaceAdminGrants = data.grants.filter((grant) => {
    if (grant.itemFabricId || grant.source !== "workspaceRole") return false;
    if (normalize(grant.roleName) === "admin" || grant.flag === "admin") {
      return true;
    }
    const ref = normalize(grant.principalRef);
    return adminPrincipals.some(
      (principal) =>
        normalize(principal.principalId) === ref ||
        normalize(principal.email) === ref ||
        normalize(principal.displayName) === ref,
    );
  });
  const adminRefs = new Set(
    adminPrincipals.map((principal) => `principal:${principal.principalId}`),
  );
  const indexes = buildPrincipalIndexes(data.principals);
  workspaceAdminGrants.forEach((grant) =>
    adminRefs.add(resolveGrant(grant, indexes).key),
  );
  if (adminRefs.size > 2) {
    findings.push({
      id: findingId("excess-workspace-admins", data.workspace.fabricId),
      severity: "medium",
      category: "access",
      title: "Workspace has excess administrators",
      detail: `${adminRefs.size} principals have explicit workspace administrator roles or grants; the recommended maximum is 2.`,
      recommendation:
        "Retain only the administrators required for workspace recovery and operations.",
      evidenceIds: [
        ...adminPrincipals.map(
          (principal) =>
            `principal:${principal.principalId}:workspaceRole:Admin`,
        ),
        ...workspaceAdminGrants.map(grantEvidence),
      ].sort(compareText),
      target: { kind: "workspace" },
    });
  }

  const ownerEligibleItems = new Set(
    eligibleItems(
      data.items,
      "ownerMetadataAvailable",
      (item) => meaningful(item.ownerName) || meaningful(item.ownerEmail),
    ).map((item) => item.fabricId),
  );
  const sensitivityEligibleItems = new Set(
    eligibleItems(
      data.items,
      "sensitivityMetadataAvailable",
      itemHasSensitivity,
    ).map((item) => item.fabricId),
  );

  const domainDefault = workspaceDomainDefaultLabel(
    data.governanceEvidence,
    data.workspace.fabricDomainId,
  );

  const defaultLabelName = domainDefault ? labelNameFromItems(data.items, domainDefault.labelId) : undefined;
  const defaultLabelRank = standardLabelRank(defaultLabelName);
  const belowDefault =
    domainDefault && defaultLabelName && defaultLabelRank !== undefined
      ? data.items.filter((item) => {
          if (!sensitivityEligibleItems.has(item.fabricId) || !meaningful(item.sensitivity)) return false;
          const rank = standardLabelRank(item.sensitivity);
          return rank !== undefined && rank < defaultLabelRank;
        })
      : [];
  if (domainDefault && defaultLabelName && belowDefault.length > 0) {
    const carried = [...new Set(belowDefault.map((item) => item.sensitivity!))].join(" or ");
    const names = belowDefault.map((item) => item.displayName);
    const listed = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    const groupDetail = `Domain ${domainDefault.domainPath} sets default label ${defaultLabelName}. ${listed} ${names.length > 1 ? "carry" : "carries"} ${carried}.`;
    for (const item of belowDefault) {
      findings.push({
        id: findingId("domain-default-label-below", item.fabricId),
        severity: "high",
        category: "metadata",
        title: `Label below domain default: ${item.displayName}`,
        detail: `Domain ${domainDefault.domainPath} sets default label ${defaultLabelName}; this item carries ${item.sensitivity}.`,
        recommendation: `Raise the label to ${defaultLabelName} or record a justified exception.`,
        evidenceIds: [
          `item:${item.fabricId}:sensitivity`,
          `domain:${domainDefault.domainId}:defaultLabel:${domainDefault.labelId}`,
        ],
        target: { kind: "item", itemId: item.fabricId },
        itemId: item.fabricId,
        groupDetail,
      });
    }
  }

  for (const item of data.items) {
    if (item.health === "failing" || item.health === "stale") {
      const failing = item.health === "failing";
      findings.push({
        id: findingId(`${item.health}-item`, item.fabricId),
        severity: failing ? "critical" : "medium",
        category: "operations",
        title: `${failing ? "Failing" : "Stale"} item: ${item.displayName}`,
        detail: `${item.displayName} is explicitly reported as ${item.health}.`,
        recommendation: failing
          ? "Investigate the latest run and restore the item to a healthy state."
          : "Confirm the refresh schedule and whether the item is still in use.",
        evidenceIds: [`item:${item.fabricId}:health:${item.health}`],
        target: { kind: "item", itemId: item.fabricId },
        itemId: item.fabricId,
      });
    }

    if (
      ownerEligibleItems.has(item.fabricId) &&
      !meaningful(item.ownerName) &&
      !meaningful(item.ownerEmail)
    ) {
      findings.push({
        id: findingId("missing-owner", item.fabricId),
        severity: "medium",
        category: "metadata",
        title: `Missing owner: ${item.displayName}`,
        detail:
          "Owner metadata is present elsewhere in this snapshot, but this item has no owner.",
        recommendation: "Assign and record an accountable owner for this item.",
        evidenceIds: [`item:${item.fabricId}:owner`],
        target: { kind: "item", itemId: item.fabricId },
        itemId: item.fabricId,
      });
    }

    if (
      item.endorsement === "certified" &&
      !meaningful(item.description)
    ) {
      findings.push({
        id: findingId("certified-missing-description", item.fabricId),
        severity: "medium",
        category: "metadata",
        title: `Certified without description: ${item.displayName}`,
        detail:
          "This item is certified, but consumers have no description explaining what it contains or how to use it.",
        recommendation:
          "Add a description in the item settings before relying on the certification.",
        evidenceIds: [
          `item:${item.fabricId}:endorsement:certified`,
          `item:${item.fabricId}:description`,
        ],
        target: { kind: "item", itemId: item.fabricId },
        itemId: item.fabricId,
      });
    }

    if (
      sensitivityEligibleItems.has(item.fabricId) &&
      !itemHasSensitivity(item) &&
      item.endorsement === "certified"
    ) {
      findings.push({
        id: findingId("certified-missing-sensitivity", item.fabricId),
        severity: "high",
        category: "metadata",
        title: `Certified without sensitivity label: ${item.displayName}`,
        detail:
          "This item is certified, so it is likely to be widely reused, but it carries no sensitivity label.",
        recommendation:
          "Apply the appropriate sensitivity label before the certified item is shared further.",
        evidenceIds: [
          `item:${item.fabricId}:endorsement:certified`,
          `item:${item.fabricId}:sensitivity`,
        ],
        target: { kind: "item", itemId: item.fabricId },
        itemId: item.fabricId,
      });
    } else if (
      domainDefault &&
      sensitivityEligibleItems.has(item.fabricId) &&
      !itemHasSensitivity(item)
    ) {
      // Label priorities are not collected, so only a missing label is
      // reported against the domain default, never a "lower" label.
      findings.push({
        id: findingId("domain-default-label-missing", item.fabricId),
        severity: "medium",
        category: "metadata",
        title: `No label despite domain default: ${item.displayName}`,
        detail: `Domain ${domainDefault.domainPath} defines a default sensitivity label, but this item carries no label.`,
        recommendation:
          "Apply the domain default sensitivity label, or a more restrictive one, in Fabric.",
        evidenceIds: [
          `item:${item.fabricId}:sensitivity`,
          `domain:${domainDefault.domainId}:defaultLabel:${domainDefault.labelId}`,
        ],
        target: { kind: "item", itemId: item.fabricId },
        itemId: item.fabricId,
      });
    } else if (
      sensitivityEligibleItems.has(item.fabricId) &&
      !itemHasSensitivity(item)
    ) {
      findings.push({
        id: findingId("missing-sensitivity", item.fabricId),
        severity: "low",
        category: "metadata",
        title: `Missing sensitivity label: ${item.displayName}`,
        detail:
          "Sensitivity metadata is present elsewhere in this snapshot, but this item has no label.",
        recommendation:
          "Classify the item and apply the appropriate sensitivity label.",
        evidenceIds: [`item:${item.fabricId}:sensitivity`],
        target: { kind: "item", itemId: item.fabricId },
        itemId: item.fabricId,
      });
    }
  }

  findings.push(
    ...endorsedInactiveFindings(data.items, data.workspace.syncedAt),
    ...itemInactiveFindings(data.items, data.jobs, data.workspace.syncedAt),
    ...objectDescriptionFindings(data.items, data.schema),
  );

  if (workspaceAdminStatus(data).status === "missing") {
    findings.push({
      id: findingId("workspace-no-admin", data.workspace.fabricId),
      severity: "medium",
      category: "access",
      title: "Workspace has no identified Admin",
      detail:
        "The complete workspace role collection contains no Admin, so no accountable owner is identified for this workspace.",
      recommendation:
        "Assign an accountable person or group as workspace Admin in Fabric.",
      evidenceIds: [`workspace:${data.workspace.fabricId}:roles:no-admin`],
      target: { kind: "workspace" },
    });
  }

  if (data.workspace.fabricDomainId === UNASSIGNED_DOMAIN) {
    findings.push({
      id: findingId("workspace-no-domain", data.workspace.fabricId),
      severity: "low",
      category: "metadata",
      title: "Workspace is not assigned to a domain",
      detail:
        "The Fabric workspace API reports no domain for this workspace, so it is missing from domain-based discovery in the OneLake catalog.",
      recommendation:
        "Ask a Fabric or domain administrator to assign the workspace to its business domain.",
      evidenceIds: [`workspace:${data.workspace.fabricId}:domain:unassigned`],
      target: { kind: "workspace" },
    });
  }

  // Only raised from a complete admin domain list with a known tenant-wide count of zero.
  if (data.governanceEvidence?.domains.status.status === "complete") {
    for (const domain of data.governanceEvidence.domains.entries) {
      if (domain.workspaceCount !== 0) continue;
      findings.push({
        id: findingId("domain-empty", domain.id),
        severity: "low",
        category: "metadata",
        title: `Domain ${domain.displayName} has no workspace`,
        detail:
          "The Fabric admin API reports no workspace assigned to this domain tenant-wide, so it adds nothing to domain-based discovery.",
        recommendation:
          "Assign the workspaces that belong to this business domain, or retire the domain if it is no longer used.",
        evidenceIds: [`domain:${domain.id}:workspaces:0`],
        target: { kind: "workspace" },
      });
    }
  }

  findings.push(...publicNetworkFindings(data));
  findings.push(...externalShareFindings(data));

  for (const job of data.jobs) {
    if (job.status !== "failed") continue;
    const id = searchJobId(
      job.itemFabricId,
      job.jobType,
      job.startedAt,
    );
    findings.push({
      id: findingId("failed-job", id),
      severity: "high",
      category: "operations",
      title: `Failed ${job.jobType}: ${job.itemName}`,
      detail: job.message
        ? `${job.startedAt}: ${job.message}`
        : `${job.jobType} failed at ${job.startedAt}.`,
      recommendation: "Inspect the failed run, resolve its error, and rerun it.",
      evidenceIds: [id],
      target: { kind: "job", itemId: job.itemFabricId, jobId: id },
      itemId: job.itemFabricId,
      jobId: id,
    });
  }

  const itemIds = new Set(data.items.map((item) => item.fabricId));
  for (const edge of data.edges) {
    const unresolved = [edge.source, edge.target].filter(
      (id) => !itemIds.has(id),
    );
    if (!edge.broken && unresolved.length === 0) continue;
    const key = lineageEdgeKey(edge);
    findings.push({
      id: findingId("broken-lineage", key),
      severity: "critical",
      category: "lineage",
      title: "Broken lineage relationship",
      detail:
        unresolved.length > 0
          ? `The lineage relationship references unresolved endpoint${unresolved.length === 1 ? "" : "s"}: ${unresolved.join(", ")}.`
          : `The ${edge.relation || "dependency"} relationship is explicitly marked as broken.`,
      recommendation:
        "Repair or remove the relationship and resync lineage metadata.",
      evidenceIds: [edgeEvidence(edge)],
      target: { kind: "edge", edgeKey: key },
      edgeKey: key,
    });
  }

  const uniqueFindings = [...new Map(findings.map((finding) => [
    finding.id,
    finding,
  ])).values()];
  return uniqueFindings.sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      compareText(left.category, right.category) ||
      compareText(left.id, right.id),
  );
}

export const getGovernanceFindings = buildGovernanceFindings;

const UNASSIGNED_DOMAIN = "unassigned";
export const ENDORSED_INACTIVE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function latestActivity(item: Item): number | undefined {
  const times = [item.updatedAt, item.lastRefresh]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter(Number.isFinite);
  return times.length > 0 ? Math.max(...times) : undefined;
}

/** Days without observed activity before `item-inactive` fires (`VITE_ATLAS_INACTIVE_DAYS`). */
export const ITEM_INACTIVE_DAYS = parseInactiveDays(
  import.meta.env?.VITE_ATLAS_INACTIVE_DAYS as string | undefined,
);

export function parseInactiveDays(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ENDORSED_INACTIVE_DAYS;
}

/**
 * Any non-endorsed item whose latest modification, refresh or job run is older
 * than the threshold. Endorsed items are covered by `endorsed-inactive`; items
 * without any activity signal stay Unknown and produce no finding. Read
 * telemetry is not collected, so this never claims an item is unused.
 */
const HIGHLY_CONFIDENTIAL = /highly\s+confidential/i;

/** Informational only, and only from a known inbound policy: Unknown never raises it. */
export function publicNetworkFindings(
  data: Pick<AtlasData, "workspace" | "items" | "governanceEvidence">,
): GovernanceFinding[] {
  const network = data.governanceEvidence?.network;
  if (network?.status.status !== "complete") return [];
  const findings: GovernanceFinding[] = [];
  const confidential = data.items.filter((item) => item.sensitivity && CONFIDENTIAL_OR_ABOVE.test(item.sensitivity));
  if (network.policy?.outboundPublicAccess === "Allow" && confidential.length > 0) {
    findings.push({
      id: findingId("workspace-outbound-network", data.workspace.fabricId),
      severity: "low",
      category: "access",
      title: `Outbound access unrestricted with ${confidential.length} Confidential+ item${confidential.length === 1 ? "" : "s"}`,
      detail:
        "Outbound access protection is off: notebooks and pipelines in this workspace can reach any endpoint while it holds items labeled Confidential or above.",
      recommendation:
        "Review whether the workspace should enable outbound access protection and allow only approved endpoints.",
      evidenceIds: [
        `workspace:${data.workspace.fabricId}:network:outbound:Allow`,
        ...confidential.slice(0, 20).map((item) => `item:${item.fabricId}:sensitivity`),
      ],
      target: { kind: "workspace" },
    });
  }
  if (network.policy?.inboundPublicAccess !== "Allow") return findings;
  const sensitive = data.items.filter((item) => item.sensitivity && HIGHLY_CONFIDENTIAL.test(item.sensitivity));
  if (sensitive.length === 0) return findings;
  return [...findings, {
    id: findingId("workspace-public-network", data.workspace.fabricId),
    severity: "low",
    category: "access",
    title: `Public network access allowed with ${sensitive.length} Highly Confidential item${sensitive.length === 1 ? "" : "s"}`,
    detail:
      "The workspace communication policy allows inbound public access while the workspace holds items labeled Highly Confidential.",
    recommendation:
      "Review whether the workspace should restrict inbound public access to private links in its network settings.",
    evidenceIds: [
      `workspace:${data.workspace.fabricId}:network:inbound:Allow`,
      ...sensitive.slice(0, 20).map((item) => `item:${item.fabricId}:sensitivity`),
    ],
    target: { kind: "workspace" },
  }];
}

const CONFIDENTIAL_OR_ABOVE = /confidential/i;

/** Active external data shares that expose an item labeled Confidential or above. */
export function externalShareFindings(
  data: Pick<AtlasData, "items" | "governanceEvidence">,
): GovernanceFinding[] {
  const shares = data.governanceEvidence?.externalShares;
  if (shares?.status.status !== "complete") return [];
  const byId = new Map(data.items.map((item) => [item.fabricId, item]));
  const grouped = new Map<string, typeof shares.entries>();
  for (const share of shares.entries) {
    if (!/^active$/i.test(share.status)) continue;
    const item = byId.get(share.itemId);
    if (!item?.sensitivity || !CONFIDENTIAL_OR_ABOVE.test(item.sensitivity)) continue;
    grouped.set(share.itemId, [...(grouped.get(share.itemId) ?? []), share]);
  }
  return [...grouped].map(([itemId, list]) => {
    const item = byId.get(itemId)!;
    const highly = HIGHLY_CONFIDENTIAL.test(item.sensitivity ?? "");
    return {
      id: findingId("external-share-sensitive", itemId),
      severity: highly ? "high" : "medium",
      category: "access",
      title: `${item.displayName} (${item.sensitivity}) is shared externally`,
      detail: `${list.length} active external data share${list.length === 1 ? "" : "s"} expose this item outside the tenant.`,
      recommendation: "Confirm the external data share is still required, or revoke it in the item's External data sharing settings.",
      evidenceIds: list.map((share) => `item:${itemId}:external-share:${share.shareId}`),
      target: { kind: "item", itemId },
    } satisfies GovernanceFinding;
  });
}

function itemInactiveFindings(
  items: readonly Item[],
  jobs: AtlasData["jobs"],
  syncedAt: string | undefined,
  thresholdDays: number = ITEM_INACTIVE_DAYS,
): GovernanceFinding[] {
  const reference = syncedAt ? Date.parse(syncedAt) : Number.NaN;
  if (!Number.isFinite(reference)) return [];
  const lastJob = new Map<string, number>();
  for (const job of jobs) {
    const started = Date.parse(job.startedAt);
    if (!Number.isFinite(started)) continue;
    lastJob.set(job.itemFabricId, Math.max(lastJob.get(job.itemFabricId) ?? started, started));
  }
  const findings: GovernanceFinding[] = [];
  for (const item of items) {
    if (item.endorsement !== "none") continue;
    const candidates = [latestActivity(item), lastJob.get(item.fabricId)].filter(
      (value): value is number => value !== undefined,
    );
    if (candidates.length === 0) continue;
    const days = Math.floor((reference - Math.max(...candidates)) / DAY_MS);
    if (days <= thresholdDays) continue;
    findings.push({
      id: findingId("item-inactive", item.fabricId),
      severity: "medium",
      category: "operations",
      title: `Inactive item: ${item.displayName}`,
      detail: `No modification, refresh or job run observed on ${item.displayName} for ${days} days (threshold ${thresholdDays}). Read usage is not collected, so the item may still be consumed.`,
      recommendation:
        "Confirm the owner still needs it; archive or delete unused items to reduce capacity cost and catalog noise.",
      evidenceIds: [`item:${item.fabricId}:activity`],
      target: { kind: "item", itemId: item.fabricId },
      itemId: item.fabricId,
    });
  }
  return findings;
}

/**
 * Endorsed items whose recorded activity is older than the threshold. Items
 * without any activity timestamp are skipped: absence is not evidence.
 */
function endorsedInactiveFindings(
  items: readonly Item[],
  syncedAt: string | undefined,
): GovernanceFinding[] {
  const reference = syncedAt ? Date.parse(syncedAt) : Number.NaN;
  if (!Number.isFinite(reference)) return [];
  const findings: GovernanceFinding[] = [];
  for (const item of items) {
    if (item.endorsement === "none") continue;
    const latest = latestActivity(item);
    if (latest === undefined) continue;
    const days = Math.floor((reference - latest) / DAY_MS);
    if (days <= ENDORSED_INACTIVE_DAYS) continue;
    findings.push({
      id: findingId("endorsed-inactive", item.fabricId),
      severity: "low",
      category: "metadata",
      title: `Endorsed but inactive: ${item.displayName}`,
      detail: `${item.displayName} is ${item.endorsement}, but its last recorded update or refresh is ${days} days old.`,
      recommendation:
        "Confirm the item is still maintained; refresh it or remove the endorsement.",
      evidenceIds: [
        `item:${item.fabricId}:endorsement:${item.endorsement}`,
        `item:${item.fabricId}:activity`,
      ],
      target: { kind: "item", itemId: item.fabricId },
      itemId: item.fabricId,
    });
  }
  return findings;
}

/**
 * Endorsed semantic models whose visible tables, columns or measures have no
 * description. One finding per model keeps the queue readable.
 */
function objectDescriptionFindings(
  items: readonly Item[],
  schema: AtlasData["schema"],
): GovernanceFinding[] {
  if (!schema) return [];
  const findings: GovernanceFinding[] = [];
  for (const item of items) {
    if (item.itemType !== "SemanticModel" || item.endorsement === "none") {
      continue;
    }
    const tables = (schema[item.fabricId] ?? []).filter(
      (table) => !isItemMetadataSchemaEntry(table) && table.isHidden !== true,
    );
    const objects = tables.flatMap((table) => [
      table,
      ...table.columns.filter((column) => column.isHidden !== true),
      ...table.measures.filter((measure) => measure.isHidden !== true),
    ]);
    const missing = objects.filter((object) => !meaningful(object.description));
    if (objects.length === 0 || missing.length === 0) continue;
    findings.push({
      id: findingId("missing-object-description", item.fabricId),
      severity: "low",
      category: "metadata",
      title: `Undocumented model objects: ${item.displayName}`,
      detail: `${missing.length} of ${objects.length} visible tables, columns and measures in this ${item.endorsement} model have no description.`,
      recommendation:
        "Describe the model objects consumers use most so they appear in the OneLake catalog and Copilot answers.",
      evidenceIds: [`item:${item.fabricId}:schema:descriptions`],
      target: { kind: "item", itemId: item.fabricId },
      itemId: item.fabricId,
    });
  }
  return findings;
}

function coverageMetric(
  id: CoverageMetricId,
  label: string,
  numerator: number,
  denominator: number,
): CoverageMetric {
  const percentage =
    denominator === 0 ? null : (numerator / denominator) * 100;
  const state: CoverageState =
    denominator === 0
      ? "not-applicable"
      : numerator === 0
        ? "no-values"
        : numerator === denominator
          ? "complete"
          : "partial";
  return { id, label, numerator, denominator, percentage, state };
}

export function getCoverageDiagnostics(
  data: Pick<AtlasData, "items" | "schema">,
): CoverageDiagnostics {
  const schema = data.schema ?? {};
  const schemaCapableItems = data.items.filter((item) =>
    SCHEMA_CAPABLE_ITEM_TYPES.has(item.itemType),
  );
  const tables = data.items
    .flatMap((item) => schema[item.fabricId] ?? [])
    .filter((table) => !isItemMetadataSchemaEntry(table));
  const columns = tables.flatMap((table) => table.columns);
  const measures = tables.flatMap((table) => table.measures);
  const ownerEligible = eligibleItems(
    data.items,
    "ownerMetadataAvailable",
    (item) => meaningful(item.ownerName) || meaningful(item.ownerEmail),
  );
  const sensitivityEligible = eligibleItems(
    data.items,
    "sensitivityMetadataAvailable",
    itemHasSensitivity,
  );
  const endorsementEligible = eligibleItems(
    data.items,
    "endorsementMetadataAvailable",
    (item) =>
      item.endorsement !== "none" || meaningful(item.endorsementRaw),
  );
  const technicalObjects = [
    ...tables.map((table) =>
      typeof table.rows === "number" ||
      meaningful(table.objectType) ||
      meaningful(table.source),
    ),
    ...columns.map((column) => meaningful(column.dataType)),
    ...measures.map((measure) => meaningful(measure.expr)),
  ];

  const metrics = [
    coverageMetric(
      "descriptions",
      "Item descriptions",
      data.items.filter((item) => meaningful(item.description)).length,
      data.items.length,
    ),
    coverageMetric(
      "owners",
      "Item owners",
      ownerEligible.filter(
        (item) => meaningful(item.ownerName) || meaningful(item.ownerEmail),
      ).length,
      ownerEligible.length,
    ),
    coverageMetric(
      "sensitivity",
      "Sensitivity labels",
      sensitivityEligible.filter(itemHasSensitivity).length,
      sensitivityEligible.length,
    ),
    coverageMetric(
      "endorsement",
      "Endorsement adoption",
      endorsementEligible.filter(
        (item) =>
          item.endorsement !== "none" ||
          (meaningful(item.endorsementRaw) &&
            normalize(item.endorsementRaw) !== "none"),
      ).length,
      endorsementEligible.length,
    ),
    coverageMetric(
      "schema-inventory",
      "Schema inventory",
      schemaCapableItems.filter(
        (item) => (schema[item.fabricId]?.length ?? 0) > 0,
      ).length,
      schemaCapableItems.length,
    ),
    coverageMetric(
      "table-descriptions",
      "Table and view descriptions",
      tables.filter((table) => meaningful(table.description)).length,
      tables.length,
    ),
    coverageMetric(
      "column-descriptions",
      "Column descriptions",
      columns.filter((column) => meaningful(column.description)).length,
      columns.length,
    ),
    coverageMetric(
      "measure-descriptions",
      "Measure descriptions",
      measures.filter((measure) => meaningful(measure.description)).length,
      measures.length,
    ),
    coverageMetric(
      "technical-metadata",
      "Technical metadata",
      technicalObjects.filter(Boolean).length,
      technicalObjects.length,
    ),
  ];
  const byId = Object.fromEntries(
    metrics.map((metric) => [metric.id, metric]),
  ) as Record<CoverageMetricId, CoverageMetric>;
  return { metrics, byId };
}

export const buildCoverageDiagnostics = getCoverageDiagnostics;
