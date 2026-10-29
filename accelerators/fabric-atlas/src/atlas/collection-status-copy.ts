const SECTION_LABELS: Record<string, string> = {
  definitions: "Item definitions",
  kqlSchema: "KQL schema",
  sqlSchema: "SQL schema (tables & columns)",
  sqlProperties: "SQL endpoint properties",
  storageSchema: "Lakehouse / Warehouse tables",
};

const CODE_REASONS: Record<string, string> = {
  "not-applicable": "No item of this type in the workspace.",
  "token-unavailable": "The Functions host gave no SQL token, so the SQL analytics endpoint catalog was not queried.",
  "tds-runtime-unavailable": "The Functions runtime cannot open a SQL (TDS) connection.",
  "endpoint-unsupported": "Fabric does not expose this API for these items (for example schema-enabled Lakehouses).",
  "storage-schema-unavailable": "Neither Lakehouse Tables REST nor the SQL analytics endpoint returned tables. Open the Lakehouse to see the cause.",
  "partial-unsupported": "Collected for some items only. Open an item to see why the others are missing.",
  "projection-truncated": "Collected, but trimmed to Atlas size limits.",
  "sql-endpoint-not-provisioned": "The SQL analytics endpoint is not provisioned yet.",
  "sql-endpoint-unavailable": "The SQL analytics endpoint did not answer.",
  "sql-connection-failed": "The SQL analytics endpoint refused or dropped the connection.",
  "authorization-failed": "The Atlas identity lacks permission on these items.",
  "item-type-unsupported": "This item type has no collector.",
  "parent-item-required": "Collected through the parent Lakehouse or Mirrored database.",
};

export function collectionSectionLabel(name: string): string {
  return SECTION_LABELS[name] ?? name.replaceAll(/([a-z])([A-Z])/g, "$1 $2");
}

export function collectionStatusReason(status: string, code?: string): string | undefined {
  if (code && CODE_REASONS[code]) return CODE_REASONS[code];
  if (status === "complete") return undefined;
  return code ? `Code: ${code}` : undefined;
}
