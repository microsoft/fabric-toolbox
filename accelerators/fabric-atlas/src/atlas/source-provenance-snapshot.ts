import type { SourceProvenanceStageEnvelope, SourceProvenanceStatus } from "../../rayfin/functions/src/workspace-source-provenance";
import type { RawSync } from "./live-sync";
import { buildSourceProvenance } from "./source-provenance";

export function sourceProvenanceSnapshot(
  envelope: SourceProvenanceStageEnvelope, itemIds: ReadonlySet<string>,
): RawSync {
  const provenance = buildSourceProvenance(envelope, itemIds);
  const config: NonNullable<RawSync["config"]> = [];
  const lineage: NonNullable<RawSync["lineage"]> = [];
  const schema: NonNullable<RawSync["schema"]> = {};
  const sections: NonNullable<RawSync["sections"]> = { sourceProvenance: envelope.summary };
  const add = (itemId: string, label: string, value: string) => {
    if (itemIds.has(itemId)) config.push({ itemId, section: "Source provenance", label, value });
  };
  const coverage = (itemId: string, name: string, value: SourceProvenanceStatus) => {
    add(itemId, `${name} coverage`, `${value.status}${value.code ? `: ${value.code}` : ""}`);
  };
  for (const edge of provenance.edges) {
    const source = edge.source;
    const owner = itemIds.has(edge.consumer.itemId) ? edge.consumer.itemId
      : source.kind === "fabric-item" && source.inSnapshot ? source.itemId : "";
    const reference = source.kind === "fabric-item"
      ? `workspace=${source.workspaceId}; item=${source.itemId}`
      : `provider=${source.provider}; connection=${source.connectionId}`;
    add(owner, edge.relation, `${reference}; consumer=${edge.consumer.itemId}; field=${edge.binding.field}${edge.binding.location ? `; location=${edge.binding.location}` : ""}`);
    if (source.kind === "fabric-item" && source.inSnapshot &&
      edge.consumer.workspaceId === provenance.workspaceId && itemIds.has(edge.consumer.itemId) &&
      source.itemId !== edge.consumer.itemId) {
      lineage.push({ source: source.itemId, target: edge.consumer.itemId, relation: edge.relation });
    }
  }
  for (const unresolved of provenance.unresolved) add(
    unresolved.consumer.itemId, `${unresolved.relation} unresolved`,
    `${unresolved.reason}${unresolved.location ? `; location=${unresolved.location}` : ""}`,
  );
  for (const policy of provenance.policyOrigins) add(
    policy.consumer.itemId, policy.mechanism, `${policy.evidence}; destination enforcement not verified`,
  );
  for (const item of envelope.items) {
    add(item.id, "Observed at", provenance.observedAt);
    coverage(item.id, "Collection", item);
    if (item.shortcuts) {
      coverage(item.id, "Shortcuts", item.shortcuts);
      if (item.shortcuts.status === "complete") {
        for (const shortcut of item.shortcuts.shortcuts) {
          add(item.id, "Shortcut", `name=${shortcut.name}; type=${shortcut.targetType}; location=${shortcut.path}`);
          if (shortcut.oneLake?.path) add(item.id, "Shortcut target path", `name=${shortcut.name}; path=${shortcut.oneLake.path}`);
        }
        // A shortcut is an inventory object, not proof of a complete table or column scan.
        const tables = item.shortcuts.shortcuts.filter((shortcut) => /^Tables(?:\/|$)/i.test(shortcut.path));
        if (tables.length) schema[item.id] = tables.map((shortcut) => {
          const path = shortcut.path.split("/").slice(1).filter(Boolean);
          if (path.at(-1) !== shortcut.name) path.push(shortcut.name);
          return {
            name: path.join("."), objectType: "Shortcut", source: "Fabric OneLake shortcuts API",
            columns: [], measures: [],
          };
        });
      }
    }
    if (item.mirroring) {
      coverage(item.id, "Mirroring", item.mirroring);
      coverage(item.id, "Mirroring definition", item.mirroring.definition);
      coverage(item.id, "Mirroring replication", item.mirroring.replication);
      const definition = item.mirroring.definition;
      if (definition.status === "complete") {
        if (definition.sourceType) add(item.id, "Mirroring provider", definition.sourceType);
        if (item.mirroring.replication.status === "complete" && item.mirroring.replication.state) {
          add(item.id, "Mirroring state", item.mirroring.replication.state);
        }
        add(item.id, "Mirrored table inventory", definition.tablesTruncated
          ? "Truncated configured table selection; columns not collected"
          : definition.tableSelection === "all"
            ? "All tables configured; table names and columns not enumerated"
            : "Configured table selection only; columns not collected");
        if (definition.tables.length) schema[item.id] = definition.tables.map((table) => ({
          name: [table.schema, table.table].filter(Boolean).join("."),
          objectType: "Mirrored table", source: "Fabric mirrored database definition",
          columns: [], measures: [],
        }));
      }
    }
    if (item.materializedLakeViews) coverage(item.id, "Materialized lake views", item.materializedLakeViews);
  }
  return { lineage, config, schema, sections, capabilities: { sourceProvenance: envelope.summary } };
}
