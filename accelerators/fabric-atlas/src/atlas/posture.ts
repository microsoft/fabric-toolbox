import {
  buildGovernanceFindings,
  getCoverageDiagnostics,
  type CoverageMetricId,
  type GovernanceFinding,
  type GovernanceSeverity,
} from "./governance";
import type { SnapshotCatalog } from "./history";
import type { Item } from "./model";

export type PosturePillar =
  | "documentation"
  | "ownership"
  | "sensitivity"
  | "access"
  | "lineage"
  | "operations";

export interface PillarScore {
  pillar: PosturePillar;
  score: number | null;
  target: number;
  metrics: CoverageMetricId[];
  contributingFindings: number;
}

export interface PostureScore {
  global: number | null;
  pillars: PillarScore[];
  snapshotId: string;
  syncedAt: string;
}

export const POSTURE_ALGORITHM_VERSION = 1;
export const POSTURE_PILLARS: readonly PosturePillar[] = [
  "documentation",
  "ownership",
  "sensitivity",
  "access",
  "lineage",
  "operations",
];
export const DEFAULT_POSTURE_TARGETS = {
  documentation: 70,
  ownership: 70,
  sensitivity: 70,
  access: 70,
  lineage: 70,
  operations: 70,
} as const satisfies Record<PosturePillar, number>;
export const POSTURE_TARGETS: Record<PosturePillar, number> = {
  ...DEFAULT_POSTURE_TARGETS,
};
const DOCUMENTATION_WEIGHTS: Partial<Record<CoverageMetricId, number>> = {
  descriptions: 25,
  endorsement: 10,
  "schema-inventory": 15,
  "table-descriptions": 15,
  "column-descriptions": 20,
  "measure-descriptions": 5,
  "technical-metadata": 10,
};
const SEVERITY_WEIGHT: Record<GovernanceSeverity, number> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
};
const SCHEMA_CAPABLE_TYPES = new Set<Item["itemType"]>([
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

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function targetFor(
  pillar: PosturePillar,
  targets: Partial<Record<PosturePillar, number>>,
): number {
  const candidate = targets[pillar];
  return Number.isFinite(candidate)
    ? clamp(candidate as number)
    : POSTURE_TARGETS[pillar];
}

function coverageScore(
  catalog: SnapshotCatalog,
  metrics: Partial<Record<CoverageMetricId, number>>,
): number | null {
  const diagnostics = getCoverageDiagnostics(catalog);
  let weighted = 0;
  let weight = 0;
  for (const [metricId, metricWeight] of Object.entries(metrics) as Array<
    [CoverageMetricId, number]
  >) {
    const metric = diagnostics.byId[metricId];
    if (metric.state === "not-applicable" || metric.percentage == null) {
      continue;
    }
    weighted += metric.percentage * metricWeight;
    weight += metricWeight;
  }
  return weight ? weighted / weight : null;
}

function sectionAvailable(
  catalog: SnapshotCatalog,
  section: string,
): boolean {
  const status = catalog.workspace.syncSections?.[section]?.status;
  return status == null || status === "complete";
}

function findingScore(
  catalog: SnapshotCatalog,
  findings: GovernanceFinding[],
  category: "access" | "lineage" | "operations",
): number | null {
  const section = category === "operations" ? "jobs" : category;
  if (catalog.items.length === 0 || !sectionAvailable(catalog, section)) {
    return null;
  }
  const penalty = findings
    .filter((finding) => finding.category === category)
    .reduce(
      (total, finding) => total + SEVERITY_WEIGHT[finding.severity],
      0,
    );
  return clamp(100 - (10 * penalty) / catalog.items.length);
}

export function scorePosture(
  catalog: SnapshotCatalog,
  targets: Partial<Record<PosturePillar, number>> = {},
): PostureScore {
  const findings = buildGovernanceFindings(catalog);
  const definitions: Array<{
    pillar: PosturePillar;
    metrics: CoverageMetricId[];
    score: number | null;
    category?: "access" | "lineage" | "operations";
  }> = [
    {
      pillar: "documentation",
      metrics: Object.keys(DOCUMENTATION_WEIGHTS) as CoverageMetricId[],
      score: coverageScore(catalog, DOCUMENTATION_WEIGHTS),
    },
    {
      pillar: "ownership",
      metrics: ["owners"],
      score: coverageScore(catalog, { owners: 100 }),
    },
    {
      pillar: "sensitivity",
      metrics: ["sensitivity"],
      score: coverageScore(catalog, { sensitivity: 100 }),
    },
    {
      pillar: "access",
      metrics: [],
      score: findingScore(catalog, findings, "access"),
      category: "access",
    },
    {
      pillar: "lineage",
      metrics: [],
      score: findingScore(catalog, findings, "lineage"),
      category: "lineage",
    },
    {
      pillar: "operations",
      metrics: [],
      score: findingScore(catalog, findings, "operations"),
      category: "operations",
    },
  ];
  const pillars = POSTURE_PILLARS.map((pillar) => {
    const definition = definitions.find((value) => value.pillar === pillar)!;
    return {
      pillar,
      score:
        definition.score == null ? null : Math.round(definition.score),
      target: targetFor(pillar, targets),
      metrics: definition.metrics,
      contributingFindings: definition.category
        ? findings.filter(
            (finding) => finding.category === definition.category,
          ).length
        : 0,
    };
  });
  const applicable = pillars
    .map((pillar) => pillar.score)
    .filter((score): score is number => score != null);
  return {
    global: applicable.length
      ? Math.round(
          applicable.reduce((total, score) => total + score, 0) /
            applicable.length,
        )
      : null,
    pillars,
    snapshotId: catalog.workspace.snapshotId ?? "",
    syncedAt: catalog.workspace.syncedAt ?? "",
  };
}

export function nonConformingPostureItemIds(
  catalog: SnapshotCatalog,
  pillar: PosturePillar,
): Set<string> {
  const meaningful = (value: string | undefined) =>
    Boolean(value?.trim());
  const normalized = (value: string | undefined) =>
    value?.trim().toLocaleLowerCase() ?? "";
  const hasEndorsement = (item: Item) =>
    item.endorsement !== "none" ||
    (meaningful(item.endorsementRaw) &&
      normalized(item.endorsementRaw) !== "none");
  const eligible = (
    flag:
      | "ownerMetadataAvailable"
      | "sensitivityMetadataAvailable"
      | "endorsementMetadataAvailable",
    legacyEvidence: (item: Item) => boolean,
  ) => {
    const hasExplicit = catalog.items.some(
      (item) => item[flag] !== undefined,
    );
    return hasExplicit
      ? catalog.items.filter((item) => item[flag] === true)
      : catalog.items.some(legacyEvidence)
        ? catalog.items
        : [];
  };
  if (pillar === "documentation") {
    const gaps = new Set(
      catalog.items
        .filter((item) => !meaningful(item.description))
        .map((item) => item.fabricId),
    );
    for (const item of eligible(
      "endorsementMetadataAvailable",
      hasEndorsement,
    )) {
      if (!hasEndorsement(item)) {
        gaps.add(item.fabricId);
      }
    }
    for (const item of catalog.items) {
      const tables = catalog.schema?.[item.fabricId] ?? [];
      if (SCHEMA_CAPABLE_TYPES.has(item.itemType) && tables.length === 0) {
        gaps.add(item.fabricId);
      }
      if (
        tables.some(
          (table) =>
            !meaningful(table.description) ||
            table.columns.some(
              (column) => !meaningful(column.description),
            ) ||
            table.measures.some(
              (measure) => !meaningful(measure.description),
            ) ||
            !(
              typeof table.rows === "number" ||
              meaningful(table.objectType) ||
              meaningful(table.source)
            ) ||
            table.columns.some(
              (column) => !meaningful(column.dataType),
            ) ||
            table.measures.some(
              (measure) => !meaningful(measure.expr),
            )
        )
      ) {
        gaps.add(item.fabricId);
      }
    }
    return gaps;
  }
  if (pillar === "ownership") {
    return new Set(
      eligible(
        "ownerMetadataAvailable",
        (item) =>
          meaningful(item.ownerName) || meaningful(item.ownerEmail),
      )
        .filter(
          (item) =>
            !meaningful(item.ownerName) &&
            !meaningful(item.ownerEmail),
        )
        .map((item) => item.fabricId),
    );
  }
  if (pillar === "sensitivity") {
    return new Set(
      eligible(
        "sensitivityMetadataAvailable",
        (item) =>
          meaningful(item.sensitivity) ||
          meaningful(item.sensitivityLabelId),
      )
        .filter(
          (item) =>
            !meaningful(item.sensitivity) &&
            !meaningful(item.sensitivityLabelId),
        )
        .map((item) => item.fabricId),
    );
  }
  return new Set();
}
