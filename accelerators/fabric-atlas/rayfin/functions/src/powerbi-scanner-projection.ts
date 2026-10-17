import {
  PowerBiProjectionError, metadataRecord, metadataText, projectSemanticModelStructure,
  type ModelProjection, type ModelTable, type PowerBiProjectionCode,
} from "./powerbi-projections.js";
import { POWERBI_SCANNER_LIMITS, type ScannerLimits, type ScannerTransportCode } from "./powerbi-scanner-rest.js";
import { strictUuid } from "./sync/protocol.js";

export type ScannerItemType = "SemanticModel" | "Report" | "Dashboard" | "Dataflow" | "Datamart";
export type ScannerExpectedItemsInput = { id: string; type: ScannerItemType }[];
export type ScannerCode =
  | ScannerTransportCode | PowerBiProjectionCode
  | "adapter-disabled" | "scanner-configuration-required" | "scanner-scope-not-approved"
  | "tenant-settings-unconfirmed" | "scanner-expected-items-missing"
  | "detailed-metadata-setting-required" | "expression-metadata-setting-required"
  | "scanner-schema-not-current" | "scanner-schema-retrieval-failed"
  | "scanner-artifact-users-required" | "owner-not-exposed" | "not-applicable"
  | "metadata-only-policy" | "static-dependency-subset" | "powerbi-scanner-scope-only"
  | "report-pages-not-collected";
export type ScannerStatus = { status: "complete" | "unsupported" | "failed"; code?: ScannerCode };
export type ScannerRequest = {
  tenantId: string; workspaceId: string; expectedItems: ScannerExpectedItemsInput; correlationId: string | null;
};
export type ScannerItemMetadata = {
  scannerMatched: true;
  ownerAvailable: boolean;
  configuredBy?: string;
  modifiedBy?: string;
  modifiedDateTime?: string;
  owner?: { principalId?: string; displayName?: string; email?: string; source: "workspaceInfo.configuredBy" | "workspaceInfo.createdBy" };
  endorsement?: { value?: string; certifiedBy?: string };
  sensitivity?: { labelId: string };
  tags?: { id: string }[];
};
export type ScannerAccess = {
  itemId: string; principalId: string; principalName: string; principalEmail?: string;
  principalType: string; userType?: string; tenantWide: boolean; accessRight: string;
};
export interface ScannerStageEnvelope {
  contractVersion: 1;
  stage: "powerbi-admin-scanner";
  authoritative: false;
  readyForScannerMerge: boolean;
  tenantId: string;
  workspaceId: string;
  correlationId?: string;
  coverage: {
    identity: "secret-store-service-principal";
    artifacts: "public-powerbi-scanner-types";
    expressions: "sanitized-measures";
    dependencies: "static-resolved-subset";
    lineage: "observed-same-workspace-powerbi-edges";
  };
  items: { id: string; type: ScannerItemType; displayName?: string; workspaceId: string }[];
  schema: Record<string, ModelTable[]>;
  models: Record<string, ModelProjection>;
  itemMetadata: Record<string, ScannerItemMetadata>;
  access: ScannerAccess[];
  lineage: { source: string; target: string; relation: string }[];
  boundaryReferences: {
    sourceItemId: string; targetItemId: string; sourceWorkspaceId?: string; relation: string;
    reason: "external-workspace" | "unresolved-item";
  }[];
  sections: {
    scanner: ScannerStatus; schema: ScannerStatus; expressions: ScannerStatus; access: ScannerStatus; lineage: ScannerStatus;
  };
  capabilities: {
    ownership: ScannerStatus; engineDependencies: ScannerStatus; reportPages: ScannerStatus;
    modelRelationships: ScannerStatus; calculatedColumnExpressions: ScannerStatus;
    mashupExpressions: ScannerStatus; fabricItemLineage: ScannerStatus;
  };
  blockers: { code: ScannerCode; observedOn: "2026-10-02"; rayfinVersion: "1.36.2"; requiredSetup: string }[];
  errors: string[];
  syncedAt: string;
}

export const SCANNER_SETUP: Partial<Record<ScannerCode, string>> = {
  "adapter-disabled": "Set ATLAS_POWERBI_SCANNER_ENABLED=true in the deployed Secret Store only after completing scanner setup.",
  "scanner-configuration-required": "Provision the scanner tenant UUID, client UUID, client secret and approved workspace UUID JSON array through Rayfin Secret Store.",
  "scanner-scope-not-approved": "Use the configured tenant UUID and a workspace UUID in the server-side approved workspace list.",
  "tenant-settings-unconfirmed": "Confirm read-only admin API service-principal approval, detailed metadata and DAX/mashup scanning settings; then set ATLAS_POWERBI_SCANNER_SETTINGS_CONFIRMED=true.",
  "tenant-admin-settings-required": "Approve this dedicated service principal's security group for read-only admin APIs; the application must not have admin-consent-required Power BI API permissions.",
  "oauth-credentials-rejected": "Review the dedicated service principal tenant/client identifiers and rotate its Secret Store client credential if needed.",
  "detailed-metadata-setting-required": "Enable Enhance admin APIs responses with detailed metadata and verify model scanning availability; missing tables cannot be treated as an empty model.",
  "expression-metadata-setting-required": "Enable Enhance admin APIs responses with DAX and mashup expressions and verify expression availability; omitted measure expressions cannot be treated as complete.",
  "scanner-artifact-users-required": "Verify getArtifactUsers results and read-only admin API permission; omitted users cannot be treated as an empty access list.",
  "scanner-expected-items-missing": "Reconcile the current Fabric Core catalog with scanner results; expected artifact identities/types must match before merging.",
  "metadata-only-policy": "Review unavailable selected expressions: inline data constructors, credentials and malformed DAX are omitted rather than returned or executed.",
  "scanner-schema-not-current": "Reconcile model metadata and wait for a scan that no longer reports schemaMayNotBeUpToDate.",
  "scanner-schema-retrieval-failed": "Resolve the model schema retrieval failure and obtain a complete fresh scan; provider error text is not returned.",
};
export const unsupportedScanner = (code: ScannerCode): ScannerStatus => ({ status: "unsupported", code });
const complete = (): ScannerStatus => ({ status: "complete" });

export function emptyScannerEnvelope(request: ScannerRequest, status: ScannerStatus): ScannerStageEnvelope {
  return {
    contractVersion: 1, stage: "powerbi-admin-scanner", authoritative: false, readyForScannerMerge: false,
    tenantId: request.tenantId, workspaceId: request.workspaceId,
    ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    coverage: {
      identity: "secret-store-service-principal", artifacts: "public-powerbi-scanner-types",
      expressions: "sanitized-measures", dependencies: "static-resolved-subset",
      lineage: "observed-same-workspace-powerbi-edges",
    },
    items: [], schema: {}, models: {}, itemMetadata: {}, access: [], lineage: [], boundaryReferences: [],
    sections: { scanner: { ...status }, schema: { ...status }, expressions: { ...status }, access: { ...status }, lineage: { ...status } },
    capabilities: {
      ownership: unsupportedScanner("owner-not-exposed"), engineDependencies: unsupportedScanner("static-dependency-subset"),
      reportPages: unsupportedScanner("report-pages-not-collected"), mashupExpressions: unsupportedScanner("metadata-only-policy"),
      modelRelationships: unsupportedScanner("powerbi-scanner-scope-only"),
      calculatedColumnExpressions: unsupportedScanner("powerbi-scanner-scope-only"),
      fabricItemLineage: unsupportedScanner("powerbi-scanner-scope-only"),
    },
    blockers: status.code && SCANNER_SETUP[status.code] ? [{
      code: status.code, observedOn: "2026-10-02", rayfinVersion: "1.36.2", requiredSetup: SCANNER_SETUP[status.code]!,
    }] : [],
    errors: status.status === "failed" ? [`powerbi-admin-scanner: ${status.code ?? "upstream-failure"}`] : [],
    syncedAt: new Date().toISOString(),
  };
}

function uuid(value: unknown): string {
  try { return strictUuid(value); } catch { throw new PowerBiProjectionError("invalid-definition"); }
}
function optionalText(value: unknown): string | undefined {
  return value === undefined || value === null ? undefined : metadataText(value);
}
function list(value: unknown, max: number, optional = true): Record<string, unknown>[] {
  if (value === undefined && optional) return [];
  if (!Array.isArray(value)) throw new PowerBiProjectionError("invalid-definition");
  if (value.length > max) throw new PowerBiProjectionError("projection-limit-exceeded");
  return value.map(metadataRecord);
}
function selectedMetadata(raw: Record<string, unknown>, type: ScannerItemType): ScannerItemMetadata {
  const result: ScannerItemMetadata = { scannerMatched: true, ownerAvailable: false };
  const configuredBy = ["SemanticModel", "Dataflow", "Datamart"].includes(type) ? optionalText(raw.configuredBy) : undefined;
  const modificationSupported = ["Report", "Dataflow", "Datamart"].includes(type);
  const modifiedBy = modificationSupported ? optionalText(raw.modifiedBy) : undefined;
  if (configuredBy) result.configuredBy = configuredBy;
  if (modifiedBy) result.modifiedBy = modifiedBy;
  if (modificationSupported && raw.modifiedDateTime !== undefined) {
    const timestamp = metadataText(raw.modifiedDateTime);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})?$/.test(timestamp)) throw new Error();
    const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) ? timestamp : `${timestamp}Z`);
    if (Number.isNaN(date.valueOf())) throw new Error();
    result.modifiedDateTime = date.toISOString();
  }
  const ownerField = type === "Report" ? "createdBy" : ["SemanticModel", "Dataflow", "Datamart"].includes(type) ? "configuredBy" : undefined;
  if (ownerField) {
    const displayName = optionalText(raw[ownerField]);
    const ownerIdSupported = type === "Report" || type === "Datamart";
    const principalId = !ownerIdSupported || raw[`${ownerField}Id`] == null ? undefined : uuid(raw[`${ownerField}Id`]);
    if (displayName || principalId) {
      result.ownerAvailable = true;
      result.owner = {
        source: ownerField === "createdBy" ? "workspaceInfo.createdBy" : "workspaceInfo.configuredBy",
        ...(displayName ? { displayName, ...(displayName.includes("@") ? { email: displayName } : {}) } : {}),
        ...(principalId ? { principalId } : {}),
      };
    }
  }
  if (type !== "Dashboard" && raw.endorsementDetails !== undefined) {
    const endorsement = metadataRecord(raw.endorsementDetails);
    const value = optionalText(endorsement.endorsement);
    const certifiedBy = optionalText(endorsement.certifiedBy);
    if (value || certifiedBy) result.endorsement = { ...(value ? { value } : {}), ...(certifiedBy ? { certifiedBy } : {}) };
  }
  if (raw.sensitivityLabel !== undefined) {
    result.sensitivity = { labelId: uuid(metadataRecord(raw.sensitivityLabel).labelId) };
  }
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || raw.tags.length > 256) throw new Error();
    result.tags = raw.tags.map((tag: unknown) => ({ id: uuid(tag) }));
  }
  return result;
}

const RIGHTS: Record<ScannerItemType, string> = {
  Report: "reportUserAccessRight", SemanticModel: "datasetUserAccessRight", Dashboard: "dashboardUserAccessRight",
  Dataflow: "dataflowUserAccessRight", Datamart: "datamartUserAccessRight",
};
function selectedAccess(raw: Record<string, unknown>, itemId: string, type: ScannerItemType): ScannerAccess {
  const principalType = metadataText(raw.principalType);
  if (!["User", "Group", "App", "None"].includes(principalType)) throw new Error();
  const tenantWide = principalType === "None";
  const principalEmail = optionalText(raw.emailAddress);
  const principalId = tenantWide ? "entire-tenant" : raw.graphId != null ? uuid(raw.graphId)
    : optionalText(raw.identifier) ?? principalEmail;
  if (!principalId) throw new Error();
  const principalName = optionalText(raw.displayName) ?? principalEmail ?? principalId;
  const specific = optionalText(raw[RIGHTS[type]] ?? (type === "Dataflow" ? raw.DataflowUserAccessRight : undefined));
  const fallback = optionalText(raw.appUserAccessRight);
  if (specific && fallback && specific !== fallback) throw new Error();
  const accessRight = specific ?? fallback;
  if (!accessRight || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(accessRight)) throw new Error();
  const userType = optionalText(raw.userType);
  return {
    itemId, principalId, principalName, principalType, tenantWide, accessRight,
    ...(principalEmail ? { principalEmail } : {}), ...(userType ? { userType } : {}),
  };
}

/** Public scanner subset projected onto existing RawSync/model contracts; never returns raw artifacts. */
export function projectPowerBiScanner(
  response: unknown, request: ScannerRequest, limits: ScannerLimits = { ...POWERBI_SCANNER_LIMITS },
): ScannerStageEnvelope {
  const result = emptyScannerEnvelope(request, complete());
  const workspaces = list(metadataRecord(response).workspaces, 1, false);
  if (workspaces.length !== 1 || uuid(workspaces[0].id) !== request.workspaceId) throw new Error();
  const workspace = workspaces[0];
  const families: [string, ScannerItemType][] = [
    ["datasets", "SemanticModel"], ["reports", "Report"], ["dashboards", "Dashboard"], ["dataflows", "Dataflow"], ["datamarts", "Datamart"],
  ];
  const rawItems: { id: string; type: ScannerItemType; raw: Record<string, unknown> }[] = [];
  const types = new Map<string, ScannerItemType>();
  let objects = 0;
  const take = (count = 1) => {
    objects += count;
    if (objects > limits.maxProjectedObjects) throw new PowerBiProjectionError("projection-limit-exceeded");
  };
  const unavailable = (section: "schema" | "expressions" | "access" | "scanner", code: ScannerCode) => {
    result.sections[section] = unsupportedScanner(code);
    if (!result.blockers.some((blocker) => blocker.code === code) && SCANNER_SETUP[code]) {
      result.blockers.push({ code, observedOn: "2026-10-02", rayfinVersion: "1.36.2", requiredSetup: SCANNER_SETUP[code]! });
    }
  };
  for (const [family, type] of families) {
    for (const raw of list(workspace[family], limits.maxItems)) {
      if (rawItems.length >= limits.maxItems) throw new PowerBiProjectionError("projection-limit-exceeded");
      const id = uuid(type === "Dataflow" ? raw.objectId : raw.id);
      if (types.has(id)) throw new Error();
      types.set(id, type);
      rawItems.push({ id, type, raw });
      const displayName = optionalText(raw.name ?? raw.displayName);
      result.items.push({ id, type, workspaceId: request.workspaceId, ...(displayName ? { displayName } : {}) });
      result.itemMetadata[id] = selectedMetadata(raw, type);
      if (raw.users === undefined) unavailable("access", "scanner-artifact-users-required");
      else {
        const users = list(raw.users, limits.maxProjectedObjects, false);
        take(users.length);
        result.access.push(...users.map((user) => selectedAccess(user, id, type)));
      }
      if (type === "SemanticModel") {
        if (raw.tables === undefined) {
          unavailable("schema", "detailed-metadata-setting-required");
          unavailable("expressions", "expression-metadata-setting-required");
        } else {
          // Scanner Column/WorkspaceInfoDataset do not publicly contract DAX columns or relationships.
          const tables = list(raw.tables, limits.maxProjectedObjects, false).map((table) => ({
            name: table.name,
            ...(table.isHidden === undefined ? {} : { isHidden: table.isHidden }),
            columns: list(table.columns, limits.maxProjectedObjects).map((column) => ({
              name: column.name,
              ...(column.dataType === undefined ? {} : { dataType: column.dataType }),
              ...(column.isHidden === undefined ? {} : { isHidden: column.isHidden }),
            })),
            measures: list(table.measures, limits.maxProjectedObjects).map((measure) => ({
              name: measure.name, expression: measure.expression,
              ...(measure.isHidden === undefined ? {} : { isHidden: measure.isHidden }),
            })),
          }));
          const model = projectSemanticModelStructure({ tables }, "Power BI admin scanner");
          take(model.tables.length + model.relationships.length + model.dependencies.length +
            model.tables.reduce((count, table) => count + table.columns.length + table.measures.length, 0));
          result.models[id] = model;
          result.schema[id] = model.tables;
          if (model.expressionsOmitted) {
            const missingExpressions = list(raw.tables, limits.maxProjectedObjects).some((table) =>
              list(table.measures, limits.maxProjectedObjects).some((measure) => measure.expression == null));
            unavailable("expressions", missingExpressions ? "expression-metadata-setting-required" : "metadata-only-policy");
          }
        }
        if (raw.schemaMayNotBeUpToDate !== undefined && typeof raw.schemaMayNotBeUpToDate !== "boolean") throw new Error();
        if (raw.schemaMayNotBeUpToDate === true) unavailable("schema", "scanner-schema-not-current");
        if (raw.schemaRetrievalError != null) {
          if (typeof raw.schemaRetrievalError !== "string") throw new Error();
          if (raw.schemaRetrievalError.trim()) unavailable("schema", "scanner-schema-retrieval-failed");
        }
      }
    }
  }
  if (request.expectedItems.some((item) => types.get(item.id) !== item.type)) {
    unavailable("scanner", "scanner-expected-items-missing");
  }
  const seen = new Set<string>();
  const edge = (source: unknown, target: string, relation: string, group?: unknown) => {
    if (source === undefined || source === null) return;
    const sourceItemId = uuid(source);
    const sourceWorkspaceId = group == null ? undefined : uuid(group);
    const key = JSON.stringify([sourceItemId, target, relation, sourceWorkspaceId]);
    if (sourceItemId === target || seen.has(key)) return;
    seen.add(key);
    take();
    if (sourceWorkspaceId && sourceWorkspaceId !== request.workspaceId) {
      result.boundaryReferences.push({ sourceItemId, targetItemId: target, sourceWorkspaceId, relation, reason: "external-workspace" });
    } else if (!types.has(sourceItemId)) {
      result.boundaryReferences.push({ sourceItemId, targetItemId: target, ...(sourceWorkspaceId ? { sourceWorkspaceId } : {}), relation, reason: "unresolved-item" });
    } else result.lineage.push({ source: sourceItemId, target, relation });
  };
  for (const item of rawItems) {
    if (item.type === "Report") edge(item.raw.datasetId, item.id, "report", item.raw.datasetWorkspaceId);
    for (const [field, idField, relation] of [
      ["upstreamDataflows", "targetDataflowId", "dataflow"],
      ["upstreamDatamarts", "targetDatamartId", "datamart"],
      ["upstreamDatasets", "targetDatasetId", "semantic model"],
    ]) {
      if (!["SemanticModel", "Dataflow", "Datamart"].includes(item.type) ||
        (field === "upstreamDatasets" && item.type !== "SemanticModel")) continue;
      for (const upstream of list(item.raw[field], limits.maxProjectedObjects)) {
        edge(uuid(upstream[idField]), item.id, relation, upstream.groupId);
      }
    }
    if (item.type === "Dashboard") {
      for (const tile of list(item.raw.tiles, limits.maxProjectedObjects)) {
        edge(tile.reportId, item.id, "dashboard report");
        edge(tile.datasetId, item.id, "dashboard dataset");
      }
    }
  }
  if (result.items.length && result.items.every((item) => result.itemMetadata[item.id].ownerAvailable)) {
    result.capabilities.ownership = complete();
  }
  result.readyForScannerMerge = Object.values(result.sections).every((status) => status.status === "complete");
  return result;
}
