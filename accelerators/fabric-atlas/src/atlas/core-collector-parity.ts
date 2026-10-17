// This contract is comparison-only. It cannot authorize snapshot publication.
export const CORE_EXCLUDED_SECTIONS = [
  "scanner",
  "schema",
  "lineage",
  "access",
  "config",
  "definitions",
  "kqlSchema",
  "sqlSchema",
] as const;

export const CORE_EXCLUDED_CAPABILITIES = [
  "endorsement",
  "sensitivity",
  "tags",
  "ownership",
  "definitionEnrichment",
  "kqlSchema",
  "sqlSchema",
  "objectLineage",
] as const;

const REQUIRED_SECTIONS = ["workspace", "items", "roleAssignments"] as const;
const SECTION_NAMES = [...REQUIRED_SECTIONS, "jobs", ...CORE_EXCLUDED_SECTIONS] as const;
const NOT_COLLECTED_CODES = ["collector-not-migrated", "not-collected"] as const;
const EMPTY_ARRAYS = ["lineage", "access", "config", "objectEdges"] as const;
const EMPTY_OBJECTS = ["schema", "artifactMetadata"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT_LENGTH = 16_384;

export interface CoreCollectionStatus {
  status: "complete" | "unsupported" | "failed";
  code?: string;
}

export interface CoreWorkspace {
  id: string;
  displayName?: string;
  description?: string;
  type?: string;
  capacityId?: string;
  capacityRegion?: string;
}

export interface CoreItem {
  id: string;
  type: string;
  displayName?: string;
  description?: string;
  workspaceId?: string;
  folderId?: string;
}

export interface CoreRoleAssignment {
  role: string;
  principal: {
    id: string;
    displayName?: string;
    type?: string;
    userType?: string;
    userDetails?: {
      userPrincipalName?: string;
      userType?: string;
    };
  };
}

export interface CoreJob {
  itemId: string;
  id?: string;
  jobType: string;
  status: string;
  itemDisplayName?: string;
  itemType?: string;
  invokeType?: string;
  startTimeUtc?: string;
  endTimeUtc?: string;
  createdTimeUtc?: string;
  lastUpdatedTimeUtc?: string;
}

export interface CoreCollectorEnvelope {
  schemaVersion: 2;
  syncMode: "base";
  correlationId?: string;
  workspace: CoreWorkspace;
  items: CoreItem[];
  roleAssignments: CoreRoleAssignment[];
  jobs: CoreJob[];
  sections: Record<(typeof SECTION_NAMES)[number], CoreCollectionStatus>;
  capabilities: Record<(typeof CORE_EXCLUDED_CAPABILITIES)[number], CoreCollectionStatus>;
  errors: string[];
  syncedAt: string;
  lineage: [];
  access: [];
  config: [];
  objectEdges: [];
  schema: Record<string, never>;
  artifactMetadata: Record<string, never>;
  itemMetadata: Record<string, { scannerMatched: false; ownerAvailable: false }>;
}

type RecordValue = Record<string, unknown>;
type Scalar = string | boolean | null;
type Row = Record<string, Scalar>;
type Rows = Map<string, Row[]>;
type Collection = "workspace" | "items" | "roleAssignments" | "jobs" |
  "sections" | "capabilities" | "itemMetadata";

const WORKSPACE_FIELDS = ["id", "displayName", "type", "capacityId", "capacityRegion"] as const;
const ITEM_FIELDS = ["id", "type", "displayName", "workspaceId", "folderId"] as const;
const PRINCIPAL_FIELDS = ["id", "displayName", "type", "userType"] as const;
const USER_FIELDS = ["userPrincipalName", "userType"] as const;
const JOB_TIMESTAMPS = ["startTimeUtc", "endTimeUtc", "createdTimeUtc", "lastUpdatedTimeUtc"] as const;
const JOB_FIELDS = ["itemId", "id", "jobType", "status", "itemDisplayName", "itemType", "invokeType", ...JOB_TIMESTAMPS] as const;
const METADATA_FIELDS = ["scannerMatched", "ownerAvailable"] as const;
const ENVELOPE_FIELDS = [
  "schemaVersion", "syncMode", "correlationId", "workspace", "items",
  "roleAssignments", "jobs", "sections", "capabilities", "errors", "syncedAt",
  "itemMetadata", ...EMPTY_ARRAYS, ...EMPTY_OBJECTS, "objectLineage",
] as const;

function invalid(reason: string): never {
  // Reasons are fixed strings, never interpolated upstream data.
  throw new Error(`Invalid Core parity input: ${reason}.`);
}

function record(value: unknown): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("expected-object");
  }
  return value as RecordValue;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid("expected-array");
  return value;
}

function onlyKeys(value: RecordValue, keys: readonly string[]): void {
  if (Object.keys(value).some((key) => !keys.includes(key) || value[key] === null)) {
    invalid("unexpected-field");
  }
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_TEXT_LENGTH) {
    invalid("invalid-text");
  }
  return value.trim();
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid("invalid-uuid");
  return value.toLowerCase();
}

function identity(value: unknown): string {
  const result = text(value);
  return UUID.test(result) ? result.toLowerCase() : result;
}

function timestamp(value: unknown): string {
  const input = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:?\d{2})?$/i.exec(input);
  if (!match) invalid("invalid-timestamp");
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(year) < 100 || Number(month) < 1 || Number(month) > 12 ||
    Number(day) < 1 || Number(day) > daysInMonth || Number(hour) > 23 ||
    Number(minute) > 59 || Number(second) > 59) {
    invalid("invalid-timestamp");
  }
  if (zone && zone.toUpperCase() !== "Z") {
    const offset = zone.replace(":", "");
    if (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(3, 5)) > 59) {
      invalid("invalid-timestamp");
    }
  }
  // Fabric timestamps without a zone are UTC, never the browser's local time.
  const normalized = `${year}-${month}-${day}T${hour}:${minute}:${second}.${(fraction ?? "").padEnd(3, "0").slice(0, 3)}${zone ?? "Z"}`;
  const date = new Date(normalized);
  if (!Number.isFinite(date.valueOf())) invalid("invalid-timestamp");
  return date.toISOString();
}

function fields(
  value: RecordValue,
  names: readonly string[],
  identities: readonly string[] = [],
  timestamps: readonly string[] = [],
): Row {
  return Object.fromEntries(names.map((name) => {
    const raw = value[name];
    return [
      name,
      raw == null ? null :
        identities.includes(name) ? identity(raw) :
          timestamps.includes(name) ? timestamp(raw) : text(raw),
    ];
  }));
}

function status(value: unknown, strict: boolean): Row {
  const entry = record(value);
  if (strict) onlyKeys(entry, ["status", "code"]);
  if (entry.status !== "complete" && entry.status !== "unsupported" && entry.status !== "failed") {
    invalid("invalid-status");
  }
  if (entry.code != null &&
    (typeof entry.code !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(entry.code))) {
    invalid("invalid-status-code");
  }
  return { status: entry.status, code: (entry.code as string | undefined) ?? null };
}

function add(rows: Rows, key: string, row: Row, unique = false): void {
  const existing = rows.get(key);
  if (unique && existing) invalid("duplicate-identity");
  if (existing) existing.push(row);
  else rows.set(key, [row]);
}

interface Projection {
  workspace: Rows;
  items: Rows;
  roleAssignments: Rows;
  jobs: Rows;
  sections: Rows;
  capabilities: Rows;
  itemMetadata: Rows;
}

function project(raw: unknown, coreOnly: boolean): Projection {
  const input = record(raw);
  if (input.schemaVersion !== 2 ||
    (input.syncMode !== "base" && (coreOnly || input.syncMode !== "complete"))) {
    invalid("invalid-stage");
  }
  if (coreOnly) {
    onlyKeys(input, ENVELOPE_FIELDS);
    if (input.correlationId !== undefined) uuid(input.correlationId);
  }
  timestamp(input.syncedAt);
  const workspace = record(input.workspace);
  if (coreOnly) {
    onlyKeys(workspace, [...WORKSPACE_FIELDS, "description"]);
    if (workspace.description !== undefined) text(workspace.description);
  }
  const workspaceId = uuid(workspace.id);
  const workspaceRow = fields(workspace, WORKSPACE_FIELDS, ["id", "capacityId"]);
  const result: Projection = {
    workspace: new Map([["workspace", [workspaceRow]]]),
    items: new Map(),
    roleAssignments: new Map(),
    jobs: new Map(),
    sections: new Map(),
    capabilities: new Map(),
    itemMetadata: new Map(),
  };

  for (const rawItem of array(input.items)) {
    const item = record(rawItem);
    if (coreOnly) {
      onlyKeys(item, [...ITEM_FIELDS, "description"]);
      if (item.description !== undefined) text(item.description);
    }
    const id = uuid(item.id);
    const itemType = text(item.type);
    if (itemType.toLowerCase() === "item") invalid("placeholder-item-type");
    const row = fields(item, ITEM_FIELDS, ["id", "workspaceId", "folderId"]);
    if (row.workspaceId !== null && row.workspaceId !== workspaceId) {
      invalid("foreign-item-workspace");
    }
    add(result.items, id, row, true);
  }
  for (const rawAssignment of array(input.roleAssignments)) {
    const assignment = record(rawAssignment);
    const principal = record(assignment.principal);
    const details = principal.userDetails == null ? {} : record(principal.userDetails);
    if (coreOnly) {
      onlyKeys(assignment, ["role", "principal"]);
      onlyKeys(principal, [...PRINCIPAL_FIELDS, "userDetails"]);
      onlyKeys(details, USER_FIELDS);
    }
    const role = text(assignment.role);
    const principalId = identity(principal.id);
    const row: Row = { role };
    for (const [name, value] of Object.entries(fields(principal, PRINCIPAL_FIELDS))) {
      row[`principal.${name}`] = name === "id" ? principalId : value;
    }
    for (const [name, value] of Object.entries(fields(details, USER_FIELDS))) {
      row[`principal.userDetails.${name}`] = value;
    }
    add(result.roleAssignments, JSON.stringify([principalId, role]), row);
  }
  for (const rawJob of array(input.jobs)) {
    const job = record(rawJob);
    if (coreOnly) onlyKeys(job, JOB_FIELDS);
    const itemId = uuid(job.itemId);
    if (!result.items.has(itemId)) invalid("foreign-job-item");
    text(job.jobType);
    text(job.status);
    const row = fields(job, JOB_FIELDS, ["itemId"], JOB_TIMESTAMPS);
    row.id = job.id == null ? null : identity(job.id);
    const key = row.id !== null ?
      JSON.stringify([itemId, "id", row.id]) :
      JSON.stringify([itemId, "fallback", row.jobType, row.invokeType, row.startTimeUtc, row.createdTimeUtc]);
    add(result.jobs, key, row, row.id !== null);
  }

  const sections = record(input.sections);
  const capabilities = record(input.capabilities);
  if (coreOnly) {
    onlyKeys(sections, SECTION_NAMES);
    onlyKeys(capabilities, CORE_EXCLUDED_CAPABILITIES);
  }
  for (const name of SECTION_NAMES) {
    const row = status(sections[name], coreOnly);
    if (REQUIRED_SECTIONS.includes(name as (typeof REQUIRED_SECTIONS)[number]) &&
      (row.status !== "complete" || row.code !== null)) invalid("incomplete-core-section");
    result.sections.set(name, [row]);
  }
  for (const name of CORE_EXCLUDED_CAPABILITIES) {
    result.capabilities.set(name, [status(capabilities[name], coreOnly)]);
  }
  const metadataById = record(input.itemMetadata);
  for (const [rawId, rawMetadata] of Object.entries(metadataById)) {
    const id = uuid(rawId);
    if (!result.items.has(id)) invalid("foreign-item-metadata");
    const metadata = record(rawMetadata);
    if (coreOnly) onlyKeys(metadata, METADATA_FIELDS);
    const row: Row = {};
    for (const name of METADATA_FIELDS) {
      if (typeof metadata[name] !== "boolean" || (coreOnly && metadata[name] !== false)) {
        invalid("invalid-item-metadata");
      }
      row[name] = metadata[name];
    }
    add(result.itemMetadata, id, row, true);
  }
  if (result.itemMetadata.size !== result.items.size) invalid("missing-item-metadata");
  const errors = array(input.errors);
  if (errors.some((entry) => typeof entry !== "string" || entry.length > MAX_TEXT_LENGTH)) {
    invalid("invalid-errors");
  }

  if (coreOnly) {
    for (const [names, rows] of [
      [CORE_EXCLUDED_SECTIONS, result.sections],
      [CORE_EXCLUDED_CAPABILITIES, result.capabilities],
    ] as const) {
      for (const name of names) {
        const coverage = rows.get(name)![0];
        if (coverage.status !== "unsupported" ||
          !NOT_COLLECTED_CODES.includes(coverage.code as (typeof NOT_COLLECTED_CODES)[number])) {
          invalid("false-advanced-coverage");
        }
      }
    }
    for (const name of EMPTY_ARRAYS) {
      if (array(input[name]).length !== 0) invalid("advanced-data-present");
    }
    if (input.objectLineage !== undefined && array(input.objectLineage).length !== 0) {
      invalid("advanced-data-present");
    }
    for (const name of EMPTY_OBJECTS) {
      if (Object.keys(record(input[name])).length !== 0) invalid("advanced-data-present");
    }
    const jobsStatus = result.sections.get("jobs")![0];
    if (jobsStatus.status !== "complete" && jobsStatus.code === null) {
      invalid("missing-jobs-status-code");
    }
    if (jobsStatus.status === "unsupported" && result.jobs.size !== 0) {
      invalid("unsupported-jobs-present");
    }
    for (const error of errors as string[]) {
      const match = /^([a-zA-Z]+): ([a-z][a-z0-9-]{0,79})$/.exec(error);
      if (!match) invalid("invalid-errors");
      const [, source, code] = match;
      const sourceStatus = result.sections.get(source)?.[0];
      if (!sourceStatus || sourceStatus.status === "complete" ||
        (source !== "jobs" && sourceStatus.code !== code)) {
        invalid("contradictory-errors");
      }
    }
  }
  return result;
}

export function validateCoreCollectorEnvelope(
  raw: unknown,
  expectedWorkspaceId?: string,
): asserts raw is CoreCollectorEnvelope {
  const projection = project(raw, true);
  if (expectedWorkspaceId !== undefined &&
    projection.workspace.get("workspace")![0].id !== uuid(expectedWorkspaceId)) {
    invalid("different-workspace");
  }
}

export const CORE_PARITY_MAX_DISCREPANCIES = 100;
export const CORE_PARITY_MAX_REPORT_TEXT = 160;

export interface CoreParityDiscrepancy {
  scope: "core" | "coverage";
  collection: Collection;
  identity: string;
  kind: "missing-in-rayfin" | "missing-in-python" | "count-mismatch" | "value-mismatch";
  field?: string;
  rayfinCount?: number;
  pythonCount?: number;
}

export interface CoreParityReport {
  authoritative: false;
  equal: boolean;
  coreEqual: boolean;
  coverageEqual: boolean;
  discrepancyCount: number;
  truncated: boolean;
  counts: {
    rayfin: { items: number; roleAssignments: number; jobs: number };
    python: { items: number; roleAssignments: number; jobs: number };
  };
  discrepancies: CoreParityDiscrepancy[];
}

function sortText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function signature(row: Row): string {
  return JSON.stringify(Object.keys(row).sort(sortText).map((key) => [key, row[key]]));
}

function unmatched(left: Row[], right: Row[]): [Row[], Row[]] {
  const remaining = new Map<string, Row[]>();
  for (const row of right) {
    const key = signature(row);
    const rows = remaining.get(key) ?? [];
    rows.push(row);
    remaining.set(key, rows);
  }
  const leftRemaining = left.filter((row) => {
    const matches = remaining.get(signature(row));
    if (matches?.length) {
      matches.pop();
      return false;
    }
    return true;
  });
  const bySignature = (a: Row, b: Row) => sortText(signature(a), signature(b));
  return [leftRemaining.sort(bySignature), [...remaining.values()].flat().sort(bySignature)];
}

function reportIdentity(collection: Collection, key: string, index: number): string {
  // Never expose role names, fallback IDs, job tuple values, or upstream text.
  if (collection === "roleAssignments" || collection === "jobs") {
    const tuple = JSON.parse(key) as string[];
    const prefix = UUID.test(tuple[0]) ? `${tuple[0]}/` : "";
    return `${prefix}${collection === "jobs" ? "job" : "role"}-${index + 1}`;
  }
  return key;
}

/**
 * Compares actual coverage as well as Core fields. Expected migration gaps stay
 * visible in coverageEqual; neither equality flag is a publication decision.
 * Reports contain field names and UUID/ordinal identities, never source values.
 */
export function compareCoreCollectorParity(
  rayfinEnvelope: unknown,
  pythonUdfEnvelope: unknown,
  options: { maxDiscrepancies?: number } = {},
): CoreParityReport {
  const rayfin = project(rayfinEnvelope, true);
  const python = project(pythonUdfEnvelope, false);
  const requestedLimit = options.maxDiscrepancies ?? 50;
  const limit = Number.isFinite(requestedLimit) ?
    Math.max(1, Math.min(CORE_PARITY_MAX_DISCREPANCIES, Math.floor(requestedLimit))) : 50;
  const counts = (projection: Projection) => ({
    items: projection.items.size,
    roleAssignments: [...projection.roleAssignments.values()].reduce((sum, rows) => sum + rows.length, 0),
    jobs: [...projection.jobs.values()].reduce((sum, rows) => sum + rows.length, 0),
  });
  const report: CoreParityReport = {
    authoritative: false,
    equal: true,
    coreEqual: true,
    coverageEqual: true,
    discrepancyCount: 0,
    truncated: false,
    counts: { rayfin: counts(rayfin), python: counts(python) },
    discrepancies: [],
  };
  const addDiscrepancy = (entry: CoreParityDiscrepancy) => {
    report.equal = false;
    if (entry.scope === "core") report.coreEqual = false;
    else report.coverageEqual = false;
    report.discrepancyCount++;
    if (report.discrepancies.length < limit) {
      report.discrepancies.push({
        ...entry,
        identity: entry.identity.slice(0, CORE_PARITY_MAX_REPORT_TEXT),
      });
    }
  };
  for (const collection of Object.keys(rayfin) as Collection[]) {
    const left = rayfin[collection];
    const right = python[collection];
    const keys = [...new Set([...left.keys(), ...right.keys()])].sort(sortText);
    keys.forEach((key, index) => {
      const coverage = collection === "capabilities" || collection === "itemMetadata" ||
        (collection === "sections" && CORE_EXCLUDED_SECTIONS.includes(key as (typeof CORE_EXCLUDED_SECTIONS)[number]));
      const base = {
        scope: coverage ? "coverage" as const : "core" as const,
        collection,
        identity: reportIdentity(collection, key, index),
      };
      const leftRows = left.get(key) ?? [];
      const rightRows = right.get(key) ?? [];
      if (leftRows.length !== rightRows.length) {
        addDiscrepancy({
          ...base,
          kind: !leftRows.length ? "missing-in-rayfin" : !rightRows.length ? "missing-in-python" : "count-mismatch",
          rayfinCount: leftRows.length,
          pythonCount: rightRows.length,
        });
      }
      const [leftRemaining, rightRemaining] = unmatched(leftRows, rightRows);
      for (let rowIndex = 0; rowIndex < Math.min(leftRemaining.length, rightRemaining.length); rowIndex++) {
        const leftRow = leftRemaining[rowIndex];
        const rightRow = rightRemaining[rowIndex];
        for (const field of Object.keys(leftRow).sort(sortText)) {
          if (leftRow[field] !== rightRow[field]) {
            addDiscrepancy({ ...base, kind: "value-mismatch", field });
          }
        }
      }
    });
  }
  report.truncated = report.discrepancyCount > report.discrepancies.length;
  return report;
}
