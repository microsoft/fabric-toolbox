import {
  ACCESS_EVIDENCE_LABEL,
  ACCESS_LAYER_LABEL,
  GRANT_ONLY_NOTICE,
  unknownAccessLayerSummary,
  storedPolicySummary,
  type GrantEvidenceLayer,
} from "./access-coverage";
import { csvCell } from "./access-export";
import { highestRecordedGrant, type AccessReviewRow } from "./governance";
import { markdownText } from "./markdown";
import type { AccessLevel, AccessSource, Grant } from "./model";

export const WHAT_IF_NOTICE =
  "Read-only What-if models recorded workspace and item grants for the selected principal/item pair only. It does not evaluate workspace-wide impact, actual data access, group membership or restrictions. No Fabric permissions are changed.";

export const ACCESS_SOURCE_LABEL: Record<AccessSource, string> = {
  workspaceRole: "Workspace role",
  directShare: "Direct share",
  group: "Group grant (recorded)",
  orgLink: "Organization link",
  itemOwner: "Item owner grant",
};

export interface AccessGrantPath {
  key: string;
  grant: Grant;
  layer: GrantEvidenceLayer;
  observations: number;
}

export interface AccessWhatIfResult {
  row: AccessReviewRow;
  paths: AccessGrantPath[];
  excluded: AccessGrantPath[];
  remaining: AccessGrantPath[];
  modeledLayers: GrantEvidenceLayer[];
  currentLevel: AccessLevel;
  simulatedLevel: AccessLevel;
  outcome: "unchanged" | "reduced" | "no-positive-recorded-grant";
}

export function recordedGrantLabel(level: AccessLevel): string {
  return level === "none"
    ? "No positive recorded grant"
    : level === "owner" ? "Owner permission" : level === "edit" ? "Edit" : "View";
}

export function recordedGrantPaths(row: AccessReviewRow): AccessGrantPath[] {
  const paths = new Map<string, AccessGrantPath>();
  for (const grant of row.applicableGrants) {
    if (grant.itemFabricId && grant.itemFabricId !== row.itemId) continue;
    // There is no collector grant ID. Exact duplicate records represent one recorded path.
    const key = JSON.stringify([
      grant.itemFabricId ?? "",
      grant.principalRef,
      grant.source,
      grant.roleName ?? "",
      grant.accessLevel,
      grant.flag ?? "",
    ]);
    const existing = paths.get(key);
    if (existing) {
      existing.observations += 1;
    } else {
      paths.set(key, {
        key,
        grant,
        layer: grant.itemFabricId ? "item-grants" : "workspace-grants",
        observations: 1,
      });
    }
  }
  return [...paths.values()].sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
  );
}

export function simulateAccessGrantRemoval(
  row: AccessReviewRow,
  excludedKeys: readonly string[],
): AccessWhatIfResult {
  const paths = recordedGrantPaths(row);
  const selected = new Set(excludedKeys);
  const excluded = paths.filter((path) => selected.has(path.key));
  const remaining = paths.filter((path) => !selected.has(path.key));
  const currentLevel = highestRecordedGrant(paths.map((path) => path.grant));
  const simulatedLevel = highestRecordedGrant(remaining.map((path) => path.grant));
  return {
    row,
    paths,
    excluded,
    remaining,
    modeledLayers: (["workspace-grants", "item-grants"] as const)
      .filter((layer) => paths.some((path) => path.layer === layer)),
    currentLevel,
    simulatedLevel,
    outcome: simulatedLevel === "none"
      ? "no-positive-recorded-grant"
      : simulatedLevel === currentLevel ? "unchanged" : "reduced",
  };
}

export function modeledAccessLayerSummary(result: AccessWhatIfResult): string {
  return result.modeledLayers.map((layer) => {
    const evidence = result.row.coverage.layers.find((entry) => entry.layer === layer);
    return `${ACCESS_LAYER_LABEL[layer]} (recorded paths only; ${
      evidence ? ACCESS_EVIDENCE_LABEL[evidence.state] : "coverage unavailable"
    })`;
  }).join("; ") || "Not modeled: no recorded grant paths";
}

export function whatIfOutcomeDescription(result: AccessWhatIfResult): string {
  if (result.outcome === "no-positive-recorded-grant") {
    return "No positive recorded grant remains in this scenario. This does not prove that actual access is removed.";
  }
  if (!result.excluded.length) return "No recorded grant paths are excluded.";
  return result.outcome === "unchanged"
    ? "Remaining paths keep the highest recorded grant unchanged."
    : "The highest recorded grant is reduced in this scenario. Actual access is not evaluated.";
}

function pathSummary(path: AccessGrantPath): string {
  return [
    ACCESS_LAYER_LABEL[path.layer],
    `source ${path.grant.source}`,
    `role ${path.grant.roleName ?? "Not recorded"}`,
    `grant ${recordedGrantLabel(path.grant.accessLevel)}`,
    `reference ${path.grant.principalRef}`,
    `scope ${path.grant.itemFabricId ?? "Workspace"}`,
    `${path.observations} recorded observation(s)`,
  ].join("; ");
}

export function accessWhatIfToMarkdown(result: AccessWhatIfResult): string {
  const coverage = result.row.coverage;
  const paths = (values: AccessGrantPath[]) => values.length
    ? values.map((path) => `- ${markdownText(pathSummary(path))}`)
    : ["- No recorded paths in this list. This is not an actual access assessment."];
  return [
    "# Access What-if (recorded grants only)",
    "",
    WHAT_IF_NOTICE,
    GRANT_ONLY_NOTICE,
    "",
    `Principal: ${markdownText(result.row.principalRef)}`,
    `Principal resolution: ${result.row.principalResolution} (recorded references only)`,
    `Item: ${markdownText(result.row.item.displayName)} (${markdownText(result.row.itemId)})`,
    `Evidence row key: ${markdownText(result.row.id)}`,
    `Workspace ID: ${markdownText(coverage.workspaceId ?? "Not recorded")}`,
    `Snapshot ID: ${markdownText(coverage.snapshotId ?? "Not recorded")}`,
    `Snapshot observed at: ${markdownText(coverage.observedAt ?? "Not recorded")}`,
    `Current highest recorded grant: ${recordedGrantLabel(result.currentLevel)}`,
    `Simulated highest recorded grant: ${recordedGrantLabel(result.simulatedLevel)}`,
    `Modeled layers: ${modeledAccessLayerSummary(result)}`,
    `Unknown or incomplete layers: ${unknownAccessLayerSummary(coverage)}`,
    "Other data-plane and row/column restrictions: Not evaluated",
    `Assessment coverage: ${ACCESS_EVIDENCE_LABEL[coverage.state]}`,
    "Restrictions: Not evaluated",
    `Stored policy context (not modeled): ${storedPolicySummary(coverage)}`,
    "",
    whatIfOutcomeDescription(result),
    "",
    "## Excluded recorded paths",
    ...paths(result.excluded),
    "",
    "## Remaining recorded paths",
    ...paths(result.remaining),
  ].join("\n");
}

export function accessWhatIfToCsv(result: AccessWhatIfResult): string {
  const coverage = result.row.coverage;
  const headers = [
    "Principal", "Principal ID", "Principal resolution", "Item", "Item ID", "Current highest recorded grant",
    "Simulated highest recorded grant", "Modeled layers", "Unknown or incomplete layers",
    "Excluded recorded paths", "Remaining recorded paths", "Restrictions", "Coverage",
    "Workspace ID", "Snapshot ID", "Snapshot observed at", "Limitation", "Policy context (not modeled)",
  ];
  const values = [
    result.row.principalRef, result.row.principalId ?? "Not recorded", result.row.principalResolution,
    result.row.item.displayName, result.row.itemId,
    recordedGrantLabel(result.currentLevel), recordedGrantLabel(result.simulatedLevel),
    modeledAccessLayerSummary(result), unknownAccessLayerSummary(coverage),
    result.excluded.map(pathSummary).join(" | "),
    result.remaining.map(pathSummary).join(" | "),
    "Not evaluated", ACCESS_EVIDENCE_LABEL[coverage.state],
    coverage.workspaceId ?? "Not recorded", coverage.snapshotId ?? "Not recorded",
    coverage.observedAt ?? "Not recorded", `${WHAT_IF_NOTICE} ${GRANT_ONLY_NOTICE}`,
    storedPolicySummary(coverage),
  ];
  return [headers, values].map((line) => line.map(csvCell).join(",")).join("\r\n");
}
