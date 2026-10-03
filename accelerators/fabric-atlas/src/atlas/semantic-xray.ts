import { extractDaxRefs, type DaxRef } from "./dax-refs";
import { markdownCodeBlock, markdownText } from "./markdown";
import type { ModelTableSchema } from "./model";

// Model-level DAX dependency evidence for one semantic model. Edges use only
// references that resolve to exactly one synchronized column or measure,
// following the same rules as buildSchemaDependencies; everything else is
// reported as unresolved or ambiguous instead of being guessed.

export type XRayObjectKind = "measure" | "column";
export type XRayDirection = "dependsOn" | "usedBy";

export interface XRayObject {
  key: string;
  kind: XRayObjectKind;
  table: string;
  name: string;
  dataType?: string;
  expression?: string;
  isHidden?: boolean;
}

export interface XRayReference {
  from: string;
  reference: string;
  status: "unresolved" | "ambiguous";
  candidates: string[];
}

export interface XRayTable {
  name: string;
  isHidden?: boolean;
  objectKeys: string[];
}

export interface SemanticModelXRay {
  itemId: string;
  tables: XRayTable[];
  objects: ReadonlyMap<string, XRayObject>;
  dependsOn: ReadonlyMap<string, string[]>;
  usedBy: ReadonlyMap<string, string[]>;
  edgeCount: number;
  references: XRayReference[];
  /** Strongly connected measure groups, including self references. */
  cycles: string[][];
  measureCount: number;
  columnCount: number;
}

export interface XRayImpact {
  keys: Set<string>;
  distance: Map<string, number>;
}

function normalize(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function xrayObjectKey(kind: XRayObjectKind, table: string, name: string): string {
  return `${kind}\u0000${normalize(table)}\u0000${normalize(name)}`;
}

function referenceText(reference: DaxRef): string {
  return reference.table ? `'${reference.table}'[${reference.name}]` : `[${reference.name}]`;
}

function stronglyConnected(keys: readonly string[], edges: ReadonlyMap<string, string[]>): string[][] {
  const indexes = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const result: string[][] = [];
  let next = 0;
  const visit = (key: string) => {
    indexes.set(key, next);
    low.set(key, next);
    next += 1;
    stack.push(key);
    onStack.add(key);
  };
  for (const root of keys) {
    if (indexes.has(root)) continue;
    visit(root);
    const frames = [{ key: root, child: 0 }];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const children = edges.get(frame.key) ?? [];
      if (frame.child < children.length) {
        const child = children[frame.child];
        frame.child += 1;
        if (!indexes.has(child)) {
          visit(child);
          frames.push({ key: child, child: 0 });
        } else if (onStack.has(child)) {
          low.set(frame.key, Math.min(low.get(frame.key)!, indexes.get(child)!));
        }
        continue;
      }
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) low.set(parent.key, Math.min(low.get(parent.key)!, low.get(frame.key)!));
      if (low.get(frame.key) !== indexes.get(frame.key)) continue;
      const component: string[] = [];
      let member: string | undefined;
      do {
        member = stack.pop();
        if (member === undefined) break;
        onStack.delete(member);
        component.push(member);
      } while (member !== frame.key);
      const selfLoop = (edges.get(frame.key) ?? []).includes(frame.key);
      if (component.length > 1 || selfLoop) result.push(component.sort());
    }
  }
  return result.sort((left, right) => left[0].localeCompare(right[0]));
}

/** Builds the complete DAX dependency evidence of one semantic model. */
export function buildSemanticModelXRay(
  itemId: string,
  tables: readonly ModelTableSchema[],
): SemanticModelXRay {
  const objects = new Map<string, XRayObject>();
  const measuresByName = new Map<string, string[]>();
  const xrayTables: XRayTable[] = tables.map((table) => {
    const objectKeys: string[] = [];
    for (const measure of table.measures) {
      const key = xrayObjectKey("measure", table.name, measure.name);
      if (!objects.has(key)) {
        objects.set(key, {
          key,
          kind: "measure",
          table: table.name,
          name: measure.name,
          expression: measure.expr,
          isHidden: measure.isHidden,
        });
        objectKeys.push(key);
      }
      const byName = measuresByName.get(normalize(measure.name)) ?? [];
      byName.push(key);
      measuresByName.set(normalize(measure.name), byName);
    }
    for (const column of table.columns) {
      const key = xrayObjectKey("column", table.name, column.name);
      if (objects.has(key)) continue;
      objects.set(key, {
        key,
        kind: "column",
        table: table.name,
        name: column.name,
        dataType: column.dataType,
        isHidden: column.isHidden,
      });
      objectKeys.push(key);
    }
    return { name: table.name, isHidden: table.isHidden, objectKeys };
  });

  const dependsOn = new Map<string, string[]>();
  const usedBy = new Map<string, string[]>();
  const references: XRayReference[] = [];
  let edgeCount = 0;
  const link = (from: string, to: string) => {
    const targets = dependsOn.get(from) ?? [];
    if (targets.includes(to)) return;
    targets.push(to);
    dependsOn.set(from, targets);
    usedBy.set(to, [...(usedBy.get(to) ?? []), from]);
    edgeCount += 1;
  };

  for (const table of tables) {
    for (const measure of table.measures) {
      if (!measure.expr?.trim()) continue;
      const from = xrayObjectKey("measure", table.name, measure.name);
      for (const reference of extractDaxRefs(measure.expr)) {
        if (!reference.table) {
          const candidates = measuresByName.get(normalize(reference.name)) ?? [];
          if (candidates.length === 1) link(from, candidates[0]);
          else {
            references.push({
              from,
              reference: referenceText(reference),
              status: candidates.length ? "ambiguous" : "unresolved",
              candidates,
            });
          }
          continue;
        }
        const targetTables = tables.filter(
          (candidate) => normalize(candidate.name) === normalize(reference.table),
        );
        const candidates =
          targetTables.length === 1
            ? [
                ...targetTables[0].columns
                  .filter((column) => normalize(column.name) === normalize(reference.name))
                  .map((column) => xrayObjectKey("column", targetTables[0].name, column.name)),
                ...targetTables[0].measures
                  .filter((candidate) => normalize(candidate.name) === normalize(reference.name))
                  .map((candidate) => xrayObjectKey("measure", targetTables[0].name, candidate.name)),
              ]
            : [];
        if (candidates.length === 1) link(from, candidates[0]);
        else {
          references.push({
            from,
            reference: referenceText(reference),
            status: candidates.length > 1 || targetTables.length > 1 ? "ambiguous" : "unresolved",
            candidates,
          });
        }
      }
    }
  }

  const keys = [...objects.keys()];
  return {
    itemId,
    tables: xrayTables,
    objects,
    dependsOn,
    usedBy,
    edgeCount,
    references,
    cycles: stronglyConnected(keys, dependsOn),
    measureCount: [...objects.values()].filter((entry) => entry.kind === "measure").length,
    columnCount: [...objects.values()].filter((entry) => entry.kind === "column").length,
  };
}

/** Direct or transitive dependencies or consumers; cycles terminate safely. */
export function xrayImpact(
  xray: SemanticModelXRay,
  start: string,
  direction: XRayDirection,
  transitive: boolean,
): XRayImpact {
  const edges = direction === "dependsOn" ? xray.dependsOn : xray.usedBy;
  const keys = new Set<string>();
  const distance = new Map<string, number>();
  const queue: Array<[string, number]> = [[start, 0]];
  const visited = new Set([start]);
  for (let head = 0; head < queue.length; head += 1) {
    const [current, depth] = queue[head];
    if (!transitive && depth >= 1) continue;
    for (const next of edges.get(current) ?? []) {
      if (next === start) continue;
      if (!keys.has(next)) {
        keys.add(next);
        distance.set(next, depth + 1);
      }
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([next, depth + 1]);
      }
    }
  }
  return { keys, distance };
}

export function xrayObjectLabel(object: Pick<XRayObject, "table" | "name" | "kind">): string {
  return object.kind === "measure" ? `[${object.name}]` : `'${object.table}'[${object.name}]`;
}

/** Plain-text dependency evidence for one object, suitable for export. */
export function xrayEvidenceMarkdown(
  xray: SemanticModelXRay,
  key: string,
  modelName: string,
): string {
  const object = xray.objects.get(key);
  if (!object) return "";
  const describe = (entries: Iterable<string>, impact: XRayImpact) =>
    [...entries]
      .map((entry) => xray.objects.get(entry))
      .filter((entry): entry is XRayObject => !!entry)
      .sort((left, right) => (impact.distance.get(left.key) ?? 0) - (impact.distance.get(right.key) ?? 0) || left.key.localeCompare(right.key))
      .map((entry) => `- ${markdownText(entry.table)} ${markdownText(xrayObjectLabel(entry))} (${entry.kind}, ${impact.distance.get(entry.key)} hop${impact.distance.get(entry.key) === 1 ? "" : "s"})`);
  const dependencies = xrayImpact(xray, key, "dependsOn", true);
  const consumers = xrayImpact(xray, key, "usedBy", true);
  const unresolved = xray.references.filter((reference) => reference.from === key);
  return [
    `# ${markdownText(modelName)}: ${markdownText(object.table)} ${markdownText(xrayObjectLabel(object))}`,
    "",
    `- Kind: ${object.kind}`,
    ...(object.dataType ? [`- Data type: ${markdownText(object.dataType)}`] : []),
    ...(object.expression ? ["", ...markdownCodeBlock(object.expression, "dax")] : []),
    "",
    `## Depends on (${dependencies.keys.size})`,
    ...(dependencies.keys.size ? describe(dependencies.keys, dependencies) : ["- None"]),
    "",
    `## Used by in this model (${consumers.keys.size})`,
    ...(consumers.keys.size
      ? describe(consumers.keys, consumers)
      : ["- No DAX consumers in this model. Report and visual usage is not exposed by Fabric APIs."]),
    "",
    `## Unresolved or ambiguous references (${unresolved.length})`,
    ...(unresolved.length ? unresolved.map((entry) => `- ${markdownText(entry.reference)}: ${entry.status}`) : ["- None"]),
    "",
  ].join("\n");
}
