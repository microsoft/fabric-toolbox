import type { AtlasFeatureFlag } from "./feature-flags";
import type { PreviewFeatureId } from "./preview-api";

/**
 * What a gated capability means for this deployment. Maturity (Preview, Beta)
 * is a separate attribute and is never folded into this state.
 */
export type CapabilityState =
  | "active"
  | "available-off"
  | "portal-only"
  | "deferred"
  | "private-preview";

type CapabilitySupport = "flagged" | "always" | Exclude<CapabilityState, "active" | "available-off">;

// "flagged" capabilities are wired to their environment flag. Ontology
// definitions are collected by every sync, so its flag has no effect.
const CAPABILITY_SUPPORT: Record<PreviewFeatureId, CapabilitySupport> = {
  "fabric-app-functions": "flagged",
  "fabric-policies": "flagged",
  "item-relations": "flagged",
  "catalog-search": "flagged",
  ontology: "always",
  "event-schema-set": "deferred",
  "monitor-hub-alerts": "portal-only",
  "deployment-plans": "deferred",
  "iq-sharing": "deferred",
  "spark-runtime-lineage": "private-preview",
};

export const CAPABILITY_STATE_ORDER: CapabilityState[] = [
  "active",
  "available-off",
  "portal-only",
  "deferred",
  "private-preview",
];

export const CAPABILITY_STATE_META: Record<
  CapabilityState,
  { label: string; description: string; collapsed: boolean }
> = {
  active: {
    label: "Implemented · active",
    description: "Runs in this deployment.",
    collapsed: false,
  },
  "available-off": {
    label: "Available · off",
    description: "Built into Atlas. A deployment setting turns it on.",
    collapsed: false,
  },
  "portal-only": {
    label: "Portal only",
    description: "No public read API. Review it in the Fabric portal.",
    collapsed: true,
  },
  deferred: {
    label: "Deferred · contract blocked",
    description: "Waiting for a public contract Atlas can call with its identity.",
    collapsed: true,
  },
  "private-preview": {
    label: "Private Preview · not collected",
    description: "Needs tenant enrollment. Atlas collects nothing.",
    collapsed: true,
  },
};

export function capabilityState(flag: Pick<AtlasFeatureFlag, "id" | "enabled">): CapabilityState {
  const support = CAPABILITY_SUPPORT[flag.id];
  if (support === "flagged") return flag.enabled ? "active" : "available-off";
  return support === "always" ? "active" : support;
}

export function groupCapabilities<T extends Pick<AtlasFeatureFlag, "id" | "enabled">>(
  flags: readonly T[],
): Array<{ state: CapabilityState; flags: T[] }> {
  return CAPABILITY_STATE_ORDER.map((state) => ({
    state,
    flags: flags.filter((flag) => capabilityState(flag) === state),
  })).filter((group) => group.flags.length > 0);
}
