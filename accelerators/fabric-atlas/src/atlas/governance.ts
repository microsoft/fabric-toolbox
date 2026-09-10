import type {
  AccessLevel,
  AtlasData,
  Edge,
  Grant,
  Item,
  Principal,
} from "./model";
import { isItemMetadataSchemaEntry } from "./item-metadata";
import { lineageEdgeKey } from "./lineage";
import { searchJobId } from "./search";

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

function principalIndexes(principals: Principal[]): {
  byId: Map<string, Principal[]>;
  byEmail: Map<string, Principal[]>;
  byName: Map<string, Principal[]>;
} {
  const byId = new Map<string, Principal[]>();
  const byEmail = new Map<string, Principal[]>();
  const byName = new Map<string, Principal[]>();
  const add = (
    index: Map<string, Principal[]>,
    value: string | undefined,
    principal: Principal,
  ) => {
    const key = normalize(value);
    if (!key) return;
    const matches = index.get(key) ?? [];
    matches.push(principal);
    index.set(key, matches);
  };

  for (const principal of principals) {
    add(byId, principal.principalId, principal);
    add(byEmail, principal.email, principal);
    add(byName, principal.displayName, principal);
  }
  return { byId, byEmail, byName };
}

function resolveGrant(
  grant: Grant,
  indexes: ReturnType<typeof principalIndexes>,
): ResolvedGrant {
  const ref = normalize(grant.principalRef);
  const candidates =
    indexes.byId.get(ref) ??
    indexes.byEmail.get(ref) ??
    indexes.byName.get(ref) ??
    [];
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

function highestAccess(grants: Grant[]): AccessLevel {
  return grants.reduce<AccessLevel>(
    (highest, grant) =>
      ACCESS_RANK[grant.accessLevel] > ACCESS_RANK[highest]
        ? grant.accessLevel
        : highest,
    "none",
  );
}

export function buildAccessReviewRows(
  data: Pick<AtlasData, "items" | "principals" | "grants">,
): AccessReviewRow[] {
  const indexes = principalIndexes(data.principals);
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
      const effectiveAccess = highestAccess(applicableGrants);
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
  >,
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
        `${row.principalRef} has ${row.effectiveAccess} effective access.`,
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
        `${row.principalRef} has ${row.effectiveAccess} effective access.`,
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
  const indexes = principalIndexes(data.principals);
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
