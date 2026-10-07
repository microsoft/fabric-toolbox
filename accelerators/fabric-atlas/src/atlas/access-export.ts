import type { AccessReviewRow } from "./governance";
import type { Grant } from "./model";
import {
  ACCESS_EVIDENCE_LABEL,
  GRANT_ONLY_NOTICE,
  accessLayerSummary,
  evaluatedAccessLayers,
  unknownAccessLayerSummary,
  storedPolicySummary,
} from "./access-coverage";

const FLAG_LABEL: Record<NonNullable<Grant["flag"]>, string> = {
  external: "External",
  broad: "Broad",
  servicePrincipal: "Service principal",
  admin: "Admin",
};

function isExternal(row: AccessReviewRow): boolean {
  return (
    row.principal?.kind === "guest" ||
    row.principal?.external === true ||
    row.flags.includes("external")
  );
}

function flags(row: AccessReviewRow): NonNullable<Grant["flag"]>[] {
  if (!isExternal(row) || row.flags.includes("external")) return row.flags;
  return ["external", ...row.flags];
}

export function csvCell(value: string | number): string {
  const text = String(value);
  const neutralized = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function accessRowsToCsv(rows: AccessReviewRow[]): string {
  const headers = [
    "Principal",
    "Principal ID",
    "Resolution",
    "Item",
    "Item ID",
    "Item type",
    "Highest recorded grant",
    "Origin",
    "Flags",
    "Contributing grants",
    "Highest-level grants",
    "Restrictions",
    "Coverage",
    "Evaluated layers",
    "Layer evidence",
    "Unknown or incomplete layers",
    "Grant sources",
    "Workspace ID",
    "Snapshot ID",
    "Snapshot observed at",
    "Assessment limitation",
    "Stored workspace policy context",
  ];
  const lines = rows.map((row) =>
    [
      row.principalRef,
      row.principalId ?? "",
      row.principalResolution,
      row.item.displayName,
      row.itemId,
      row.item.itemType,
      row.effectiveAccess,
      row.origin,
      flags(row).map((flag) => FLAG_LABEL[flag]).join("; "),
      row.applicableGrants.length,
      row.effectiveGrants.length,
      "Not evaluated",
      ACCESS_EVIDENCE_LABEL[row.coverage.state],
      evaluatedAccessLayers(row.coverage),
      accessLayerSummary(row.coverage),
      unknownAccessLayerSummary(row.coverage),
      row.applicableGrants.map((grant) =>
        `${grant.itemFabricId ? "Item" : "Workspace"}: ${grant.source}${grant.roleName ? ` (${grant.roleName})` : ""}`,
      ).join("; "),
      row.coverage.workspaceId ?? "Not recorded",
      row.coverage.snapshotId ?? "Not recorded",
      row.coverage.observedAt ?? "Not recorded",
      GRANT_ONLY_NOTICE,
      storedPolicySummary(row.coverage),
    ]
      .map(csvCell)
      .join(","),
  );
  return [headers.map(csvCell).join(","), ...lines].join("\r\n");
}
