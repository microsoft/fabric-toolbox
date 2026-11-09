import { isCredentialLikeText } from "./definition-projections.js";

/*
 * Conservative structural parser for the `DatabaseSchema.kql` part of the
 * documented KQL Database definition. It lexes the whole script so strings,
 * comments, multi-line blocks and bracketed scopes cannot hide statement
 * boundaries, then recognizes only table, function and materialized-view
 * declarations. Function bodies, view queries, property bags, ingestion
 * mappings, policies, principals and literal values are skipped without being
 * read into the result. Anything that cannot be proven safe is counted as an
 * unsupported statement instead of being guessed.
 */

export type KqlSchemaErrorCode =
  | "invalid-definition"
  | "response-size-exceeded"
  | "projection-limit-exceeded";

export class KqlSchemaError extends Error {
  constructor(readonly code: KqlSchemaErrorCode) {
    super(`KQL database schema projection failed (${code}).`);
    this.name = "KqlSchemaError";
  }
}

export const KQL_SCHEMA_LIMITS = {
  maxParts: 500,
  maxPartPathLength: 512,
  maxDecodedBytes: 8 * 1024 * 1024,
  maxTokens: 2_000_000,
  maxStatements: 100_000,
  maxTables: 1_000,
  maxColumnsPerTable: 1_000,
  maxFunctions: 512,
  maxParameters: 64,
  maxMaterializedViews: 512,
  maxNameLength: 256,
} as const;

export type KqlSchemaColumn = { name: string; dataType: string };
export type KqlSchemaTable = { name: string; columns: KqlSchemaColumn[] };
/** Name and parameter signature only; the function body is never read. */
export type KqlSchemaFunction = { name: string; parameters: KqlSchemaColumn[] };
/** Name and, when declared `on table`, the source table; the query is never read. */
export type KqlSchemaMaterializedView = { name: string; sourceTable?: string };

export interface KqlSchemaProjection {
  tables: KqlSchemaTable[];
  functions: KqlSchemaFunction[];
  materializedViews: KqlSchemaMaterializedView[];
  /** Known non-structural statements such as policies, mappings and principals. */
  ignoredStatements: number;
  /** Statements or fragments that could not be proven to be supported declarations. */
  unsupportedStatements: number;
  truncated: boolean;
}

export interface KqlSchemaScript {
  script?: string;
  unknownParts: number;
}

type Token =
  | { kind: "command"; value: string }
  | { kind: "word"; value: string }
  | { kind: "string"; value: string }
  | { kind: "punct"; value: string }
  | { kind: "opaque" };

const LIMITS = KQL_SCHEMA_LIMITS;
const WORD_START = /[\p{L}_]/u;
const WORD_PART = /[\p{L}\p{N}_-]/u;
const PLAIN_NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const OPENERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const CLOSERS = new Set([")", "]", "}"]);
// Kusto scalar types and documented aliases, normalized to the CslType names Atlas already stores.
const SCALAR_TYPES = new Map([
  ["bool", "bool"],
  ["boolean", "bool"],
  ["datetime", "datetime"],
  ["date", "datetime"],
  ["dynamic", "dynamic"],
  ["guid", "guid"],
  ["uuid", "guid"],
  ["uniqueid", "guid"],
  ["int", "int"],
  ["int32", "int"],
  ["long", "long"],
  ["int64", "long"],
  ["real", "real"],
  ["double", "real"],
  ["string", "string"],
  ["timespan", "timespan"],
  ["time", "timespan"],
  ["decimal", "decimal"],
]);
const TABLE_SETTINGS = new Set(["policy", "policies", "ingestion", "docstring", "folder", "column-docstrings"]);
const FUNCTION_SETTINGS = new Set(["docstring", "folder"]);
const VIEW_SETTINGS = new Set(["docstring", "folder", "policy", "policies", "lookback", "autoupdateschema"]);

function invalid(): never {
  throw new KqlSchemaError("invalid-definition");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

/** Validates a part path; traversal-style, absolute or control-character paths are rejected. */
function partPath(part: Record<string, unknown>): string {
  const path = typeof part.path === "string" ? part.path.trim() : "";
  if (!path || path.length > LIMITS.maxPartPathLength || hasControlCharacter(path)) invalid();
  const normalized = path.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    invalid();
  }
  return normalized;
}

/**
 * Strict RFC 4648 alphabet with optional padding. Fabric's KQL Database
 * definition samples return both padded and unpadded payloads.
 */
function decodePayload(part: Record<string, unknown>): string {
  const payload = typeof part.payload === "string" ? part.payload.trim() : "";
  if (part.payloadType !== "InlineBase64" || !payload) invalid();
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const body = payload.length - padding;
  if ((padding && payload.length % 4 !== 0) || body % 4 === 1) invalid();
  const decodedLength = Math.floor(body / 4) * 3 + (body % 4 === 0 ? 0 : (body % 4) - 1);
  if (decodedLength > LIMITS.maxDecodedBytes) throw new KqlSchemaError("response-size-exceeded");
  for (let index = 0; index < body; index += 1) {
    const code = payload.charCodeAt(index);
    const valid =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      code === 43 ||
      code === 47;
    if (!valid) invalid();
  }
  const binary = atob(payload.slice(0, body).padEnd(Math.ceil(body / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    invalid();
  }
}

/**
 * Returns only the decoded `DatabaseSchema.kql` part. `.platform` and
 * `DatabaseProperties.json` are skipped without decoding; other well-formed
 * paths are counted as forward-compatible parts and never decoded.
 */
export function extractKqlSchemaScript(response: unknown): KqlSchemaScript {
  if (!isRecord(response) || !isRecord(response.definition)) invalid();
  const parts = response.definition.parts;
  if (!Array.isArray(parts) || parts.length > LIMITS.maxParts) invalid();
  let script: string | undefined;
  let unknownParts = 0;
  for (const part of parts) {
    if (!isRecord(part)) invalid();
    const path = partPath(part).toLowerCase();
    if (path === ".platform" || path === "databaseproperties.json") continue;
    if (path === "databaseschema.kql") {
      if (script !== undefined) invalid();
      script = decodePayload(part);
      continue;
    }
    unknownParts += 1;
  }
  return { script, unknownParts };
}

function readQuoted(script: string, start: number, quote: string, verbatim: boolean): { value: string; next: number } {
  let value = "";
  let index = start;
  while (index < script.length) {
    const character = script[index];
    if (character === "\n" || character === "\r") invalid();
    if (verbatim && character === quote) {
      if (script[index + 1] === quote) {
        value += quote;
        index += 2;
        continue;
      }
      return { value, next: index + 1 };
    }
    if (!verbatim && character === "\\") {
      const escaped = script[index + 1];
      if (escaped === undefined) invalid();
      value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped === "r" ? "\r" : escaped;
      index += 2;
      continue;
    }
    if (character === quote) return { value, next: index + 1 };
    value += character;
    index += 1;
  }
  invalid();
}

/** Splits the script into top-level statements that start with a line-leading `.command`. */
function lexStatements(script: string): { statements: Token[][]; strayFragments: number } {
  const statements: Token[][] = [];
  const stack: string[] = [];
  let current: Token[] | undefined;
  let strayFragments = 0;
  let strayOpen = false;
  let tokens = 0;
  let lineStart = true;
  let index = 0;
  const push = (token: Token) => {
    tokens += 1;
    if (tokens > LIMITS.maxTokens) throw new KqlSchemaError("projection-limit-exceeded");
    if (token.kind === "command" && stack.length === 0) {
      current = [token];
      statements.push(current);
      strayOpen = false;
      if (statements.length > LIMITS.maxStatements) throw new KqlSchemaError("projection-limit-exceeded");
      return;
    }
    if (current) current.push(token);
    else if (!strayOpen) {
      strayFragments += 1;
      strayOpen = true;
    }
  };
  while (index < script.length) {
    const character = script[index];
    if (character === "\n") {
      lineStart = true;
      index += 1;
      continue;
    }
    if (character === " " || character === "\t" || character === "\r" || /\s/u.test(character)) {
      index += 1;
      continue;
    }
    const atLineStart = lineStart;
    lineStart = false;
    if (character === "/" && script[index + 1] === "/") {
      while (index < script.length && script[index] !== "\n") index += 1;
      continue;
    }
    if (script.startsWith("```", index)) {
      const end = script.indexOf("```", index + 3);
      if (end < 0) invalid();
      push({ kind: "opaque" });
      index = end + 3;
      continue;
    }
    if (character === "'" || character === '"') {
      const { value, next } = readQuoted(script, index + 1, character, false);
      push({ kind: "string", value });
      index = next;
      continue;
    }
    if (character === "@" && (script[index + 1] === "'" || script[index + 1] === '"')) {
      const { value, next } = readQuoted(script, index + 2, script[index + 1], true);
      push({ kind: "string", value });
      index = next;
      continue;
    }
    if (character === "." && atLineStart && WORD_START.test(script[index + 1] ?? "")) {
      let end = index + 1;
      while (end < script.length && WORD_PART.test(script[end])) end += 1;
      push({ kind: "command", value: script.slice(index + 1, end).toLowerCase() });
      index = end;
      continue;
    }
    if (WORD_START.test(character)) {
      let end = index;
      while (end < script.length && WORD_PART.test(script[end])) end += 1;
      push({ kind: "word", value: script.slice(index, end) });
      index = end;
      continue;
    }
    if (OPENERS[character]) {
      stack.push(OPENERS[character]);
    } else if (CLOSERS.has(character)) {
      if (stack.pop() !== character) invalid();
    }
    push(
      OPENERS[character] || CLOSERS.has(character) || character === "," || character === ":" || character === "="
        ? { kind: "punct", value: character }
        : { kind: "opaque" },
    );
    index += 1;
  }
  if (stack.length) invalid();
  return { statements, strayFragments };
}

function word(tokens: Token[], index: number): string | undefined {
  const token = tokens[index];
  return token?.kind === "word" ? token.value.toLowerCase() : undefined;
}

function punct(tokens: Token[], index: number, value: string): boolean {
  const token = tokens[index];
  return token?.kind === "punct" && token.value === value;
}

function safeName(value: string): string | undefined {
  const name = value.trim();
  return name &&
    name.length <= LIMITS.maxNameLength &&
    !hasControlCharacter(name) &&
    !isCredentialLikeText(name)
    ? name
    : undefined;
}

/** Plain identifier or `['escaped']` / `["escaped"]` identifier. */
function readName(tokens: Token[], index: number): { name: string; next: number } | undefined {
  const token = tokens[index];
  if (token?.kind === "word") {
    const name = PLAIN_NAME.test(token.value) ? safeName(token.value) : undefined;
    return name ? { name, next: index + 1 } : undefined;
  }
  const inner = tokens[index + 1];
  if (punct(tokens, index, "[") && inner?.kind === "string" && punct(tokens, index + 2, "]")) {
    const name = safeName(inner.value);
    return name ? { name, next: index + 3 } : undefined;
  }
  return undefined;
}

/** Index after the bracket that closes the opener at `index`. */
function skipBalanced(tokens: Token[], index: number): number | undefined {
  const opener = tokens[index];
  if (opener?.kind !== "punct" || !OPENERS[opener.value]) return undefined;
  let depth = 0;
  for (let cursor = index; cursor < tokens.length; cursor += 1) {
    const token = tokens[cursor];
    if (token.kind !== "punct") continue;
    if (OPENERS[token.value]) depth += 1;
    else if (CLOSERS.has(token.value)) {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
  }
  return undefined;
}

/** Skips an optional `with (...)` property bag without reading its values. */
function skipWith(tokens: Token[], index: number): number | undefined {
  if (word(tokens, index) !== "with") return index;
  return punct(tokens, index + 1, "(") ? skipBalanced(tokens, index + 1) : undefined;
}

function scalarType(tokens: Token[], index: number): string | undefined {
  const value = word(tokens, index);
  return value ? SCALAR_TYPES.get(value) : undefined;
}

function readColumns(tokens: Token[], index: number): { columns: KqlSchemaColumn[]; next: number } | undefined {
  if (!punct(tokens, index, "(")) return undefined;
  const columns: KqlSchemaColumn[] = [];
  let cursor = index + 1;
  while (true) {
    const name = readName(tokens, cursor);
    if (!name || !punct(tokens, name.next, ":")) return undefined;
    const dataType = scalarType(tokens, name.next + 1);
    if (!dataType) return undefined;
    columns.push({ name: name.name, dataType });
    cursor = name.next + 2;
    if (punct(tokens, cursor, ",")) {
      cursor += 1;
      continue;
    }
    return punct(tokens, cursor, ")") ? { columns, next: cursor + 1 } : undefined;
  }
}

/** Parameter names and types only; default values are skipped unread. */
function readParameters(tokens: Token[], index: number): { parameters: KqlSchemaColumn[]; next: number } | undefined {
  if (!punct(tokens, index, "(")) return undefined;
  if (punct(tokens, index + 1, ")")) return { parameters: [], next: index + 2 };
  const parameters: KqlSchemaColumn[] = [];
  let cursor = index + 1;
  while (true) {
    const name = readName(tokens, cursor);
    if (!name || !punct(tokens, name.next, ":")) return undefined;
    cursor = name.next + 1;
    let dataType = scalarType(tokens, cursor);
    if (dataType) cursor += 1;
    else if (punct(tokens, cursor, "(")) {
      const next = skipBalanced(tokens, cursor);
      if (next === undefined) return undefined;
      dataType = "tabular";
      cursor = next;
    } else {
      return undefined;
    }
    parameters.push({ name: name.name, dataType });
    if (parameters.length > LIMITS.maxParameters) return undefined;
    if (punct(tokens, cursor, "=")) {
      cursor += 1;
      while (cursor < tokens.length && !punct(tokens, cursor, ",") && !punct(tokens, cursor, ")")) {
        const token = tokens[cursor];
        if (token.kind === "punct" && OPENERS[token.value]) {
          const next = skipBalanced(tokens, cursor);
          if (next === undefined) return undefined;
          cursor = next;
        } else {
          cursor += 1;
        }
      }
    }
    if (punct(tokens, cursor, ",")) {
      cursor += 1;
      continue;
    }
    return punct(tokens, cursor, ")") ? { parameters, next: cursor + 1 } : undefined;
  }
}

type Statement =
  | { kind: "tables"; replace: boolean; tables: KqlSchemaTable[] }
  | { kind: "function"; fn: KqlSchemaFunction }
  | { kind: "view"; view: KqlSchemaMaterializedView }
  | { kind: "ignored" }
  | { kind: "unsupported" };

const IGNORED: Statement = { kind: "ignored" };
const UNSUPPORTED: Statement = { kind: "unsupported" };

function parseTable(tokens: Token[], command: string): Statement {
  const name = readName(tokens, 2);
  if (!name) return UNSUPPORTED;
  if (punct(tokens, name.next, "(") && ["create", "create-merge", "alter", "alter-merge"].includes(command)) {
    const columns = readColumns(tokens, name.next);
    const end = columns && skipWith(tokens, columns.next);
    return columns && end === tokens.length
      ? { kind: "tables", replace: command === "alter", tables: [{ name: name.name, columns: columns.columns }] }
      : UNSUPPORTED;
  }
  return TABLE_SETTINGS.has(word(tokens, name.next) ?? "") ? IGNORED : UNSUPPORTED;
}

function parseTables(tokens: Token[]): Statement {
  const tables: KqlSchemaTable[] = [];
  let cursor = 2;
  while (true) {
    const name = readName(tokens, cursor);
    const columns = name && readColumns(tokens, name.next);
    if (!name || !columns) return UNSUPPORTED;
    tables.push({ name: name.name, columns: columns.columns });
    cursor = columns.next;
    if (punct(tokens, cursor, ",")) {
      cursor += 1;
      continue;
    }
    return skipWith(tokens, cursor) === tokens.length ? { kind: "tables", replace: false, tables } : UNSUPPORTED;
  }
}

function parseFunction(tokens: Token[], command: string): Statement {
  let cursor = 2;
  if (command === "create" && word(tokens, cursor) === "ifnotexists") cursor += 1;
  const afterWith = skipWith(tokens, cursor);
  const name = afterWith === undefined ? undefined : readName(tokens, afterWith);
  if (!name) return UNSUPPORTED;
  if (command === "alter" && afterWith === cursor && FUNCTION_SETTINGS.has(word(tokens, name.next) ?? "")) {
    return IGNORED;
  }
  const parameters = readParameters(tokens, name.next);
  if (!parameters || !punct(tokens, parameters.next, "{")) return UNSUPPORTED;
  return skipBalanced(tokens, parameters.next) === tokens.length
    ? { kind: "function", fn: { name: name.name, parameters: parameters.parameters } }
    : UNSUPPORTED;
}

function parseView(tokens: Token[], command: string, start: number): Statement {
  const afterWith = skipWith(tokens, start);
  const name = afterWith === undefined ? undefined : readName(tokens, afterWith);
  if (!name) return UNSUPPORTED;
  if (word(tokens, name.next) !== "on") {
    return command !== "create" && afterWith === start && VIEW_SETTINGS.has(word(tokens, name.next) ?? "")
      ? IGNORED
      : UNSUPPORTED;
  }
  if (command === "alter-merge") return UNSUPPORTED;
  const sourceKind = word(tokens, name.next + 1);
  const source = readName(tokens, name.next + 2);
  if ((sourceKind !== "table" && sourceKind !== "materialized-view") || !source) return UNSUPPORTED;
  if (!punct(tokens, source.next, "{") || skipBalanced(tokens, source.next) !== tokens.length) return UNSUPPORTED;
  return {
    kind: "view",
    view: sourceKind === "table" ? { name: name.name, sourceTable: source.name } : { name: name.name },
  };
}

function parseStatement(tokens: Token[]): Statement {
  const command = (tokens[0] as { value: string }).value;
  const object = word(tokens, 1);
  if (object === "table") {
    return ["create", "create-merge", "alter", "alter-merge", "create-or-alter", "delete"].includes(command)
      ? parseTable(tokens, command)
      : command === "add"
        ? IGNORED
        : UNSUPPORTED;
  }
  if (object === "tables") {
    return command === "create" || command === "create-merge" ? parseTables(tokens) : UNSUPPORTED;
  }
  if (object === "function") {
    if (command === "add") return IGNORED;
    return ["create", "create-or-alter", "alter"].includes(command) ? parseFunction(tokens, command) : UNSUPPORTED;
  }
  let modifier = 1;
  while (word(tokens, modifier) === "async" || word(tokens, modifier) === "ifnotexists") modifier += 1;
  if (word(tokens, modifier) === "materialized-view") {
    if (command === "add") return IGNORED;
    return ["create", "create-or-alter", "alter", "alter-merge"].includes(command) &&
      (modifier === 1 || command === "create")
      ? parseView(tokens, command, modifier + 1)
      : UNSUPPORTED;
  }
  if (object === "database") {
    // Database policies, settings and principals are non-structural and never read.
    return ["alter", "alter-merge", "delete", "add"].includes(command) ? IGNORED : UNSUPPORTED;
  }
  // External tables carry connection strings; data, drop, rename and execute commands are unsupported.
  return UNSUPPORTED;
}

function byName<T extends { name: string }>(left: T, right: T): number {
  const a = left.name.toLowerCase();
  const b = right.name.toLowerCase();
  return a < b ? -1 : a > b ? 1 : left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}

/** Parses structural declarations from a decoded `DatabaseSchema.kql` script. */
export function parseKqlDatabaseSchema(script: string): KqlSchemaProjection {
  if (script.length > LIMITS.maxDecodedBytes) throw new KqlSchemaError("response-size-exceeded");
  const { statements, strayFragments } = lexStatements(script);
  const tables = new Map<string, Map<string, string>>();
  const functions = new Map<string, KqlSchemaFunction>();
  const views = new Map<string, KqlSchemaMaterializedView>();
  let ignoredStatements = 0;
  let unsupportedStatements = strayFragments;
  let truncated = false;

  for (const tokens of statements) {
    const statement = parseStatement(tokens);
    if (statement.kind === "ignored") {
      ignoredStatements += 1;
    } else if (statement.kind === "unsupported") {
      unsupportedStatements += 1;
    } else if (statement.kind === "function") {
      if (!functions.has(statement.fn.name) && functions.size >= LIMITS.maxFunctions) truncated = true;
      else functions.set(statement.fn.name, statement.fn);
    } else if (statement.kind === "view") {
      if (!views.has(statement.view.name) && views.size >= LIMITS.maxMaterializedViews) truncated = true;
      else views.set(statement.view.name, statement.view);
    } else {
      let conflict = false;
      for (const table of statement.tables) {
        let columns = tables.get(table.name);
        if (!columns) {
          if (tables.size >= LIMITS.maxTables) {
            truncated = true;
            continue;
          }
          columns = new Map();
          tables.set(table.name, columns);
        }
        if (statement.replace) columns.clear();
        for (const column of table.columns) {
          const existing = columns.get(column.name);
          if (existing && existing !== column.dataType) conflict = true;
          else if (!existing && columns.size >= LIMITS.maxColumnsPerTable) truncated = true;
          else columns.set(column.name, column.dataType);
        }
      }
      if (conflict) unsupportedStatements += 1;
    }
  }

  return {
    tables: [...tables.entries()]
      .map(([name, columns]) => ({
        name,
        columns: [...columns.entries()].map(([columnName, dataType]) => ({ name: columnName, dataType })),
      }))
      .sort(byName),
    functions: [...functions.values()].sort(byName),
    materializedViews: [...views.values()].sort(byName),
    ignoredStatements,
    unsupportedStatements,
    truncated,
  };
}
