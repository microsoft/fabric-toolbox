import type { Grant, WorkspaceInfo } from "./model";
import {
  policyEvidenceSummary, type AccessPolicyEvidence,
} from "../../rayfin/functions/src/policy-evidence-contract";

export type AccessEvidenceState =
  | "observed"
  | "unavailable"
  | "unsupported"
  | "denied"
  | "partial";

export type GrantEvidenceLayer = "workspace-grants" | "item-grants";
export type RestrictionEvidenceLayer =
  | "group-membership"
  | "onelake-security"
  | "purview-dlp"
  | "fabric-policies";
export type AccessEvidenceLayer = GrantEvidenceLayer | RestrictionEvidenceLayer;

export type AccessLayerEvidence = {
  reason: string;
  source?: string;
} & (
  | { layer: GrantEvidenceLayer; state: AccessEvidenceState }
  | {
      layer: RestrictionEvidenceLayer;
      state: Exclude<AccessEvidenceState, "observed">;
    }
);

export interface AccessEvidenceCoverage {
  state: Exclude<AccessEvidenceState, "observed">;
  layers: AccessLayerEvidence[];
  workspaceId?: string;
  snapshotId?: string;
  observedAt?: string;
  policyEvidence?: AccessPolicyEvidence[];
}

export function withStoredPolicyEvidence(
  coverage: AccessEvidenceCoverage, records: AccessPolicyEvidence[],
): AccessEvidenceCoverage {
  const scoped = records.filter((record) =>
    record.workspace_id === coverage.workspaceId?.toLowerCase() && record.snapshotId === coverage.snapshotId?.toLowerCase(),
  );
  if (!scoped.length) return coverage;
  return {
    ...coverage,
    policyEvidence: scoped,
    layers: coverage.layers.map((layer) => layer.layer === "fabric-policies" ? {
      ...layer, state: "unsupported",
      reason: "Central evaluation has no verified public endpoint/request/response contract. Stored workspace settings are context only.",
    } : layer),
  };
}

export const ACCESS_LAYER_LABEL: Record<AccessEvidenceLayer, string> = {
  "workspace-grants": "Workspace grants",
  "item-grants": "Item grants",
  "group-membership": "Group membership",
  "onelake-security": "OneLake security",
  "purview-dlp": "Purview DLP",
  "fabric-policies": "Fabric Policies",
};

export const ACCESS_EVIDENCE_LABEL: Record<AccessEvidenceState, string> = {
  observed: "Observed grants",
  unavailable: "Evidence unavailable",
  unsupported: "Unsupported",
  denied: "Evidence read denied",
  partial: "Partial",
};

export const GRANT_ONLY_NOTICE =
  "Collected grants do not prove unrestricted data access. Restrictions and group membership are not evaluated.";

/** Compact evidence vocabulary shared by the Access Review legend and row badges. */
export type AccessLegendState = "granted" | "partial" | "unknown" | "denied";

export const ACCESS_LEGEND: Record<
  AccessLegendState,
  { label: string; description: string }
> = {
  granted: {
    label: "Granted",
    description: "Grant recorded; collection complete.",
  },
  partial: {
    label: "Partial",
    description: "Grant recorded; restrictions not evaluated.",
  },
  unknown: {
    label: "Unknown",
    description: "Not collected, or no public API.",
  },
  denied: {
    label: "Denied",
    description: "Evidence read denied, which is not denied access.",
  },
};

export function accessLegendState(state: AccessEvidenceState): AccessLegendState {
  switch (state) {
    case "observed":
      return "granted";
    case "partial":
      return "partial";
    case "denied":
      return "denied";
    default:
      return "unknown";
  }
}

export type AccessCoverageFilter = "all" | AccessEvidenceState;

export function parseAccessCoverageFilter(value: unknown): AccessCoverageFilter {
  return typeof value === "string" &&
    (value === "all" || Object.hasOwn(ACCESS_EVIDENCE_LABEL, value))
    ? (value as AccessCoverageFilter)
    : "all";
}

export function assessAccessEvidence(
  layers: readonly AccessLayerEvidence[],
): AccessEvidenceCoverage["state"] {
  // Observed grants can coexist with denied reads; neither proves data-plane access.
  if (
    layers.some((layer) => layer.state === "observed" || layer.state === "partial")
  ) {
    return "partial";
  }
  if (layers.some((layer) => layer.state === "denied")) return "denied";
  if (!layers.length || layers.some((layer) => layer.state === "unavailable")) {
    return "unavailable";
  }
  return "unsupported";
}

export function buildAccessEvidenceCoverage(
  grants: readonly Grant[],
  workspace?: WorkspaceInfo,
): AccessEvidenceCoverage {
  const section = workspace?.syncSections?.access;
  const readDenied =
    section?.status === "failed" &&
    /^(?:401|403|HTTP_401|HTTP_403|FORBIDDEN|UNAUTHORIZED|ACCESS_DENIED)$/i.test(
      section.code ?? "",
    );
  const grantLayer = (layer: GrantEvidenceLayer): AccessLayerEvidence => {
    const observed = grants.filter((grant) =>
      layer === "workspace-grants"
        ? !grant.itemFabricId
        : Boolean(grant.itemFabricId),
    );
    let state: AccessEvidenceState = "unavailable";
    if (observed.length) {
      state = section && section.status !== "complete" ? "partial" : "observed";
    } else if (readDenied) {
      state = "denied";
    } else if (section?.status === "unsupported") {
      state = "unsupported";
    }
    return {
      layer,
      state,
      source: observed.length
        ? [...new Set(observed.map((grant) => grant.source))].sort().join("; ")
        : undefined,
      reason: observed.length
        ? section && section.status !== "complete"
          ? "Recorded grants are retained, but access collection is incomplete."
          : "Recorded grants only; complete permission enumeration is not established."
        : readDenied
          ? "The snapshot reports a denied access evidence read, not a denied grant."
          : "No grant evidence for this layer is recorded for this pair.",
    };
  };
  const layers: AccessLayerEvidence[] = [
    grantLayer("workspace-grants"),
    grantLayer("item-grants"),
    {
      layer: "group-membership",
      state: "unavailable",
      reason: "Group membership expansion is not collected or inferred.",
    },
    {
      layer: "onelake-security",
      state: "unsupported",
      reason: "No verified public read API for OneLake role membership or data scope. Review in the Fabric portal.",
    },
    {
      layer: "purview-dlp",
      state: "unsupported",
      reason: "No verified public read API for DLP restriction state. Review in Microsoft Purview.",
    },
    {
      layer: "fabric-policies",
      state: "unavailable",
      reason: "Fabric Policies evaluation has not been collected. Tenant, region and identity support must be verified first.",
    },
  ];
  return {
    state: assessAccessEvidence(layers),
    layers,
    workspaceId: workspace?.fabricId.trim() || undefined,
    snapshotId: workspace?.snapshotId?.trim() || undefined,
    observedAt: workspace?.syncedAt?.trim() || undefined,
  };
}

export function evaluatedAccessLayers(coverage: AccessEvidenceCoverage): string {
  const evaluated = coverage.layers
    .filter((layer) => layer.state === "observed" || layer.state === "partial")
    .map((layer) =>
      `${ACCESS_LAYER_LABEL[layer.layer]}${layer.state === "partial" ? " (partial evidence)" : ""}`,
    );
  if (coverage.policyEvidence?.some((record) => record.coverage === "observed" || record.coverage === "partial")) {
    evaluated.push("Workspace policy settings (context read only; principal applicability not evaluated)");
  }
  return [...new Set(evaluated)].join("; ") || "Not evaluated";
}

export function accessLayerSummary(coverage: AccessEvidenceCoverage): string {
  return coverage.layers
    .map((layer) =>
      `${ACCESS_LAYER_LABEL[layer.layer]}: ${ACCESS_EVIDENCE_LABEL[layer.state]}`,
    )
    .join("; ");
}

export function storedPolicySummary(coverage: AccessEvidenceCoverage): string {
  return policyEvidenceSummary(coverage.policyEvidence ?? []);
}

export function unknownAccessLayers(
  coverage: AccessEvidenceCoverage,
): AccessLayerEvidence[] {
  return (Object.keys(ACCESS_LAYER_LABEL) as AccessEvidenceLayer[]).flatMap(
    (layer) => {
      const evidence = coverage.layers.find((entry) => entry.layer === layer);
      if (evidence?.state === "observed") return [];
      return [evidence ?? {
        layer,
        state: "unavailable",
        reason: "No coverage record is available for this layer.",
      } as AccessLayerEvidence];
    },
  );
}

export function unknownAccessLayerSummary(coverage: AccessEvidenceCoverage): string {
  return unknownAccessLayers(coverage)
    .map((layer) =>
      `${ACCESS_LAYER_LABEL[layer.layer]}: ${ACCESS_EVIDENCE_LABEL[layer.state]}`,
    )
    .join("; ");
}

export function matchesAccessCoverage(
  coverage: AccessEvidenceCoverage,
  filter: AccessCoverageFilter,
): boolean {
  return (
    filter === "all" ||
    coverage.state === filter ||
    coverage.layers.some((layer) => layer.state === filter)
  );
}
