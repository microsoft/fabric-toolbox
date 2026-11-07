import {
  Activity,
  Boxes,
  FolderTree,
  KeyRound,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type {
  CoverageDimension,
  CoverageState,
  ItemFamilyCapability,
} from "./item-families";

export const COVERAGE_STATE_SHORT_LABEL: Record<CoverageState, string> = {
  collected: "Collected",
  partial: "Partial",
  "adapter-only": "Adapter only",
  deferred: "Deferred",
  unsupported: "Unsupported",
  excluded: "Excluded",
  "not-applicable": "N/A",
};

export const COVERAGE_DIMENSION_ICON: Record<CoverageDimension, LucideIcon> = {
  catalog: FolderTree,
  objects: Boxes,
  lineage: Waypoints,
  access: KeyRound,
  operations: Activity,
};

export function familySubtitle(capability: ItemFamilyCapability, itemCount?: number): string {
  const kind =
    capability.kind === "derived"
      ? `Inside ${capability.parentTypes?.join(", ") ?? "its parent item"}`
      : capability.kind === "workload-item"
        ? "Workload item"
        : capability.kind === "unknown-item"
          ? "Unregistered item type"
          : "Fabric item";
  return [
    kind,
    capability.maturity === "preview" ? "Preview" : undefined,
    itemCount != null && itemCount > 0
      ? `${itemCount} item${itemCount === 1 ? "" : "s"} in this snapshot`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}
