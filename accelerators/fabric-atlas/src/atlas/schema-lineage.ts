import { extractDaxRefs } from "./dax-refs";
import { createLineageIndex } from "./lineage";
import type { SchemaObjectRef } from "./lineage";
import type { AtlasData, ModelTableSchema } from "./model";

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
  return value?.trim().toLocaleLowerCase() ?? "";
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

function exactTables(
  tables: ModelTableSchema[],
  name: string,
): ModelTableSchema[] {
  const expected = normalize(name);
  return tables.filter((table) => normalize(table.name) === expected);
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
    const measuresByName = new Map<string, SchemaObjectRef[]>();
    for (const table of tables) {
      for (const measure of table.measures) {
        const key = normalize(measure.name);
        const values = measuresByName.get(key) ?? [];
        values.push({
          itemId: item.fabricId,
          kind: "measure",
          tableName: table.name,
          name: measure.name,
        });
        measuresByName.set(key, values);
      }
    }

    for (const table of tables) {
      for (const measure of table.measures) {
        if (!measure.expr?.trim()) continue;
        const from: SchemaObjectRef = {
          itemId: item.fabricId,
          kind: "measure",
          tableName: table.name,
          name: measure.name,
        };
        for (const reference of extractDaxRefs(measure.expr)) {
          if (reference.kind === "measure") {
            const target = uniqueMatch(
              measuresByName.get(normalize(reference.name)) ?? [],
            );
            if (target) add({ from, to: target, confidence: "verified" });
            continue;
          }
          const targetTable = uniqueMatch(
            exactTables(tables, reference.table ?? ""),
          );
          if (!targetTable) continue;
          const matchingColumns = targetTable.columns.filter(
              (candidate) =>
                normalize(candidate.name) === normalize(reference.name),
            );
          const matchingMeasures = targetTable.measures.filter(
            (candidate) =>
              normalize(candidate.name) === normalize(reference.name),
          );
          if (matchingColumns.length + matchingMeasures.length !== 1) {
            continue;
          }
          const column = matchingColumns[0];
          if (!column) {
            const qualifiedMeasure = matchingMeasures[0];
            add({
              from,
              to: {
                itemId: item.fabricId,
                kind: "measure",
                tableName: targetTable.name,
                name: qualifiedMeasure.name,
              },
              confidence: "verified",
            });
            continue;
          }
          const modelColumn: SchemaObjectRef = {
            itemId: item.fabricId,
            kind: "column",
            tableName: targetTable.name,
            name: column.name,
          };
          add({ from, to: modelColumn, confidence: "verified" });

          if (item.itemType !== "SemanticModel") continue;
          const candidates: SchemaObjectRef[] = [];
          for (const incoming of lineage.incoming.get(item.fabricId) ?? []) {
            const upstreamTables = schema[incoming.edge.source] ?? [];
            const upstreamTable = uniqueMatch(
              matchingTables(upstreamTables, targetTable.name),
            );
            if (!upstreamTable) continue;
            const upstreamColumn = uniqueMatch(
              upstreamTable.columns.filter(
                (candidate) =>
                  normalize(candidate.name) === normalize(column.name),
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
