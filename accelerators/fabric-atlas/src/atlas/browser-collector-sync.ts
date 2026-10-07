import { getRayfinClient } from "@/lib/rayfin-client";
import type { AppFunctionsSchema } from "../../rayfin/functions/src/types";
import {
  assertSyncActive, createCompatibilityInvoker, invokeSyncAll, mergeSyncEnrichment,
  validateRawSync, type CompatibilityCollector, type CompatibilityPlan, type RawSync, type SyncIdentity,
} from "./live-sync";
import { validateCoreCollectorEnvelope } from "./core-collector-parity";
import {
  createItemRelationsEvidence,
  parseItemRelationsEvidence,
  type ItemRelationsEvidence,
} from "./item-relations-evidence";
import { sourceProvenanceSnapshot } from "./source-provenance-snapshot";

type Name = "workspaceCollectCore" | "workspaceCollectDefinitions" | "workspaceCollectItemRelations"
  | "workspaceCollectKqlMetadata" | "workspaceCollectSqlMetadata" | "workspaceCollectPowerBi"
  | "workspaceCollectSourceProvenance";
export type BrowserCollectorClient = {
  functions: { [N in Name]: {
    invoke(input: AppFunctionsSchema[N]["input"], options?: { timeoutMs?: number }): Promise<AppFunctionsSchema[N]["output"]>;
  } };
};
type Status = { status?: "complete" | "unsupported" | "failed"; code?: string };
type Item = { id: string; type: string };
type ItemRelationsStopReason = NonNullable<
  AppFunctionsSchema["workspaceCollectItemRelations"]["output"]["stopReason"]
>;
export interface ItemRelationsCollection {
  evidence: ItemRelationsEvidence;
  sampledItemCount: number;
  workspaceItemCount: number;
  stopReasons: ItemRelationsStopReason[];
}
export interface BrowserCollectorResult {
  raw: RawSync;
  summary: string;
  itemRelationsCollection?: ItemRelationsCollection;
}
export interface BrowserCollectorDependencies {
  client?: BrowserCollectorClient;
  mode?: "rayfin" | "python";
  compatibility?: (plan: CompatibilityPlan) => Promise<RawSync>;
  legacy?: () => Promise<RawSync>;
  timeoutMs?: number;
  maxCalls?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}
const COLLECTOR_BATCH_SIZE = 4;
const COMPATIBILITY_BATCH_SIZE = 4;
const DEFINITIONS = new Set(["Ontology", "GraphModel", "DataAgent"]);
const SQL = new Set([
  "SQLDatabase",
  "Warehouse",
  "Lakehouse",
  "MirroredDatabase",
  "SQLEndpoint",
]);
const KQL = new Set(["Eventhouse", "KQLDatabase", "KQLQueryset", "KQLDashboard"]);
const PROVENANCE = new Set(["Lakehouse", "Warehouse", "KQLDatabase", "MirroredDatabase"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STOP = new Set(["deadline-exhausted", "request-timeout", "cancelled", "response-size-exceeded", "request-budget-exhausted"]);
const SOURCE_SECTION = "Collector capability";
const RETAINED_PYTHON_COLLECTORS = new Set<CompatibilityCollector>(["kqlDataPlane", "reportPages"]);

/** Rollback changes collection only, not the existing writer or authorization gate. */
export function pythonCollectorRollbackEnabled(): boolean {
  return ["true", "1", "yes", "on"].includes((import.meta.env.VITE_ATLAS_COLLECTOR_ROLLBACK ?? "").trim().toLowerCase());
}
function fail(): never {
  throw new Error("Collector metadata was incomplete or invalid. The previous snapshot was preserved.");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
function status(value: unknown): Status {
  const raw = record(value);
  if (!["complete", "unsupported", "failed"].includes(String(raw.status)) ||
    (raw.code !== undefined && (typeof raw.code !== "string" || !/^[a-z0-9-]{1,80}$/.test(raw.code)))) fail();
  if (raw.status !== "complete" && !raw.code) fail();
  return raw as Status;
}
function successful(value: Status): boolean {
  status(value);
  if (value.code && STOP.has(value.code)) fail();
  return value.status === "complete" && !/truncated|partial-unsupported/.test(value.code ?? "");
}
function validateStage(
  envelope: { contractVersion: number; stage: string; authoritative: false; workspaceId: string; correlationId?: string; items: Item[] },
  stage: string, workspaceId: string, correlationId: string, requested: Item[],
): void {
  if (envelope.contractVersion !== 1 || envelope.stage !== stage || envelope.authoritative !== false ||
    envelope.workspaceId !== workspaceId || envelope.correlationId !== correlationId || !Array.isArray(envelope.items)) fail();
  const expected = new Map(requested.map((item) => [item.id, item.type]));
  const seen = new Set<string>();
  for (const item of envelope.items) {
    if (!item || seen.has(item.id) || expected.get(item.id) !== item.type) fail();
    const descriptor = item as unknown as Record<string, unknown>;
    if (descriptor.status !== undefined) status(descriptor);
    for (const value of Object.values(descriptor)) {
      if (value && typeof value === "object" && !Array.isArray(value) && "status" in value) status(value);
    }
    seen.add(item.id);
  }
  if (seen.size !== expected.size) fail();
  const data = envelope as unknown as Record<string, unknown>;
  for (const field of ["schema", "schemas", "artifactMetadata", "models", "reports", "itemMetadata"]) {
    if (data[field] !== undefined && Object.keys(record(data[field])).some((id) => !expected.has(id))) fail();
  }
  for (const entry of Array.isArray(data.config) ? data.config : []) {
    if (!expected.has(String(record(entry).itemId))) fail();
  }
}
async function bounded<T>(operation: () => Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  assertSyncActive(signal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Collector invocation exceeded its browser deadline. The previous snapshot was preserved.")), timeoutMs);
        abort = () => reject(new Error("Synchronization cancelled."));
        signal?.addEventListener("abort", abort, { once: true });
      }),
    ]);
    assertSyncActive(signal);
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 26 * 1024 * 1024) fail();
    return result;
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}
function retryableCollectorFailure(error: unknown): boolean {
  const statusCode = Number((error as { status?: unknown } | null)?.status);
  if ([408, 429, 500, 502, 503, 504].includes(statusCode)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /abort|network|fetch|gateway|rate.?limit|temporar|timeout|timed out/i.test(message);
}
function stoppedCollectorEnvelope(value: unknown, depth = 0): boolean {
  if (depth > 8 || value == null) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => stoppedCollectorEnvelope(entry, depth + 1));
  }
  if (typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  if (typeof data.code === "string" && STOP.has(data.code)) return true;
  return Object.values(data).some((entry) =>
    stoppedCollectorEnvelope(entry, depth + 1),
  );
}
function collectorRetryDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Synchronization cancelled."));
      return;
    }
    const done = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = window.setTimeout(done, milliseconds);
    const cancel = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(new Error("Synchronization cancelled."));
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

/** Browser-serialized composition; Phase 2 scheduling/claims/publication are deliberately not used. */
export async function collectBrowserWorkspace(
  workspaceId: string, identity: SyncIdentity, correlationId: string,
  progress?: (percent: number, stage: string) => void, signal?: AbortSignal,
  dependencies: BrowserCollectorDependencies = {},
): Promise<BrowserCollectorResult> {
  if (!UUID.test(workspaceId) || !UUID.test(correlationId)) fail();
  const legacy = dependencies.legacy ?? (() => invokeSyncAll(workspaceId, identity, progress, signal, correlationId));
  if ((dependencies.mode ?? (pythonCollectorRollbackEnabled() ? "python" : "rayfin")) === "python") {
    const raw = await legacy();
    validateRawSync(raw, workspaceId);
    return { raw: { ...raw, collectorSources: { core: { source: "python-rollback", code: "explicit-rollback" } } }, summary: "Collectors: Python rollback (explicit flag)" };
  }
  const client = dependencies.client ?? getRayfinClient() as unknown as BrowserCollectorClient;
  const timeout = dependencies.timeoutMs ?? 180_000;
  let calls = 0;
  const call = async <N extends Name>(name: N, input: AppFunctionsSchema[N]["input"]): Promise<AppFunctionsSchema[N]["output"]> => {
    if (++calls > (dependencies.maxCalls ?? 2_048)) fail();
    const invoke = client.functions[name]?.invoke as (
      input: AppFunctionsSchema[N]["input"], options: { timeoutMs: number },
    ) => Promise<AppFunctionsSchema[N]["output"]>;
    if (!invoke) throw new Error("Required Rayfin collector is not deployed. Use the explicit Python rollback flag.");
    const maxAttempts = dependencies.maxAttempts ?? 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const result = await bounded(
          () => invoke.call(client.functions[name], input, { timeoutMs: timeout }),
          timeout + Math.min(5_000, Math.max(50, timeout / 10)),
          signal,
        );
        if (!stoppedCollectorEnvelope(result) || attempt + 1 >= maxAttempts) {
          return result;
        }
      } catch (error) {
        if (
          !retryableCollectorFailure(error) ||
          attempt + 1 >= maxAttempts
        ) {
          throw error;
        }
      }
      await collectorRetryDelay(
        (dependencies.retryDelayMs ?? 750) * 2 ** attempt,
        signal,
      );
    }
    throw new Error(`${name} collector did not complete.`);
  };
  const compatibility = dependencies.compatibility ?? createCompatibilityInvoker(workspaceId, identity, correlationId, signal);
  const sources: NonNullable<RawSync["collectorSources"]> = { core: { source: "rayfin" } };
  const plans = new Map<string, { id: string; type: string; collectors: CompatibilityCollector[] }>();
  const fallback = (item: Item, collector: CompatibilityCollector, code: string) => {
    if (!RETAINED_PYTHON_COLLECTORS.has(collector) || !/^[a-z0-9-]{1,80}$/.test(code)) fail();
    const current = plans.get(item.id) ?? { id: item.id, type: item.type, collectors: [] };
    if (!current.collectors.includes(collector)) current.collectors.push(collector);
    plans.set(item.id, current);
    sources[`${collector}:${item.id}`] = { source: "python-compatibility", code };
  };
  const active = (item: Item, collector: string) => {
    sources[`${collector}:${item.id}`] = { source: "rayfin" };
  };
  progress?.(5, "Collecting Fabric Core through Rayfin");
  const core = await call("workspaceCollectCore", { protocolVersion: 1, workspaceId, correlationId });
  validateCoreCollectorEnvelope(core, workspaceId);
  if (core.correlationId !== correlationId) fail();
  const items: Item[] = core.items.map((item) => ({ id: item.id, type: item.type }));
  const known = new Set(items.map((item) => item.id));
  const withoutPlaceholders = (values: RawSync["sections"]) =>
    Object.fromEntries(Object.entries(values ?? {}).filter(([, value]) => value.code !== "collector-not-migrated"));
  let raw: RawSync = {
    ...core, syncMode: "complete",
    workspace: { ...core.workspace },
    items: core.items.map((item) => ({ ...item })),
    roleAssignments: core.roleAssignments.map((entry) => ({ ...entry })),
    jobs: core.jobs.map((entry) => ({ ...entry })),
    sections: { ...withoutPlaceholders(core.sections),
      schema: { status: "complete" }, config: { status: "complete" } },
    capabilities: { ...withoutPlaceholders(core.capabilities),
      objectLineage: { status: "complete", code: "static-resolved-subset" } },
    errors: core.errors.filter((error) => error.startsWith("jobs:")),
  };
  const merge = (incoming: RawSync) => {
    for (const id of Object.keys(incoming.schema ?? {})) if (!known.has(id)) fail();
    for (const id of Object.keys(incoming.artifactMetadata ?? {})) if (!known.has(id)) fail();
    raw = mergeSyncEnrichment(raw, incoming);
    if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > 26 * 1024 * 1024) fail();
  };
  const schemaFallbackIds: string[] = [];
  const knownStorageSchemas = new Set<string>();
  const partialStorageSchemas = new Set<string>();
  for (
    let offset = 0;
    offset < items.length;
    offset += COLLECTOR_BATCH_SIZE
  ) {
    assertSyncActive(signal);
    const batch = items.slice(offset, offset + COLLECTOR_BATCH_SIZE);
    progress?.(12 + Math.floor(offset / Math.max(1, items.length) * 35), `Collecting Rayfin metadata (${offset}/${items.length})`);
    const provenance = batch.filter((item) => PROVENANCE.has(item.type));
    if (provenance.length) {
      const result = await call("workspaceCollectSourceProvenance", { protocolVersion: 1, workspaceId, items: provenance, correlationId });
      validateStage(result, "source-provenance", workspaceId, correlationId, provenance);
      successful(result.summary);
      if (result.stopCode && STOP.has(result.stopCode)) fail();
      for (const item of result.items) {
        for (const section of [item, item.shortcuts, item.mirroring, item.materializedLakeViews]) {
          if (section) successful(section);
        }
        sources[`sourceProvenance:${item.id}`] = item.status === "complete"
          ? { source: "rayfin", ...(item.code ? { code: item.code } : {}) }
          : { source: "unsupported", code: item.code ?? "provenance-unavailable" };
      }
      merge(sourceProvenanceSnapshot(result, known));
    }
    const definitions = batch.filter((item) => DEFINITIONS.has(item.type));
    if (definitions.length) {
      const result = await call("workspaceCollectDefinitions", { protocolVersion: 1, workspaceId, items: definitions, correlationId });
      validateStage(result, "definitions", workspaceId, correlationId, definitions);
      const accepted = new Set<string>();
      for (const item of result.items) {
        if (successful(item)) { accepted.add(item.id); active(item, "definitions"); }
        else sources[`definitions:${item.id}`] = { source: "unsupported", code: item.code ?? "definition-unavailable" };
      }
      merge({ artifactMetadata: Object.fromEntries(Object.entries(result.artifactMetadata).filter(([id]) => accepted.has(id))),
        config: result.config.filter((entry) => accepted.has(entry.itemId)),
        sections: result.sections, capabilities: result.capabilities });
    }
    const sql = batch.filter((item) => SQL.has(item.type));
    if (sql.length) {
      const result = await call("workspaceCollectSqlMetadata", { protocolVersion: 1, workspaceId, items: sql, correlationId });
      validateStage(result, "sql-metadata", workspaceId, correlationId, sql);
      const accepted = new Set<string>();
      for (const item of result.items) {
        const catalog = result.catalogs[item.id];
        if (catalog) status(catalog);
        if (catalog?.code && STOP.has(catalog.code)) fail();
        if (catalog?.status === "complete") {
          const tables = result.schema[item.id];
          if (!Array.isArray(tables)) fail();
          accepted.add(item.id);
          sources[`sqlSchema:${item.id}`] = {
            source: "rayfin",
            ...(catalog.code ? { code: catalog.code } : {}),
          };
          if (item.type === "Warehouse") {
            knownStorageSchemas.add(item.id);
          } else if (item.type === "Lakehouse") {
            if (tables.length > 0) knownStorageSchemas.add(item.id);
            const direct = catalog.lakehouseTables;
            if (direct) {
              status(direct);
              if (direct.code && STOP.has(direct.code)) fail();
              if (direct.status === "complete") knownStorageSchemas.add(item.id);
            }
          }
          if (/partial|truncated/.test(catalog.code ?? "")) {
            partialStorageSchemas.add(item.id);
          }
        } else {
          sources[`sqlSchema:${item.id}`] = { source: "unsupported", code: catalog?.code ?? item.code ?? "parent-item-required" };
        }
        if (successful(item)) active(item, "sqlProperties");
        else if (item.type !== "SQLEndpoint") {
          sources[`sqlProperties:${item.id}`] = { source: "unsupported", code: item.code ?? "properties-unavailable" };
        }
      }
      merge({ schema: Object.fromEntries(Object.entries(result.schema).filter(([id]) => accepted.has(id))),
        config: result.config, sections: result.sections, capabilities: result.capabilities });
    }
    const kql = batch.filter((item) => KQL.has(item.type));
    if (kql.length) {
      const result = await call("workspaceCollectKqlMetadata", { protocolVersion: 1, workspaceId, items: kql, correlationId });
      validateStage(result, "kql-metadata", workspaceId, correlationId, kql);
      const schema: NonNullable<RawSync["schema"]> = {};
      for (const item of result.items) {
        if (successful(item)) active(item, "kqlProperties");
        else if (item.type === "Eventhouse" || item.type === "KQLDatabase") {
          sources[`kqlProperties:${item.id}`] = { source: "unsupported", code: item.code ?? "properties-unavailable" };
        }
        const structure = result.schemas[item.id];
        if (item.type === "KQLDatabase" && structure && successful(structure)) {
          active(item, "kqlDefinition");
          schema[item.id] = (structure.tables ?? []).map((table) => ({ name: table.name, objectType: "KQL table",
            source: "Fabric KQL database definition", columns: table.columns, measures: [] }));
        }
        if (item.type === "KQLDatabase") fallback(item, "kqlDataPlane", "kusto-live-schema-unsupported");
      }
      merge({ schema, config: result.config, artifactMetadata: result.artifactMetadata,
        sections: result.sections, capabilities: result.capabilities });
    }
    const powerBi = batch.filter((item): item is Item & { type: "Report" | "SemanticModel" } => ["Report", "SemanticModel"].includes(item.type));
    if (powerBi.length) {
      const result = await call("workspaceCollectPowerBi", { protocolVersion: 1, workspaceId, items: powerBi, includeAdminEvidence: false, correlationId });
      validateStage(result, "powerbi-metadata", workspaceId, correlationId, powerBi);
      const schema: NonNullable<RawSync["schema"]> = {};
      const config: NonNullable<RawSync["config"]> = [];
      for (const item of result.items) {
        if (item.type === "SemanticModel") {
          if (successful(item.schema)) { schema[item.id] = result.schema[item.id] ?? []; active(item, "powerBiDefinition"); }
          else { schemaFallbackIds.push(item.id); sources[`powerBiDefinition:${item.id}`] = { source: "python-compatibility", code: item.schema.code ?? "definition-unavailable" }; }
        } else {
          if (successful(item.pages)) {
            active(item, "reportPages");
            for (const page of result.reports[item.id]?.pages ?? []) config.push({
              itemId: item.id, section: "Report pages", label: page.displayName,
              value: `${page.name}${page.order === undefined ? "" : ` · order ${page.order}`}`,
            });
          } else fallback(item, "reportPages", item.pages.code ?? "pbir-legacy-pages-unsupported");
        }
      }
      merge({ schema, config, sections: result.sections ? { schema: result.sections.schema } : undefined,
        capabilities: result.capabilities });
    }
  }
  progress?.(48, "Collecting required scanner compatibility evidence");
  const scanner = await compatibility({
    version: 1, stage: "scanner",
    items: items.map((item) => ({ ...item, collectors: [] })), schemaItemIds: schemaFallbackIds,
  });
  if (scanner.compatibilityVersion !== 1 || scanner.compatibilityStage !== "scanner" ||
    scanner.workspace?.id !== workspaceId || scanner.correlationId !== correlationId ||
    !scanner.requestedItemIds || scanner.requestedItemIds.length !== items.length ||
    scanner.requestedItemIds.some((id) => !known.has(id))) fail();
  for (const name of ["scanner", "access", "lineage", "schema", "config"]) {
    if (!successful(status(scanner.sections?.[name]))) fail();
  }
  sources.scanner = { source: "python-compatibility", code: "service-principal-scanner-not-live-validated" };
  merge({ ...scanner, jobs: [] });
  raw.itemMetadata = { ...core.itemMetadata, ...scanner.itemMetadata };
  raw.sections = { ...raw.sections, scanner: scanner.sections!.scanner, access: scanner.sections!.access,
    lineage: scanner.sections!.lineage, schema: { status: "complete" }, config: { status: "complete" } };
  raw.capabilities = { ...raw.capabilities, ...scanner.capabilities };
  const pending = [...plans.values()];
  for (
    let offset = 0;
    offset < pending.length;
    offset += COMPATIBILITY_BATCH_SIZE
  ) {
    let remaining = pending.slice(
      offset,
      offset + COMPATIBILITY_BATCH_SIZE,
    );
    for (let attempt = 0; remaining.length && attempt < 4; attempt++) {
      progress?.(50 + Math.floor(offset / Math.max(1, pending.length) * 9), `Collecting exact compatibility gaps (${offset}/${pending.length})`);
      const result = await compatibility({
        version: 1,
        stage: "items",
        items: remaining,
        schemaItemIds: [],
      });
      const expected = new Map(remaining.map((item) => [item.id, item]));
      if (result.compatibilityVersion !== 1 || result.compatibilityStage !== "items" ||
        result.workspace?.id !== workspaceId || result.correlationId !== correlationId ||
        !Array.isArray(result.completedItemIds) || !Array.isArray(result.remainingItemIds) ||
        (result.requestedItemIds ?? []).length !== expected.size ||
        [...result.completedItemIds, ...result.remainingItemIds].some((id) => !expected.has(id)) ||
        new Set([...result.completedItemIds, ...result.remainingItemIds]).size !== expected.size) fail();
      for (const item of remaining) {
        if (JSON.stringify(result.compatibilityCollectors?.[item.id]) !== JSON.stringify(item.collectors)) fail();
      }
      if (Object.keys(result.itemFailures ?? {}).length) fail();
      const sectionFor: Partial<Record<CompatibilityCollector, string>> = {
        kqlDataPlane: "kqlSchema",
        reportPages: "reportPages",
      };
      for (const item of remaining) {
        for (const collector of item.collectors) {
          const section =
            result.compatibilityStatus?.[item.id]?.[collector] ??
            result.sections?.[sectionFor[collector]!];
          if (section) {
            status(section);
            if (section.code && STOP.has(section.code)) fail();
            if (section.status !== "complete") sources[`${collector}:${item.id}`] = {
              source: "unsupported", code: section.code ?? "compatibility-unavailable",
            };
          }
        }
      }
      merge(result);
      remaining = result.remainingItemIds.map((id) => expected.get(id)!);
    }
    if (remaining.length) fail();
  }
  const storageCoverage = items.filter((item) => item.type === "Lakehouse" || item.type === "Warehouse").map((item): Status => {
    const knownSchema = knownStorageSchemas.has(item.id);
    const hasInventory = (raw.schema?.[item.id]?.length ?? 0) > 0;
    const available = knownSchema || hasInventory;
    const partial = available && (!knownSchema || partialStorageSchemas.has(item.id));
    const coverage: Status = !available
      ? { status: "unsupported", code: "storage-schema-unavailable" }
      : { status: "complete", ...(partial ? { code: "partial-unsupported" } : {}) };
    sources[`storageSchema:${item.id}`] = !available
      ? { source: "unsupported", code: "storage-schema-unavailable" }
      : !knownSchema
        ? { source: "rayfin", code: "source-provenance-only" }
        : { source: "rayfin" };
    if (!available) delete raw.schema![item.id];
    raw.config!.push({
      itemId: item.id, section: "Storage schema coverage", label: "Status",
      value: `${coverage.status}${coverage.code ? `: ${coverage.code}` : ""}`,
    });
    return coverage;
  });
  if (storageCoverage.length) {
    // Optional storage inventory must not discard complete catalog, access and lineage evidence.
    const collected = storageCoverage.filter((coverage) => coverage.status === "complete");
    const coverage: Status = collected.length === 0
      ? { status: "unsupported", code: "storage-schema-unavailable" }
      : { status: "complete", ...(collected.length < storageCoverage.length || collected.some((entry) => entry.code)
        ? { code: "partial-unsupported" } : {}) };
    raw.sections!.storageSchema = coverage;
    raw.capabilities!.storageSchema = { ...coverage };
  }
  let itemRelationsCollection: ItemRelationsCollection | undefined;
  const evidence = [];
  const stopReasons: ItemRelationsStopReason[] = [];
  for (let offset = 0; offset < items.length; offset += 16) {
    const itemIds = items.slice(offset, offset + 16).map((item) => item.id);
    let result: AppFunctionsSchema["workspaceCollectItemRelations"]["output"];
    try {
      result = await call("workspaceCollectItemRelations", { protocolVersion: 1, workspaceId, itemIds, correlationId });
    } catch {
      assertSyncActive(signal);
      sources.itemRelations = { source: "unsupported", code: "preview-evidence-unavailable" };
      evidence.length = 0;
      break;
    }
    if (result.authoritative !== false || result.correlationId !== correlationId) fail();
    const parsed = parseItemRelationsEvidence(result, workspaceId);
    if (parsed.queries.length !== itemIds.length * 2 ||
      parsed.queries.some((query) => !itemIds.includes(query.itemId))) fail();
    evidence.push(parsed);
    if (result.stopReason) stopReasons.push(result.stopReason);
  }
  if (evidence.length) itemRelationsCollection = {
    evidence: createItemRelationsEvidence(workspaceId, evidence.at(-1)!.collectedAt, evidence.flatMap((entry) => entry.queries)),
    sampledItemCount: items.length, workspaceItemCount: items.length, stopReasons,
  };
  for (const [key, value] of Object.entries(sources)) {
    const id = key.split(":")[1];
    if (id && known.has(id)) raw.config?.push({ itemId: id, section: SOURCE_SECTION, label: key.split(":")[0],
      value: `${value.source}${value.code ? `: ${value.code}` : ""}` });
  }
  raw.collectorSources = sources;
  for (const [section, capability] of [
    ["definitions", "definitionEnrichment"], ["kqlSchema", "kqlSchema"], ["sqlSchema", "sqlSchema"],
  ]) {
    raw.sections![section] ??= { status: "unsupported", code: "not-applicable" };
    raw.capabilities![capability] ??= { ...raw.sections![section] };
  }
  raw.syncedAt = new Date().toISOString();
  assertSyncActive(signal);
  validateRawSync(raw, workspaceId);
  if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > 26 * 1024 * 1024) fail();
  const fallbackCount = Object.values(sources).filter((entry) => entry.source === "python-compatibility").length;
  return { raw, itemRelationsCollection, summary: `Collectors: Rayfin active; exact Python gaps=${fallbackCount}; scheduling=browser` };
}
