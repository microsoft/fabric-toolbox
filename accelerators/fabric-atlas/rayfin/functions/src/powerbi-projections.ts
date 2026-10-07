import { strictUuid } from "./sync/protocol.js";

export const POWERBI_PROJECTION_LIMITS = {
  maxParts: 4_096,
  maxDecodedBytes: 8 * 1024 * 1024,
  maxObjects: 20_000,
  maxPages: 500,
  maxExpressionLength: 32_768,
  maxTextLength: 512,
} as const;

export type PowerBiProjectionCode =
  | "invalid-definition"
  | "projection-limit-exceeded"
  | "unsafe-content-rejected"
  | "definition-part-missing"
  | "format-unsupported";

export class PowerBiProjectionError extends Error {
  constructor(readonly code: PowerBiProjectionCode) {
    super(`Power BI metadata projection failed (${code}).`);
  }
}

type RecordValue = Record<string, unknown>;
export function metadataRecord(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PowerBiProjectionError("invalid-definition");
  }
  return value as RecordValue;
}

const UNSAFE_TEXT =
  /(?:bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|pwd|access[_-]?token|api[_-]?key|client[_-]?secret|accountkey|sharedaccesssignature)\s*[:=]|[?&]sig=|ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions|system\s+prompt|<\s*(?:script|system|instructions)\b)/i;

/** Only selected metadata labels may leave the collector, never descriptions or annotations. */
export function metadataText(value: unknown): string {
  if (
    typeof value !== "string" || !value.trim() ||
    value.length > POWERBI_PROJECTION_LIMITS.maxTextLength ||
    [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    UNSAFE_TEXT.test(value)
  ) {
    throw new PowerBiProjectionError("unsafe-content-rejected");
  }
  return value.trim();
}

export type ModelColumn = {
  name: string;
  dataType?: string;
  isHidden?: boolean;
  sourceColumn?: string;
  expression?: string;
  expressionStatus?: "sanitized" | "unsupported";
};
export type ModelMeasure = {
  name: string;
  expression?: string;
  expressionStatus: "sanitized" | "unsupported";
  isHidden?: boolean;
};
export type ModelTable = {
  name: string;
  objectType: "Model table";
  source: "Fabric semantic model definition (TMSL)" | "Power BI admin scanner";
  isHidden?: boolean;
  columns: ModelColumn[];
  measures: ModelMeasure[];
};
export type ModelRelationship = {
  name: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  isActive?: boolean;
};
export type ModelDependency = {
  table: string;
  object: string;
  objectType: "column" | "measure";
  referencedTable: string;
  referencedObject: string;
  referencedObjectType: "column" | "measure";
  source: "static-qualified-reference" | "static-unique-measure-reference";
};
export type ModelProjection = {
  tables: ModelTable[];
  relationships: ModelRelationship[];
  dependencies: ModelDependency[];
  expressionsOmitted: number;
};
export type ReportPage = { name: string; displayName: string; order?: number };
export type ReportProjection = {
  pages: ReportPage[];
  pagesSupported: boolean;
  semanticModelId?: string;
  referenceStatus: "resolved-id" | "by-path-unsupported" | "reference-unavailable";
};

class ProjectionBudget {
  private used = 0;
  take(count = 1): void {
    this.used += count;
    if (this.used > POWERBI_PROJECTION_LIMITS.maxObjects) {
      throw new PowerBiProjectionError("projection-limit-exceeded");
    }
  }
}

function records(value: unknown, budget: ProjectionBudget, required = false): RecordValue[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw new PowerBiProjectionError("invalid-definition");
  budget.take(value.length);
  return value.map(metadataRecord);
}

class Parts {
  readonly values = new Map<string, RecordValue>();
  private decoded = 0;
  constructor(response: unknown) {
    const parts = metadataRecord(metadataRecord(response).definition).parts;
    if (!Array.isArray(parts)) throw new PowerBiProjectionError("invalid-definition");
    if (parts.length > POWERBI_PROJECTION_LIMITS.maxParts) {
      throw new PowerBiProjectionError("projection-limit-exceeded");
    }
    for (const value of parts) {
      const part = metadataRecord(value);
      const path = part.path;
      if (
        typeof path !== "string" || path.length > 512 || /[\\:]/.test(path) ||
        [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
        path.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
        this.values.has(path)
      ) throw new PowerBiProjectionError("invalid-definition");
      this.values.set(path, part);
    }
  }
  json(path: string): RecordValue {
    const part = this.values.get(path);
    if (!part) throw new PowerBiProjectionError("definition-part-missing");
    if (part.payloadType !== "InlineBase64" || typeof part.payload !== "string") {
      throw new PowerBiProjectionError("invalid-definition");
    }
    const payload = part.payload;
    if (payload.length > Math.ceil(POWERBI_PROJECTION_LIMITS.maxDecodedBytes / 3) * 4) {
      throw new PowerBiProjectionError("projection-limit-exceeded");
    }
    this.decoded += Math.floor(payload.length / 4) * 3;
    if (this.decoded > POWERBI_PROJECTION_LIMITS.maxDecodedBytes) {
      throw new PowerBiProjectionError("projection-limit-exceeded");
    }
    // Canonical base64 also rejects bad padding and nonzero discarded bits.
    if (payload.length % 4 !== 0) throw new PowerBiProjectionError("invalid-definition");
    try {
      const binary = atob(payload);
      if (btoa(binary) !== payload) throw new Error();
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return metadataRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "")));
    } catch {
      throw new PowerBiProjectionError("invalid-definition");
    }
  }
}

/** Retains DAX structure; comments and string literals can contain credentials or business values. */
function daxExpression(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    if (value.length > 1_024 || value.some((line) => typeof line !== "string")) return undefined;
    if (value.reduce((sum, line: string) => sum + line.length, 0) > POWERBI_PROJECTION_LIMITS.maxExpressionLength) {
      return undefined;
    }
    value = value.join("\n");
  }
  if (
    typeof value !== "string" || !value.trim() ||
    value.length > POWERBI_PROJECTION_LIMITS.maxExpressionLength
  ) return undefined;
  let result = "";
  for (let index = 0; index < value.length;) {
    const character = value[index];
    if (character === '"' || character === "'" || character === "[") {
      const end = character === "[" ? "]" : character;
      let token = character;
      let closed = false;
      for (++index; index < value.length; index++) {
        token += value[index];
        if (value[index] !== end) continue;
        if (value[index + 1] === end) {
          token += value[++index];
          continue;
        }
        index++;
        closed = true;
        break;
      }
      if (!closed) return undefined;
      result += character === '"' ? '"[redacted]"' : token;
    } else if (value.startsWith("//", index) || value.startsWith("--", index)) {
      index = value.indexOf("\n", index);
      if (index < 0) break;
      result += "\n";
      index++;
    } else if (value.startsWith("/*", index)) {
      const end = value.indexOf("*/", index + 2);
      if (end < 0) return undefined;
      index = end + 2;
      result += " ";
    } else {
      result += character;
      index++;
    }
  }
  if (
    !result.trim() || UNSAFE_TEXT.test(result) ||
    /\bDATATABLE\s*\(|[{}]/i.test(result) ||
    [...result].some((character) => character.charCodeAt(0) < 32 && !"\n\r\t".includes(character))
  ) return undefined;
  return result.trim();
}

function hidden(value: RecordValue): { isHidden?: boolean } {
  if (value.isHidden === undefined) return {};
  if (typeof value.isHidden !== "boolean") throw new PowerBiProjectionError("invalid-definition");
  return { isHidden: value.isHidden };
}

function uniqueNames(values: { name: string }[]): void {
  const names = values.map((value) => value.name.toLowerCase());
  if (new Set(names).size !== names.length) throw new PowerBiProjectionError("invalid-definition");
}

function staticDaxReferences(expression: string): { table?: string; name: string }[] {
  const references: { table?: string; name: string }[] = [];
  const read = (start: number, opening: string, closing: string) => {
    if (expression[start] !== opening) return undefined;
    let value = "";
    for (let index = start + 1; index < expression.length; index++) {
      if (expression[index] !== closing) {
        value += expression[index];
      } else if (expression[index + 1] === closing) {
        value += closing;
        index++;
      } else {
        return { value, end: index + 1 };
      }
    }
    return undefined;
  };
  const whitespace = (start: number) => {
    let index = start;
    while (index < expression.length && /\s/.test(expression[index])) index++;
    return index;
  };
  for (let index = 0; index < expression.length;) {
    const literal = read(index, '"', '"');
    if (literal) { index = literal.end; continue; }
    const quotedTable = read(index, "'", "'");
    const identifier = quotedTable ? undefined : /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(expression.slice(index));
    const table = quotedTable ?? (identifier ? { value: identifier[0], end: index + identifier[0].length } : undefined);
    if (table) {
      const bracket = read(whitespace(table.end), "[", "]");
      if (bracket) references.push({ table: table.value, name: bracket.value });
      index = bracket?.end ?? table.end;
      continue;
    }
    const bracket = read(index, "[", "]");
    if (bracket) references.push({ name: bracket.value });
    index = bracket?.end ?? index + 1;
  }
  return references;
}

export function projectSemanticModel(response: unknown): ModelProjection {
  const parts = new Parts(response);
  if ([...parts.values.keys()].some((path) => /^definition\/.*\.tmdl$/.test(path))) {
    throw new PowerBiProjectionError(parts.values.has("model.bim") ? "invalid-definition" : "format-unsupported");
  }
  const model = metadataRecord(parts.json("model.bim").model);
  return projectSemanticModelStructure(model, "Fabric semantic model definition (TMSL)");
}

/** Shared selected-field projection for public TMSL and scanner model metadata. */
export function projectSemanticModelStructure(
  value: unknown,
  source: ModelTable["source"],
): ModelProjection {
  const model = metadataRecord(value);
  const budget = new ProjectionBudget();
  let expressionsOmitted = 0;
  const expression = (value: unknown) => {
    const projected = daxExpression(value);
    if (projected === undefined) expressionsOmitted++;
    return projected === undefined
      ? { expressionStatus: "unsupported" as const }
      : { expression: projected, expressionStatus: "sanitized" as const };
  };
  const tables: ModelTable[] = records(model.tables, budget, true).map((table) => {
    const columns = records(table.columns, budget).map((column): ModelColumn => ({
      name: metadataText(column.name),
      ...hidden(column),
      ...(column.dataType === undefined ? {} : { dataType: metadataText(column.dataType) }),
      ...(column.sourceColumn === undefined ? {} : { sourceColumn: metadataText(column.sourceColumn) }),
      ...(column.expression === undefined ? {} : expression(column.expression)),
    }));
    const measures = records(table.measures, budget).map((measure): ModelMeasure => ({
      name: metadataText(measure.name), ...hidden(measure), ...expression(measure.expression),
    }));
    uniqueNames([...columns, ...measures]);
    return {
      name: metadataText(table.name),
      objectType: "Model table",
      source,
      ...hidden(table),
      columns, measures,
    };
  });
  uniqueNames(tables);
  const objects = new Map<string, { kind: "column" | "measure"; table: string; name: string }>();
  const measuresByName = new Map<string, { table: string; name: string }[]>();
  const key = (table: string, name: string) => JSON.stringify([table.toLowerCase(), name.toLowerCase()]);
  for (const table of tables) {
    for (const column of table.columns) objects.set(key(table.name, column.name), { kind: "column", table: table.name, name: column.name });
    for (const measure of table.measures) {
      objects.set(key(table.name, measure.name), { kind: "measure", table: table.name, name: measure.name });
      const name = measure.name.toLowerCase();
      const existing = measuresByName.get(name) ?? [];
      existing.push({ table: table.name, name: measure.name });
      measuresByName.set(name, existing);
    }
  }
  const object = (tableName: string, name: string) => objects.get(key(tableName, name));
  const relationships = records(model.relationships, budget).map((relationship): ModelRelationship => {
    const projected = {
      name: metadataText(relationship.name),
      fromTable: metadataText(relationship.fromTable),
      fromColumn: metadataText(relationship.fromColumn),
      toTable: metadataText(relationship.toTable),
      toColumn: metadataText(relationship.toColumn),
      ...(relationship.isActive === undefined ? {} : { isActive: relationship.isActive }),
    };
    if (
      object(projected.fromTable, projected.fromColumn)?.kind !== "column" ||
      object(projected.toTable, projected.toColumn)?.kind !== "column" ||
      (projected.isActive !== undefined && typeof projected.isActive !== "boolean")
    ) throw new PowerBiProjectionError("invalid-definition");
    const from = object(projected.fromTable, projected.fromColumn)!;
    const to = object(projected.toTable, projected.toColumn)!;
    return {
      ...projected, fromTable: from.table, fromColumn: from.name, toTable: to.table, toColumn: to.name,
    } as ModelRelationship;
  });
  uniqueNames(relationships);
  const dependencies: ModelDependency[] = [];
  const seenDependencies = new Set<string>();
  for (const table of tables) {
    for (const [kind, values] of [["column", table.columns], ["measure", table.measures]] as const) {
      for (const value of values) {
        // A static subset only: engine-resolved dependencies require INFO/XMLA.
        for (const reference of staticDaxReferences(value.expression ?? "")) {
          let target = reference.table ? object(reference.table, reference.name) : undefined;
          if (!reference.table) {
            const measures = measuresByName.get(reference.name.toLowerCase()) ?? [];
            // Naked references are retained only for a unique measure, without a local column ambiguity.
            if (measures.length === 1 && object(table.name, reference.name)?.kind !== "column") {
              target = object(measures[0].table, measures[0].name);
            }
          }
          if (!target || (target.table === table.name && target.name === value.name)) continue;
          budget.take();
          const dependency: ModelDependency = {
            table: table.name, object: value.name, objectType: kind,
            referencedTable: target.table, referencedObject: target.name, referencedObjectType: target.kind,
            source: reference.table ? "static-qualified-reference" : "static-unique-measure-reference",
          };
          const identity = JSON.stringify(dependency);
          if (!seenDependencies.has(identity)) {
            seenDependencies.add(identity);
            dependencies.push(dependency);
          }
        }
      }
    }
  }
  return { tables, relationships, dependencies, expressionsOmitted };
}

export function projectReport(response: unknown): ReportProjection {
  const parts = new Parts(response);
  const reference = metadataRecord(parts.json("definition.pbir").datasetReference);
  if (reference.byConnection !== undefined && reference.byPath !== undefined) {
    throw new PowerBiProjectionError("invalid-definition");
  }
  const projection: ReportProjection = {
    pages: [], pagesSupported: false,
    referenceStatus: reference.byPath ? "by-path-unsupported" : "reference-unavailable",
  };
  if (reference.byConnection !== undefined) {
    const connection = metadataRecord(reference.byConnection);
    const ids: string[] = [];
    if (connection.pbiModelDatabaseName !== undefined) ids.push(strictReference(connection.pbiModelDatabaseName));
    if (connection.connectionString !== undefined) {
      if (typeof connection.connectionString !== "string" || connection.connectionString.length > 8_192) {
        throw new PowerBiProjectionError("invalid-definition");
      }
      const id = connectionModelId(connection.connectionString);
      if (id) ids.push(id);
    }
    if (new Set(ids).size > 1) throw new PowerBiProjectionError("invalid-definition");
    if (ids[0]) {
      projection.semanticModelId = ids[0];
      projection.referenceStatus = "resolved-id";
    }
  }
  const pages = [...parts.values.keys()].filter((path) => /^definition\/pages\/[\w-]+\/page\.json$/.test(path));
  if (pages.length && parts.values.has("report.json")) throw new PowerBiProjectionError("invalid-definition");
  if (!pages.length) return projection; // PBIR-Legacy is intentionally not parsed.
  if (pages.length > POWERBI_PROJECTION_LIMITS.maxPages) {
    throw new PowerBiProjectionError("projection-limit-exceeded");
  }
  const orderPart = parts.values.has("definition/pages/pages.json")
    ? parts.json("definition/pages/pages.json") : undefined;
  let order: string[] | undefined;
  if (orderPart?.pageOrder !== undefined) {
    if (!Array.isArray(orderPart.pageOrder) || orderPart.pageOrder.length > POWERBI_PROJECTION_LIMITS.maxPages) {
      throw new PowerBiProjectionError("invalid-definition");
    }
    order = orderPart.pageOrder.map(metadataText);
    if (new Set(order).size !== order.length) throw new PowerBiProjectionError("invalid-definition");
  }
  projection.pages = pages.map((path) => {
    const page = parts.json(path);
    const name = metadataText(page.name);
    if (name !== path.split("/")[2]) throw new PowerBiProjectionError("invalid-definition");
    return {
      name, displayName: metadataText(page.displayName),
      ...(order?.includes(name) ? { order: order.indexOf(name) } : {}),
    };
  });
  uniqueNames(projection.pages);
  if (order && (order.length !== pages.length || order.some((name) => !projection.pages.some((page) => page.name === name)))) {
    throw new PowerBiProjectionError("invalid-definition");
  }
  projection.pages.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  projection.pagesSupported = true;
  return projection;
}

function strictReference(value: unknown): string {
  try { return strictUuid(value); } catch { throw new PowerBiProjectionError("invalid-definition"); }
}

/** Reads only the public model-ID property; quoted unrelated values cannot impersonate a binding. */
function connectionModelId(connection: string): string | undefined {
  const segments: string[] = [];
  let start = 0;
  let quote: string | undefined;
  let valueStart: number | undefined;
  for (let index = 0; index < connection.length; index++) {
    const character = connection[index];
    if (quote) {
      if (character === quote && connection[index + 1] === quote) index++;
      else if (character === quote) quote = undefined;
    } else if ((character === '"' || character === "'") &&
      valueStart !== undefined && connection.slice(valueStart, index).trim() === "") {
      quote = character;
    } else if (character === "=" && valueStart === undefined) {
      valueStart = index + 1;
    } else if (character === ";") {
      segments.push(connection.slice(start, index));
      start = index + 1;
      valueStart = undefined;
    }
  }
  if (quote) throw new PowerBiProjectionError("invalid-definition");
  segments.push(connection.slice(start));
  let id: string | undefined;
  for (const segment of segments) {
    const selected = /^\s*semanticmodelid\s*=\s*(.*?)\s*$/i.exec(segment);
    if (!selected) continue;
    if (id) throw new PowerBiProjectionError("invalid-definition");
    const value = selected[1];
    id = strictReference(value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value);
  }
  return id;
}
