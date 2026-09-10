import type { AccessReviewRow } from "./governance";
import type { Grant } from "./model";

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
    "Effective permission",
    "Origin",
    "Flags",
    "Contributing grants",
    "Effective grants",
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
    ]
      .map(csvCell)
      .join(","),
  );
  return [headers.map(csvCell).join(","), ...lines].join("\r\n");
}
