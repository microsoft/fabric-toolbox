import { createLineageIndex } from "./lineage";
import type { SchemaObjectRef } from "./lineage";
import type { AtlasData, ModelTableSchema } from "./model";
import { buildSemanticModelXRay } from "./semantic-xray";

export interface SchemaDependency {
  from: SchemaObjectRef;
  to: SchemaObjectRef;
  confidence: "verified" | "inferred";
}

export interface SchemaLineageIndex {
  dependenciesByFrom: Map<string, SchemaDependency[]>;
  consumersByTo: Map<string, SchemaDependency[]>;
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function schemaObjectKey(reference: SchemaObjectRef): string {
  return [
    reference.itemId,
    reference.kind,
    normalize(reference.tableName),
    normalize(reference.name),
  ].join("\u0000");
}

function uniqueMatch<T>(values: T[]): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function matchingTables(
  tables: ModelTableSchema[],
  name: string,
): ModelTableSchema[] {
  const expected = normalize(name);
  const exact = tables.filter((table) => normalize(table.name) === expected);
  if (exact.length) return exact;
  const leaf = (value: string) => normalize(value).split(".").at(-1);
  const requestedQualified = normalize(name).includes(".");
  return tables.filter(
    (table) =>
      leaf(table.name) === leaf(name) &&
      !(requestedQualified && normalize(table.name).includes(".")),
  );
}

export function buildSchemaDependencies(
  data: Pick<AtlasData, "items" | "schema" | "edges">,
): SchemaDependency[] {
  const schema = data.schema ?? {};
  const dependencies: SchemaDependency[] = [];
  const lineage = createLineageIndex(data.edges);
  const seen = new Set<string>();
  const add = (dependency: SchemaDependency) => {
    const key = [
      schemaObjectKey(dependency.from),
      schemaObjectKey(dependency.to),
      dependency.confidence,
    ].join("\u0001");
    if (schemaObjectKey(dependency.from) !== schemaObjectKey(dependency.to) && !seen.has(key)) {
      seen.add(key);
      dependencies.push(dependency);
    }
  };

  for (const item of data.items) {
    const tables = schema[item.fabricId] ?? [];
    const xray = buildSemanticModelXRay(item.fabricId, tables);
    for (const [fromKey, targetKeys] of xray.dependsOn) {
      const source = xray.objects.get(fromKey);
      if (!source) continue;
      const from: SchemaObjectRef = {
        itemId: item.fabricId,
        kind: source.kind,
        tableName: source.table,
        name: source.name,
      };
      for (const targetKey of targetKeys) {
        const target = xray.objects.get(targetKey);
        if (!target) continue;
        const to: SchemaObjectRef = {
          itemId: item.fabricId,
          kind: target.kind,
          tableName: target.table,
          name: target.name,
        };
        add({ from, to, confidence: "verified" });

        if (item.itemType !== "SemanticModel" || target.kind !== "column") {
          continue;
        }
        const candidates: SchemaObjectRef[] = [];
        for (const incoming of lineage.incoming.get(item.fabricId) ?? []) {
          const upstreamTables = schema[incoming.edge.source] ?? [];
          const upstreamTable = uniqueMatch(
            matchingTables(upstreamTables, target.table),
          );
          if (!upstreamTable) continue;
          const upstreamColumn = uniqueMatch(
            upstreamTable.columns.filter(
              (candidate) =>
                normalize(candidate.name) === normalize(target.name),
            ),
          );
          if (upstreamColumn) {
            candidates.push({
              itemId: incoming.edge.source,
              kind: "column",
              tableName: upstreamTable.name,
              name: upstreamColumn.name,
            });
          }
        }
        const sourceColumn = uniqueMatch(candidates);
        if (sourceColumn) {
          add({ from, to: sourceColumn, confidence: "inferred" });
        }
      }
    }
  }
  return dependencies.sort((left, right) =>
    [
      schemaObjectKey(left.from),
      schemaObjectKey(left.to),
      left.confidence,
    ]
      .join("\u0001")
      .localeCompare(
        [
          schemaObjectKey(right.from),
          schemaObjectKey(right.to),
          right.confidence,
        ].join("\u0001"),
      ),
  );
}

export function createSchemaLineageIndex(
  dependencies: SchemaDependency[],
): SchemaLineageIndex {
  const dependenciesByFrom = new Map<string, SchemaDependency[]>();
  const consumersByTo = new Map<string, SchemaDependency[]>();
  for (const dependency of dependencies) {
    const fromKey = schemaObjectKey(dependency.from);
    const toKey = schemaObjectKey(dependency.to);
    dependenciesByFrom.set(fromKey, [
      ...(dependenciesByFrom.get(fromKey) ?? []),
      dependency,
    ]);
    consumersByTo.set(toKey, [
      ...(consumersByTo.get(toKey) ?? []),
      dependency,
    ]);
  }
  return { dependenciesByFrom, consumersByTo };
}
