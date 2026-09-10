// Live Sync: acquire a Power BI token in the browser (MSAL), invoke the Fabric
// User Data Function `sync_all`, and map the Fabric REST payload onto the Atlas
// data model. See the "Why a Fabric User Data Function?" note in the README for
// why this hop through a server-side function is required.

import { ATLAS_CONFIG, getUdfUrl, validateUdfUrl } from "./config";
import { normalizeLineageEdges } from "./lineage";
import {
  itemMetadataFromSchema,
  metadataItemLineageEdges,
  metadataObjectLineageEdges,
  parseFabricItemMetadata,
  parseObjectLineagePayload,
  projectItemMetadataToSchema,
  type FabricItemMetadata,
  type MetadataObjectLineageEdge,
} from "./item-metadata";
import {
  type AtlasData,
  type Item,
  type ItemType,
  type Principal,
  type Grant,
  type Job,
  type Edge,
  type WorkspaceInfo,
  type Health,
  type PrincipalKind,
  type WorkspaceRole,
  type ConfigKV,
  type AccessLevel,
  type ModelTableSchema,
} from "./model";

/* -------------------------------- MSAL --------------------------------- */

export interface SyncIdentity {
  id?: string;
  name: string;
  email?: string;
}

export function normalizeFabricTimestamp(
  value: unknown,
): string | undefined {
  const text = realText(value);
  if (!text) return undefined;
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
    ? text
    : `${text}Z`;
  const date = new Date(zoned);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

export interface MsalAccount {
  homeAccountId?: string;
  localAccountId?: string;
  tenantId?: string;
  username?: string;
  idTokenClaims?: Record<string, unknown>;
}

interface MsalResult {
  accessToken: string;
  account?: MsalAccount | null;
}

// Loosely typed to avoid pulling MSAL types into the module graph eagerly.
let msalApp: {
  initialize: () => Promise<void>;
  getAllAccounts: () => MsalAccount[];
  acquireTokenSilent: (r: unknown) => Promise<MsalResult>;
  ssoSilent: (r: unknown) => Promise<MsalResult>;
  acquireTokenPopup: (r: unknown) => Promise<MsalResult>;
} | null = null;
let msalInitPromise: Promise<void> | null = null;

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function realText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text || text.toLowerCase() === "undefined" || text.toLowerCase() === "null") {
    return undefined;
  }
  return text;
}

function accountValues(account: MsalAccount): Set<string> {
  const claims = account.idTokenClaims ?? {};
  const values = [
    account.homeAccountId,
    account.homeAccountId?.split(".")[0],
    account.localAccountId,
    account.username,
    claims.oid,
    claims.sub,
    claims.email,
    claims.preferred_username,
    claims.upn,
    claims.unique_name,
  ]
    .map(normalized)
    .filter(Boolean);
  return new Set(values);
}

export function accountMatchesIdentity(
  account: MsalAccount,
  identity: Pick<SyncIdentity, "id" | "email">,
): boolean {
  const expected = [identity.id, identity.email]
    .map(normalized)
    .filter(Boolean);
  if (expected.length === 0) return false;
  const values = accountValues(account);
  return expected.some((value) => values.has(value));
}

export function selectMsalAccount(
  accounts: MsalAccount[],
  identity: Pick<SyncIdentity, "id" | "email">,
  expectedTenantId?: string,
): MsalAccount | undefined {
  const tenantId = normalized(expectedTenantId);
  return accounts.find(
    (account) =>
      (!tenantId || normalized(account.tenantId) === tenantId) &&
      accountMatchesIdentity(account, identity),
  );
}

function tokenForIdentity(
  result: MsalResult,
  identity: SyncIdentity,
  purpose: string,
): string {
  if (
    !result.account ||
    !selectMsalAccount([result.account], identity, ATLAS_CONFIG.tenantId)
  ) {
    throw new Error(
      `The ${purpose} sign-in did not match the current Fabric user. The previous snapshot was preserved.`,
    );
  }
  return result.accessToken;
}

async function acquireToken(
  identity: SyncIdentity,
  scopes: string[],
  purpose: string,
  allowPopup: boolean,
): Promise<string> {
  if (!identity.id && !identity.email) {
    throw new Error(
      "The current Fabric user could not be identified. The previous snapshot was preserved.",
    );
  }
  const { PublicClientApplication } = await import("@azure/msal-browser");
  if (!msalApp) {
    msalApp = new PublicClientApplication({
      auth: {
        clientId: ATLAS_CONFIG.clientId,
        authority: `https://login.microsoftonline.com/${ATLAS_CONFIG.tenantId}`,
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: "sessionStorage",
        temporaryCacheLocation: "sessionStorage",
      },
    }) as unknown as typeof msalApp;
    msalInitPromise = msalApp!.initialize();
  }
  try {
    await msalInitPromise;
  } catch (error) {
    msalApp = null;
    msalInitPromise = null;
    throw error;
  }
  const account = selectMsalAccount(
    msalApp!.getAllAccounts(),
    identity,
    ATLAS_CONFIG.tenantId,
  );
  try {
    const res = account
      ? await msalApp!.acquireTokenSilent({ scopes, account })
      : await msalApp!.ssoSilent({ scopes, loginHint: identity.email });
    return tokenForIdentity(res, identity, purpose);
  } catch (error) {
    if (!allowPopup) throw error;
    // Silent SSO can be blocked inside the Fabric iframe (3rd-party cookies);
    // force an explicit account choice rather than reusing another user's cache.
    const res = await msalApp!.acquireTokenPopup({
      scopes,
      loginHint: identity.email,
      prompt: "select_account",
    });
    return tokenForIdentity(res, identity, purpose);
  }
}

const OPTIONAL_METADATA_TOKEN_SCOPES = {
  definitionToken: {
    scope:
      "https://analysis.windows.net/powerbi/api/Item.ReadWrite.All",
    purpose: "Fabric definition metadata",
  },
  kustoToken: {
    scope: "https://kusto.kusto.windows.net/user_impersonation",
    purpose: "KQL metadata",
  },
  sqlToken: {
    scope: "https://database.windows.net/user_impersonation",
    purpose: "SQL metadata",
  },
} as const;

const FABRIC_DISCOVERY_SCOPES = [
  "https://analysis.windows.net/powerbi/api/UserDataFunction.Execute.All",
  "https://analysis.windows.net/powerbi/api/Workspace.Read.All",
  "https://analysis.windows.net/powerbi/api/Item.Read.All",
  "https://analysis.windows.net/powerbi/api/Dataset.Read.All",
  "https://analysis.windows.net/powerbi/api/Report.Read.All",
  "https://analysis.windows.net/powerbi/api/Tenant.Read.All",
];

export interface SyncRequestTokens {
  fabricToken: string;
  definitionToken?: string;
  kustoToken?: string;
  sqlToken?: string;
  storageToken?: string;
  deferEnrichment?: string;
  itemIds?: string;
  correlationId?: string;
}

export function buildSyncRequestBody(
  workspaceId: string,
  tokens: SyncRequestTokens,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ workspaceId, ...tokens }).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1].length > 0,
    ),
  );
}

async function acquireOptionalMetadataTokens(
  identity: SyncIdentity,
  allowPopup = true,
  signal?: AbortSignal,
): Promise<Omit<SyncRequestTokens, "fabricToken">> {
  assertSyncActive(signal);
  const tokens: Omit<SyncRequestTokens, "fabricToken"> = {};
  for (const [name, request] of Object.entries(
    OPTIONAL_METADATA_TOKEN_SCOPES,
  ) as Array<
    [
      keyof typeof OPTIONAL_METADATA_TOKEN_SCOPES,
      (typeof OPTIONAL_METADATA_TOKEN_SCOPES)[keyof typeof OPTIONAL_METADATA_TOKEN_SCOPES],
    ]
  >) {
    try {
      assertSyncActive(signal);
      tokens[name] = await acquireToken(
        identity,
        [request.scope],
        request.purpose,
        allowPopup,
      );
      assertSyncActive(signal);
    } catch (error) {
      assertSyncActive(signal);
      console.warn(
        `[atlas] ${request.purpose} token unavailable`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return tokens;
}

async function acquireFabricSyncToken(
  identity: SyncIdentity,
  allowPopup = true,
  signal?: AbortSignal,
): Promise<string> {
  assertSyncActive(signal);
  try {
    const token = await acquireToken(
      identity,
      FABRIC_DISCOVERY_SCOPES,
      "Fabric metadata",
      allowPopup,
    );
    assertSyncActive(signal);
    return token;
  } catch (error) {
    assertSyncActive(signal);
    console.warn(
      "[atlas] advanced Fabric definition permission unavailable; using the standard metadata scope",
      error instanceof Error ? error.message : String(error),
    );
    const token = await acquireToken(
      identity,
      [ATLAS_CONFIG.scope],
      "Power BI",
      allowPopup,
    );
    assertSyncActive(signal);
    return token;
  }
}

async function renewSyncTokens(
  identity: SyncIdentity,
  current: SyncRequestTokens,
  signal?: AbortSignal,
): Promise<SyncRequestTokens> {
  assertSyncActive(signal);
  const next = { ...current };
  if (tokenNeedsRefresh(current.fabricToken)) {
    next.fabricToken = await acquireFabricSyncToken(identity, false, signal);
  }
  for (const [name, request] of Object.entries(
    OPTIONAL_METADATA_TOKEN_SCOPES,
  ) as Array<
    [
      keyof typeof OPTIONAL_METADATA_TOKEN_SCOPES,
      (typeof OPTIONAL_METADATA_TOKEN_SCOPES)[keyof typeof OPTIONAL_METADATA_TOKEN_SCOPES],
    ]
  >) {
    const token = current[name];
    if (!token || !tokenNeedsRefresh(token)) continue;
    next[name] = await acquireToken(
      identity,
      [request.scope],
      request.purpose,
      false,
    );
    assertSyncActive(signal);
  }
  assertSyncActive(signal);
  return next;
}

/* ----------------------------- UDF invoke ------------------------------ */

export interface RawSync {
  schemaVersion?: number;
  syncMode?: string;
  correlationId?: string;
  workspace?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  roleAssignments?: Array<Record<string, unknown>>;
  jobs?: Array<Record<string, unknown>>;
  lineage?: Array<{ source?: string; target?: string; relation?: string }>;
  access?: Array<{
    itemId?: string;
    principalId?: string;
    principalName?: string;
    principalEmail?: string;
    principalType?: string;
    userType?: string;
    tenantWide?: boolean;
    accessRight?: string;
  }>;
  config?: Array<{ itemId?: string; section?: string; label?: string; value?: string }>;
  sections?: Record<
    string,
    {
      status?: "complete" | "unsupported" | "failed";
      code?: string;
    }
  >;
  capabilities?: Record<
    string,
    {
      status?: "complete" | "unsupported" | "failed";
      code?: string;
    }
  >;
  itemMetadata?: Record<
    string,
    {
      scannerMatched?: boolean;
      ownerAvailable?: boolean;
      configuredBy?: string;
      modifiedBy?: string;
      modifiedDateTime?: string;
      owner?: {
        principalId?: string;
        displayName?: string;
        email?: string;
        source?: string;
      };
      endorsement?: {
        value?: string;
        certifiedBy?: string;
      };
      sensitivity?: {
        labelId?: string;
        displayName?: string;
      };
      tags?: Array<{
        id?: string;
        displayName?: string;
      }>;
      artifactMetadata?: unknown;
    }
  >;
  artifactMetadata?: Record<string, unknown>;
  objectEdges?: unknown;
  objectLineage?: unknown;
  enrichmentItemIds?: string[];
  requestedItemIds?: string[];
  completedItemIds?: string[];
  remainingItemIds?: string[];
  itemFailures?: Record<string, string>;
  syncedAt?: string;
  schema?: Record<
    string,
    Array<{
      name?: string;
      rows?: number;
      objectType?: string;
      source?: string;
      description?: string;
      isHidden?: boolean;
      columns?: Array<{
        name?: string;
        dataType?: string;
        objectType?: string;
        description?: string;
        isHidden?: boolean;
      }>;
      measures?: Array<{
        name?: string;
        expression?: string;
        expr?: string;
        objectType?: string;
        description?: string;
        isHidden?: boolean;
      }>;
      metadata?: unknown;
    }>
  >;
  errors?: string[];
}

export interface SyncItemBatch {
  itemType: string;
  itemIds: string[];
  attempt: number;
}

const SYNC_ITEM_BATCH_SIZE = 8;

export function buildSyncItemBatches(
  items: Array<Record<string, unknown>>,
  batchSize = SYNC_ITEM_BATCH_SIZE,
): SyncItemBatch[] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("Sync batch size must be a positive integer.");
  }
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const itemId = realText(item.id);
    const itemType = realText(item.type);
    if (!itemId || !itemType) continue;
    const itemIds = groups.get(itemType) ?? [];
    itemIds.push(itemId);
    groups.set(itemType, itemIds);
  }
  return [...groups.entries()].flatMap(([itemType, itemIds]) => {
    const batches: SyncItemBatch[] = [];
    for (let index = 0; index < itemIds.length; index += batchSize) {
      batches.push({
        itemType,
        itemIds: itemIds.slice(index, index + batchSize),
        attempt: 0,
      });
    }
    return batches;
  });
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

type RawSchemaTable = NonNullable<RawSync["schema"]>[string][number];
type RawSchemaColumn = NonNullable<RawSchemaTable["columns"]>[number];
type RawSchemaMeasure = NonNullable<RawSchemaTable["measures"]>[number];

function mergeSchemaValues<T extends { name?: string; objectType?: string }>(
  current: T[] = [],
  incoming: T[] = [],
): T[] {
  const values = new Map<string, T>();
  for (const value of [...current, ...incoming]) {
    const key = (value.name ?? "").trim().toLocaleLowerCase();
    values.set(key, { ...values.get(key), ...value });
  }
  return [...values.values()];
}

function mergeSchemaTables(
  current: RawSchemaTable[] = [],
  incoming: RawSchemaTable[] = [],
): RawSchemaTable[] {
  const values = new Map<string, RawSchemaTable>();
  for (const table of [...current, ...incoming]) {
    const key = (table.name ?? "").trim().toLocaleLowerCase();
    const previous = values.get(key);
    values.set(
      key,
      previous
        ? {
            ...previous,
            ...table,
            columns: mergeSchemaValues<RawSchemaColumn>(
              previous.columns,
              table.columns,
            ),
            measures: mergeSchemaValues<RawSchemaMeasure>(
              previous.measures,
              table.measures,
            ),
          }
        : table,
    );
  }
  return [...values.values()];
}

function mergeSyncStatus(
  current:
    | { status?: "complete" | "unsupported" | "failed"; code?: string }
    | undefined,
  incoming:
    | { status?: "complete" | "unsupported" | "failed"; code?: string }
    | undefined,
) {
  if (!current) return incoming;
  if (!incoming) return current;
  if (current.status === "unsupported" && current.code === "not-applicable") {
    return incoming;
  }
  if (incoming.status === "unsupported" && incoming.code === "not-applicable") {
    return current;
  }
  if (current.status === "failed") return current;
  if (incoming.status === "failed") return incoming;
  if (current.status === "complete" || incoming.status === "complete") {
    return {
      status: "complete" as const,
      code:
        current.status === "unsupported" || incoming.status === "unsupported"
          ? "partial-unsupported"
          : incoming.code ?? current.code,
    };
  }
  return incoming.code ? incoming : current;
}

function mergeSyncStatusMaps(
  current: RawSync["sections"],
  incoming: RawSync["sections"],
): RawSync["sections"] {
  const result = { ...(current ?? {}) };
  for (const [name, status] of Object.entries(incoming ?? {})) {
    result[name] = mergeSyncStatus(result[name], status) ?? status;
  }
  return result;
}

function mergeItemMetadata(
  current: RawSync["itemMetadata"],
  incoming: RawSync["itemMetadata"],
): RawSync["itemMetadata"] {
  const result = { ...(current ?? {}) };
  for (const [itemId, metadata] of Object.entries(incoming ?? {})) {
    const previous = result[itemId];
    result[itemId] = {
      ...previous,
      ...metadata,
      scannerMatched:
        previous?.scannerMatched ?? metadata.scannerMatched,
      ownerAvailable:
        previous?.ownerAvailable === true || metadata.ownerAvailable === true,
      owner:
        previous?.owner || metadata.owner
          ? { ...previous?.owner, ...metadata.owner }
          : undefined,
      endorsement:
        previous?.endorsement || metadata.endorsement
          ? { ...previous?.endorsement, ...metadata.endorsement }
          : undefined,
      sensitivity:
        previous?.sensitivity || metadata.sensitivity
          ? { ...previous?.sensitivity, ...metadata.sensitivity }
          : undefined,
      tags: metadata.tags ?? previous?.tags,
    };
  }
  return result;
}

export function mergeSyncEnrichment(
  current: RawSync,
  enrichment: RawSync,
): RawSync {
  const schema = { ...(current.schema ?? {}) };
  for (const [itemId, tables] of Object.entries(enrichment.schema ?? {})) {
    schema[itemId] = mergeSchemaTables(schema[itemId], tables);
  }
  const currentObjectEdges = Array.isArray(current.objectEdges)
    ? current.objectEdges
    : [];
  const enrichmentObjectEdges = Array.isArray(enrichment.objectEdges)
    ? enrichment.objectEdges
    : [];
  return {
    ...current,
    syncMode: "complete",
    jobs: uniqueBy(
      [...(current.jobs ?? []), ...(enrichment.jobs ?? [])],
      (job) =>
        [
          job.itemId,
          job.jobType,
          job.startTimeUtc,
          job.endTimeUtc,
          job.status,
        ].join("\u0000"),
    ),
    lineage: uniqueBy(
      [...(current.lineage ?? []), ...(enrichment.lineage ?? [])],
      (edge) => [edge.source, edge.target, edge.relation].join("\u0000"),
    ),
    config: uniqueBy(
      [...(current.config ?? []), ...(enrichment.config ?? [])],
      (entry) =>
        [entry.itemId, entry.section, entry.label, entry.value].join("\u0000"),
    ),
    schema,
    artifactMetadata: {
      ...(current.artifactMetadata ?? {}),
      ...(enrichment.artifactMetadata ?? {}),
    },
    itemMetadata: mergeItemMetadata(
      current.itemMetadata,
      enrichment.itemMetadata,
    ),
    itemFailures: {
      ...(current.itemFailures ?? {}),
      ...(enrichment.itemFailures ?? {}),
    },
    objectEdges: [...currentObjectEdges, ...enrichmentObjectEdges],
    sections: mergeSyncStatusMaps(current.sections, enrichment.sections),
    capabilities: mergeSyncStatusMaps(
      current.capabilities,
      enrichment.capabilities,
    ),
    errors: uniqueBy(
      [...(current.errors ?? []), ...(enrichment.errors ?? [])],
      (error) => error,
    ),
    syncedAt: enrichment.syncedAt ?? current.syncedAt,
  };
}

function itemEndorsement(value: unknown): Item["endorsement"] {
  const normalizedValue = normalized(value);
  if (normalizedValue === "certified") return "certified";
  if (normalizedValue === "promoted") return "promoted";
  return "none";
}

function finiteRowCount(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && !Array.isArray(value) && typeof value === "object";
}

function optionalText(value: unknown): boolean {
  return value == null || typeof value === "string";
}

function validateItemMetadata(
  value: RawSync["itemMetadata"],
  itemIds: Set<string>,
): void {
  if (value == null) return;
  if (!isRecord(value)) {
    throw new Error(
      "The sync result contained invalid item metadata. The previous snapshot was preserved.",
    );
  }
  for (const [itemId, metadata] of Object.entries(value)) {
    if (!itemIds.has(itemId) || !isRecord(metadata)) {
      throw new Error(
        "The sync result contained invalid item metadata. The previous snapshot was preserved.",
      );
    }
    if (
      metadata.scannerMatched != null &&
      typeof metadata.scannerMatched !== "boolean"
    ) {
      throw new Error(
        "The sync result contained invalid item metadata. The previous snapshot was preserved.",
      );
    }
    if (
      metadata.ownerAvailable != null &&
      typeof metadata.ownerAvailable !== "boolean"
    ) {
      throw new Error(
        "The sync result contained invalid item metadata. The previous snapshot was preserved.",
      );
    }
    for (const field of [
      "configuredBy",
      "modifiedBy",
      "modifiedDateTime",
    ] as const) {
      if (!optionalText(metadata[field])) {
        throw new Error(
          "The sync result contained invalid item metadata. The previous snapshot was preserved.",
        );
      }
    }
    for (const field of ["owner", "endorsement", "sensitivity"] as const) {
      if (metadata[field] != null && !isRecord(metadata[field])) {
        throw new Error(
          "The sync result contained invalid item metadata. The previous snapshot was preserved.",
        );
      }
    }
    if (
      (isRecord(metadata.owner) &&
        (!optionalText(metadata.owner.principalId) ||
          !optionalText(metadata.owner.displayName) ||
          !optionalText(metadata.owner.email) ||
          !optionalText(metadata.owner.source))) ||
      (isRecord(metadata.endorsement) &&
        (!optionalText(metadata.endorsement.value) ||
          !optionalText(metadata.endorsement.certifiedBy))) ||
      (isRecord(metadata.sensitivity) &&
        (!optionalText(metadata.sensitivity.labelId) ||
          !optionalText(metadata.sensitivity.displayName)))
    ) {
      throw new Error(
        "The sync result contained invalid item metadata. The previous snapshot was preserved.",
      );
    }
    if (
      metadata.tags != null &&
      (!Array.isArray(metadata.tags) ||
        metadata.tags.some(
          (tag) =>
            !isRecord(tag) ||
            !optionalText(tag.id) ||
            !optionalText(tag.displayName),
        ))
    ) {
      throw new Error(
        "The sync result contained invalid item metadata. The previous snapshot was preserved.",
      );
    }
  }
}

function validatedSyncSections(
  sections: RawSync["sections"],
): WorkspaceInfo["syncSections"] {
  if (!sections) return undefined;
  if (Array.isArray(sections) || typeof sections !== "object") {
    throw new Error(
      "The sync result contained invalid section status. The previous snapshot was preserved.",
    );
  }
  const result: NonNullable<WorkspaceInfo["syncSections"]> = {};
  for (const [name, section] of Object.entries(sections)) {
    if (
      !section ||
      typeof section !== "object" ||
      (section.status !== "complete" &&
        section.status !== "unsupported" &&
        section.status !== "failed")
    ) {
      throw new Error(
        "The sync result contained invalid section status. The previous snapshot was preserved.",
      );
    }
    result[name] = {
      status: section.status,
      code: realText(section.code),
    };
  }
  return result;
}

export function syncDeadlineExceeded(raw: RawSync): boolean {
  const retryCodes = new Set([
    "deadline-exhausted",
    "request-timeout",
    "retry-after-deferred",
  ]);
  return (
    raw.errors?.some(
      (error) =>
        typeof error === "string" &&
        [...retryCodes].some((code) => error.includes(code)),
    ) === true ||
    Object.values(raw.sections ?? {}).some(
      (section) => !!section?.code && retryCodes.has(section.code),
    ) ||
    Object.values(raw.capabilities ?? {}).some(
      (section) => !!section?.code && retryCodes.has(section.code),
    )
  );
}

const REQUIRED_ARRAYS = [
  "items",
  "roleAssignments",
  "jobs",
  "lineage",
  "access",
  "config",
] as const;

const REQUIRED_V2_SECTIONS = [
  "workspace",
  "items",
  "roleAssignments",
  "scanner",
  "schema",
  "lineage",
  "access",
  "config",
] as const;
const MAX_SYNC_RESPONSE_BYTES = 26 * 1024 * 1024;

export function parseSyncResponseText(
  text: string,
  maxBytes = MAX_SYNC_RESPONSE_BYTES,
): RawSync {
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new Error(
      "Fabric returned a sync payload that exceeded the Atlas safety limit. The previous snapshot was preserved.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      "Fabric returned an invalid sync response. The previous snapshot was preserved.",
    );
  }
  if (!isRecord(json)) {
    throw new Error(
      "Fabric returned an invalid sync response. The previous snapshot was preserved.",
    );
  }
  return (json.output ?? json.body ?? json) as RawSync;
}

export async function readBoundedResponseText(
  response: Response,
  maxBytes = MAX_SYNC_RESPONSE_BYTES,
): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error(
        "Fabric returned a sync payload that exceeded the Atlas safety limit. The previous snapshot was preserved.",
      );
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(
        "Fabric returned a sync payload that exceeded the Atlas safety limit. The previous snapshot was preserved.",
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function validateRawSync(
  raw: RawSync,
  expectedWorkspaceId: string,
): void {
  if (
    raw.schemaVersion != null &&
    raw.schemaVersion !== 1 &&
    raw.schemaVersion !== 2
  ) {
    throw new Error(
      "The sync result used an unsupported schema version. The previous snapshot was preserved.",
    );
  }
  const sections = validatedSyncSections(raw.sections);
  const capabilities = validatedSyncSections(raw.capabilities);
  if (!Array.isArray(raw.errors)) {
    throw new Error(
      "The sync result did not include completion status. The previous snapshot was preserved.",
    );
  }
  if (raw.errors.some((error) => typeof error !== "string")) {
    throw new Error(
      "The sync result contained invalid completion status. The previous snapshot was preserved.",
    );
  }
  if (syncDeadlineExceeded(raw)) {
    throw new Error(
      "Fabric metadata discovery reached its safe execution budget before the workspace was complete. The previous snapshot was preserved.",
    );
  }
  if (raw.schemaVersion === 2) {
    if (!sections) {
      throw new Error(
        "The sync result did not include section status. The previous snapshot was preserved.",
      );
    }
    if (
      !capabilities ||
      [
        "endorsement",
        "sensitivity",
        "tags",
        "ownership",
      ].some((name) => capabilities[name] == null)
    ) {
      throw new Error(
        "The sync result did not include metadata capability status. The previous snapshot was preserved.",
      );
    }
    const failedRequired = REQUIRED_V2_SECTIONS.filter(
      (name) => sections[name]?.status !== "complete",
    );
    if (failedRequired.length > 0) {
      console.warn(
        "[atlas] Fabric sync returned incomplete required sections",
        failedRequired,
      );
      throw new Error(
        `Fabric returned an incomplete sync (${failedRequired.join(", ")}). The previous snapshot was preserved.`,
      );
    }
  } else if (raw.errors.length > 0) {
    const sources = [
      ...new Set(
        raw.errors.map((error) => String(error).split(":", 1)[0].trim()),
      ),
    ].filter(Boolean);
    console.warn("[atlas] Fabric sync returned incomplete sections", sources);
    throw new Error(
      `Fabric returned an incomplete sync${sources.length ? ` (${sources.join(", ")})` : ""}. The previous snapshot was preserved.`,
    );
  }
  if (!raw.workspace || typeof raw.workspace !== "object") {
    throw new Error(
      "The sync result did not include workspace metadata. The previous snapshot was preserved.",
    );
  }
  const returnedWorkspaceId = normalized(raw.workspace.id);
  if (
    !returnedWorkspaceId ||
    returnedWorkspaceId !== normalized(expectedWorkspaceId)
  ) {
    throw new Error(
      "The sync result was for a different workspace. The previous snapshot was preserved.",
    );
  }
  for (const field of REQUIRED_ARRAYS) {
    if (!Array.isArray(raw[field])) {
      throw new Error(
        `The sync result was missing ${field}. The previous snapshot was preserved.`,
      );
    }
  }
  if (
    raw.roleAssignments?.some(
      (assignment) =>
        !isRecord(assignment) ||
        !realText(assignment.role) ||
        !isRecord(assignment.principal),
    ) === true ||
    raw.lineage?.some(
      (edge) =>
        !isRecord(edge) ||
        !realText(edge.source) ||
        !realText(edge.target) ||
        !optionalText(edge.relation),
    ) === true ||
    raw.access?.some(
      (grant) =>
        !isRecord(grant) ||
        !optionalText(grant.itemId) ||
        !optionalText(grant.principalId) ||
        !optionalText(grant.principalName) ||
        !optionalText(grant.principalEmail) ||
        !optionalText(grant.principalType) ||
        !optionalText(grant.userType) ||
        (grant.tenantWide != null &&
          typeof grant.tenantWide !== "boolean") ||
        !optionalText(grant.accessRight) ||
        (!realText(grant.principalId) &&
          !realText(grant.principalName) &&
          !realText(grant.principalEmail) &&
          grant.tenantWide !== true),
    ) === true ||
    raw.config?.some(
      (entry) =>
        !isRecord(entry) ||
        !realText(entry.itemId) ||
        !realText(entry.section) ||
        !realText(entry.label) ||
        !optionalText(entry.value),
    ) === true ||
    raw.jobs?.some(
      (job) =>
        !isRecord(job) ||
        !realText(job.itemId) ||
        !realText(job.jobType) ||
        !realText(job.status) ||
        (job.startTimeUtc != null &&
          normalizeFabricTimestamp(job.startTimeUtc) == null) ||
        (job.endTimeUtc != null &&
          normalizeFabricTimestamp(job.endTimeUtc) == null),
    ) === true
  ) {
    throw new Error(
      "The sync result contained malformed section records. The previous snapshot was preserved.",
    );
  }
  if (!Array.isArray(raw.items) || !Array.isArray(raw.roleAssignments)) {
    throw new Error(
      "The sync result was missing mandatory catalog data. The previous snapshot was preserved.",
    );
  }
  if (raw.roleAssignments.length === 0) {
    throw new Error(
      "Fabric returned no workspace role assignments. The previous snapshot was preserved.",
    );
  }
  if (!raw.schema || typeof raw.schema !== "object" || Array.isArray(raw.schema)) {
    throw new Error(
      "The sync result was missing object schema. The previous snapshot was preserved.",
    );
  }
  const itemIds = raw.items.map((item) => realText(item?.id));
  const invalidItem = raw.items.some((item) => {
    const itemType = realText(item?.type);
    return (
      !item ||
      typeof item !== "object" ||
      !realText(item.id) ||
      !itemType ||
      itemType.toLowerCase() === "item"
    );
  });
  if (invalidItem) {
    throw new Error(
      "Fabric returned invalid workspace item metadata. The previous snapshot was preserved.",
    );
  }
  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error(
      "Fabric returned duplicate workspace item IDs. The previous snapshot was preserved.",
    );
  }
  validateItemMetadata(
    raw.itemMetadata,
    new Set(itemIds.filter((id): id is string => !!id)),
  );
  const itemTypeById = new Map(
    raw.items.map((item) => [
      realText(item.id) ?? "",
      realText(item.type) ?? "",
    ]),
  );
  if (raw.artifactMetadata != null) {
    if (!isRecord(raw.artifactMetadata)) {
      throw new Error(
        "The sync result contained invalid artifact metadata. The previous snapshot was preserved.",
      );
    }
    for (const [itemId, metadata] of Object.entries(raw.artifactMetadata)) {
      const itemType = itemTypeById.get(itemId);
      if (!itemType || !parseFabricItemMetadata(itemType, metadata)) {
        throw new Error(
          "The sync result contained invalid artifact metadata. The previous snapshot was preserved.",
        );
      }
    }
  }
  const rawObjectLineage = raw.objectEdges ?? raw.objectLineage;
  if (
    rawObjectLineage != null &&
    !parseObjectLineagePayload(rawObjectLineage)
  ) {
    throw new Error(
      "The sync result contained invalid object lineage. The previous snapshot was preserved.",
    );
  }
  if (
    raw.schemaVersion === 2 &&
    (!raw.itemMetadata ||
      itemIds.some((itemId) => {
        if (!itemId) return true;
        const metadata = raw.itemMetadata?.[itemId];
        return (
          !metadata ||
          typeof metadata.scannerMatched !== "boolean"
        );
      }))
  ) {
    throw new Error(
      "The sync result did not include complete item metadata status. The previous snapshot was preserved.",
    );
  }
  for (const [itemId, tables] of Object.entries(raw.schema)) {
    if (!itemIds.includes(itemId) || !Array.isArray(tables)) {
      throw new Error(
        "The sync result contained invalid object schema. The previous snapshot was preserved.",
      );
    }
    for (const table of tables) {
      if (!table || typeof table !== "object" || !realText(table.name)) {
        throw new Error(
          "The sync result contained invalid object schema. The previous snapshot was preserved.",
        );
      }
      if (
        table.rows != null &&
        finiteRowCount(table.rows) == null
      ) {
        throw new Error(
          "The sync result contained a non-numeric row count. The previous snapshot was preserved.",
        );
      }
      if (
        !Array.isArray(table.columns) ||
        !Array.isArray(table.measures)
      ) {
        throw new Error(
          "The sync result contained invalid object schema. The previous snapshot was preserved.",
        );
      }
      if (
        table.columns.some(
          (column) =>
            !isRecord(column) ||
            !realText(column.name) ||
            !optionalText(column.dataType) ||
            !optionalText(column.objectType) ||
            !optionalText(column.description) ||
            (column.isHidden != null &&
              typeof column.isHidden !== "boolean"),
        ) ||
        table.measures.some(
          (measure) =>
            !isRecord(measure) ||
            !realText(measure.name) ||
            !optionalText(measure.expression) ||
            !optionalText(measure.expr) ||
            !optionalText(measure.description) ||
            (measure.isHidden != null &&
              typeof measure.isHidden !== "boolean"),
        )
      ) {
        throw new Error(
          "The sync result contained invalid object schema. The previous snapshot was preserved.",
        );
      }
    }
  }
}

export function validateSyncEnrichment(
  raw: RawSync,
  expectedItemIds: string[],
): void {
  if (
    raw.schemaVersion !== 2 ||
    raw.syncMode !== "enrichment" ||
    !Array.isArray(raw.requestedItemIds) ||
    !Array.isArray(raw.completedItemIds) ||
    !Array.isArray(raw.remainingItemIds) ||
    !raw.requestedItemIds.every((value) => typeof value === "string") ||
    !raw.completedItemIds.every((value) => typeof value === "string") ||
    !raw.remainingItemIds.every((value) => typeof value === "string")
  ) {
    throw new Error(
      "Fabric returned an invalid resumable sync response. The previous snapshot was preserved.",
    );
  }
  const expected = new Set(expectedItemIds);
  const requested = new Set(raw.requestedItemIds);
  const completed = new Set(raw.completedItemIds);
  const remaining = new Set(raw.remainingItemIds);
  const returned = new Set([...completed, ...remaining]);
  if (
    requested.size !== expectedItemIds.length ||
    completed.size !== raw.completedItemIds.length ||
    remaining.size !== raw.remainingItemIds.length ||
    [...expected].some((itemId) => !requested.has(itemId)) ||
    [...requested].some((itemId) => !expected.has(itemId)) ||
    [...completed].some((itemId) => remaining.has(itemId)) ||
    returned.size !== expected.size ||
    [...expected].some((itemId) => !returned.has(itemId)) ||
    !Array.isArray(raw.jobs) ||
    !Array.isArray(raw.lineage) ||
    !Array.isArray(raw.config) ||
    !isRecord(raw.schema) ||
    !isRecord(raw.artifactMetadata) ||
    !isRecord(raw.itemMetadata) ||
    (raw.itemFailures != null && !isRecord(raw.itemFailures)) ||
    !Array.isArray(raw.objectEdges) ||
    !Array.isArray(raw.errors) ||
    raw.errors.some((error) => typeof error !== "string")
  ) {
    throw new Error(
      "Fabric returned an invalid resumable sync response. The previous snapshot was preserved.",
    );
  }
  if (Object.keys(raw.itemFailures ?? {}).length > 0) {
    throw new Error(
      "Fabric could not enrich every requested item. The previous snapshot was preserved.",
    );
  }
  if (syncDeadlineExceeded(raw)) {
    throw new Error(
      "Fabric returned an invalid resumable sync deadline state. The previous snapshot was preserved.",
    );
  }
  if (!parseObjectLineagePayload(raw.objectEdges)) {
    throw new Error(
      "Fabric returned invalid resumable object lineage. The previous snapshot was preserved.",
    );
  }
}

export function isSyncConfigured(): boolean {
  return !!getUdfUrl();
}

export function isUdfTimeoutFailure(status: number, body: string): boolean {
  return (
    status === 408 ||
    status === 504 ||
    /UserDataFunctionTimeoutError|exceeded the timeout limit|function timed out/i.test(
      body,
    )
  );
}

function retargetSyncFunction(url: string, functionName: string): string {
  return url.replace(
    /\/(ping|sync_all|sync_items)(\/|:|\?|$)/i,
    `/${functionName}$2`,
  );
}

type RetryableSyncSliceReason = "timeout" | "response-size";

class RetryableSyncSliceError extends Error {
  constructor(
    readonly reason: RetryableSyncSliceReason,
    message: string,
  ) {
    super(message);
  }
}

export class SyncCancelledError extends Error {}

const MAX_BASE_SLICE_ATTEMPTS = 4;
const MAX_SINGLE_ITEM_SLICE_ATTEMPTS = 6;
const SYNC_SLICE_TIMEOUT_MS = 195_000;
const TOKEN_REFRESH_WINDOW_MS = 5 * 60_000;

function assertSyncActive(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SyncCancelledError("Synchronization cancelled.");
  }
}

function tokenExpiryMs(token: string): number | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")),
    ) as { exp?: unknown };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

export function tokenNeedsRefresh(
  token: string,
  now = Date.now(),
): boolean {
  const expiresAt = tokenExpiryMs(token);
  return expiresAt != null && expiresAt - now <= TOKEN_REFRESH_WINDOW_MS;
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new SyncCancelledError("Synchronization cancelled."));
      return;
    }
    const complete = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = window.setTimeout(complete, milliseconds);
    const cancel = () => {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(new SyncCancelledError("Synchronization cancelled."));
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}


function syncItemTypeLabel(itemType: string): string {
  return (
    {
      SQLDatabase: "SQL Database",
      KQLDatabase: "KQL Database",
      SemanticModel: "Semantic Model",
      DataAgent: "Data Agent",
      GraphModel: "Graph Model",
      KQLQueryset: "KQL Queryset",
      KQLDashboard: "KQL Dashboard",
    }[itemType] ?? itemType
  );
}

async function invokeSyncFunctionSlice(
  baseUrl: string,
  functionName: "sync_all" | "sync_items",
  workspaceId: string,
  tokens: SyncRequestTokens,
  parameters: Partial<SyncRequestTokens>,
  signal?: AbortSignal,
): Promise<RawSync> {
  assertSyncActive(signal);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SYNC_SLICE_TIMEOUT_MS);
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const response = await fetch(
      retargetSyncFunction(baseUrl, functionName),
      {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${tokens.fabricToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildSyncRequestBody(workspaceId, {
            ...tokens,
            ...parameters,
          }),
        ),
      },
    );
    if (!response.ok) {
      console.warn("[atlas] resumable UDF invocation failed", response.status);
      const body = await readBoundedResponseText(response, 64 * 1024).catch(
        () => "",
      );
      if (isUdfTimeoutFailure(response.status, body)) {
        throw new RetryableSyncSliceError(
          "timeout",
          "The Fabric metadata slice must be resumed.",
        );
      }
      if (
        /ResponseSizeExceeded|response exceeded the safe size limit/i.test(
          body,
        )
      ) {
        throw new RetryableSyncSliceError(
          "response-size",
          "The Fabric metadata slice exceeded the safe response size.",
        );
      }
      throw new Error(
        `Fabric synchronization failed (HTTP ${response.status}). The previous snapshot was preserved.`,
      );
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_SYNC_RESPONSE_BYTES
    ) {
      throw new RetryableSyncSliceError(
        "response-size",
        "The Fabric metadata slice exceeded the safe response size.",
      );
    }
    const parsed = parseSyncResponseText(
      await readBoundedResponseText(response),
    );
    if (
      tokens.correlationId &&
      parsed.correlationId !== tokens.correlationId
    ) {
      throw new Error(
        "Fabric returned a sync response with an invalid correlation ID. The previous snapshot was preserved.",
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof RetryableSyncSliceError) throw error;
    if (signal?.aborted) {
      throw new SyncCancelledError("Synchronization cancelled.");
    }
    if (
      timedOut ||
      (error instanceof DOMException && error.name === "AbortError")
    ) {
      throw new RetryableSyncSliceError(
        "timeout",
        "The Fabric metadata slice exceeded the browser deadline.",
      );
    }
    if (
      error instanceof Error &&
      /exceeded the Atlas safety limit/i.test(error.message)
    ) {
      throw new RetryableSyncSliceError(
        "response-size",
        "The Fabric metadata slice exceeded the safe response size.",
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}

async function invokeSyncItemSlice(
  baseUrl: string,
  workspaceId: string,
  tokens: SyncRequestTokens,
  batch: SyncItemBatch,
  signal?: AbortSignal,
): Promise<RawSync> {
  return invokeSyncFunctionSlice(
    baseUrl,
    "sync_items",
    workspaceId,
    tokens,
    { itemIds: JSON.stringify(batch.itemIds) },
    signal,
  );
}

export async function invokeSyncAll(
  workspaceId: string,
  identity: SyncIdentity,
  reportProgress?: (progress: number, stage: string) => void,
  signal?: AbortSignal,
  correlationId?: string,
): Promise<RawSync> {
  const raw = getUdfUrl();
  if (!raw) {
    throw new Error(
      "Sync endpoint not configured yet — publish the atlas_sync_functions UDF and paste its invoke URL.",
    );
  }
  const url = retargetSyncFunction(
    validateUdfUrl(raw, workspaceId),
    "sync_all",
  );
  assertSyncActive(signal);
  reportProgress?.(5, "Authorizing Fabric metadata access");
  const fabricToken = await acquireFabricSyncToken(identity, true, signal);
  const metadataTokens = await acquireOptionalMetadataTokens(
    identity,
    true,
    signal,
  );
  let tokens: SyncRequestTokens = {
    fabricToken,
    ...metadataTokens,
    correlationId,
  };
  let baseAttempt = 0;
  let result: RawSync;
  while (true) {
    assertSyncActive(signal);
    if (baseAttempt > 0) {
      tokens = await renewSyncTokens(identity, tokens, signal);
    }
    reportProgress?.(
      8,
      baseAttempt === 0
        ? "Discovering workspace topology"
        : "Continuing workspace topology in a fresh Fabric function slice",
    );
    try {
      result = await invokeSyncFunctionSlice(
        url,
        "sync_all",
        workspaceId,
        tokens,
        { deferEnrichment: "true" },
        signal,
      );
    } catch (error) {
      if (!(error instanceof RetryableSyncSliceError)) throw error;
      baseAttempt += 1;
      if (
        error.reason === "response-size" ||
        baseAttempt >= MAX_BASE_SLICE_ATTEMPTS
      ) {
        throw new Error(
          "Fabric could not return the authoritative workspace topology within a safe function slice. The previous snapshot was preserved.",
        );
      }
      await abortableDelay(
        Math.min(10_000, 1_000 * 2 ** Math.min(baseAttempt, 3)),
        signal,
      );
      continue;
    }
    if (!syncDeadlineExceeded(result)) break;
    baseAttempt += 1;
    if (baseAttempt >= MAX_BASE_SLICE_ATTEMPTS) {
      throw new Error(
        "Fabric could not complete the authoritative workspace topology after multiple function slices. The previous snapshot was preserved.",
      );
    }
    await abortableDelay(
      Math.min(10_000, 1_000 * 2 ** Math.min(baseAttempt, 3)),
      signal,
    );
  }
  assertSyncActive(signal);
  validateRawSync(result, workspaceId);
  if (result.syncMode !== "base") {
    reportProgress?.(60, "Deep workspace discovery complete");
    return result;
  }
  if (!Array.isArray(result.enrichmentItemIds)) {
    throw new Error(
      "Fabric did not return the resumable enrichment plan. The previous snapshot was preserved.",
    );
  }
  reportProgress?.(20, "Workspace topology received");

  const enrichmentItemIds = new Set(
    (result.enrichmentItemIds ?? [])
      .map((itemId) => realText(itemId))
      .filter((itemId): itemId is string => !!itemId),
  );
  const batches = buildSyncItemBatches(
    (result.items ?? []).filter((item) => {
      const itemId = realText(item.id);
      return itemId && enrichmentItemIds.has(itemId);
    }),
  );
  const totalItems = enrichmentItemIds.size;
  if (totalItems !== (result.items ?? []).length) {
    throw new Error(
      "Fabric returned an incomplete resumable enrichment plan. The previous snapshot was preserved.",
    );
  }
  const completedItemIds = new Set<string>();
  let merged = result;

  while (batches.length > 0) {
    assertSyncActive(signal);
    const next = batches.shift()!;
    const itemIds = next.itemIds.filter(
      (itemId) => !completedItemIds.has(itemId),
    );
    if (itemIds.length === 0) continue;
    const batch = { ...next, itemIds };
    const label = syncItemTypeLabel(batch.itemType);
    reportProgress?.(
      20 + Math.floor((completedItemIds.size / Math.max(1, totalItems)) * 40),
      `Discovering ${label} metadata (${completedItemIds.size}/${totalItems})`,
    );

    let enrichment: RawSync;
    try {
      tokens = await renewSyncTokens(identity, tokens, signal);
      enrichment = await invokeSyncItemSlice(
        raw,
        workspaceId,
        tokens,
        batch,
        signal,
      );
    } catch (error) {
      if (!(error instanceof RetryableSyncSliceError)) throw error;
      if (itemIds.length > 1) {
        const middle = Math.ceil(itemIds.length / 2);
        batches.push(
          {
            ...batch,
            itemIds: itemIds.slice(0, middle),
            attempt: batch.attempt + 1,
          },
          {
            ...batch,
            itemIds: itemIds.slice(middle),
            attempt: batch.attempt + 1,
          },
        );
      } else {
        if (
          error.reason === "response-size" ||
          batch.attempt + 1 >= MAX_SINGLE_ITEM_SLICE_ATTEMPTS
        ) {
          throw new Error(
            `${label} metadata for one item could not complete within safe Fabric function slices. The previous snapshot was preserved.`,
          );
        }
        reportProgress?.(
          20 +
            Math.floor(
              (completedItemIds.size / Math.max(1, totalItems)) * 40,
            ),
          `Continuing ${label} item in a fresh Fabric function slice`,
        );
        await abortableDelay(
          Math.min(10_000, 1_000 * 2 ** Math.min(batch.attempt, 3)),
          signal,
        );
        batches.push({ ...batch, attempt: batch.attempt + 1 });
      }
      continue;
    }

    validateSyncEnrichment(enrichment, itemIds);
    merged = mergeSyncEnrichment(merged, enrichment);
    for (const itemId of enrichment.completedItemIds ?? []) {
      completedItemIds.add(itemId);
    }
    const remainingItemIds = (enrichment.remainingItemIds ?? []).filter(
      (itemId) => !completedItemIds.has(itemId),
    );
    if (remainingItemIds.length > 0) {
      if (
        (enrichment.completedItemIds?.length ?? 0) === 0 &&
        remainingItemIds.length > 1
      ) {
        const middle = Math.ceil(remainingItemIds.length / 2);
        batches.push(
          {
            ...batch,
            itemIds: remainingItemIds.slice(0, middle),
            attempt: batch.attempt + 1,
          },
          {
            ...batch,
            itemIds: remainingItemIds.slice(middle),
            attempt: batch.attempt + 1,
          },
        );
      } else if ((enrichment.completedItemIds?.length ?? 0) === 0) {
        if (batch.attempt + 1 >= MAX_SINGLE_ITEM_SLICE_ATTEMPTS) {
          throw new Error(
            `${label} metadata for one item made no progress across multiple Fabric function slices. The previous snapshot was preserved.`,
          );
        }
        reportProgress?.(
          20 +
            Math.floor(
              (completedItemIds.size / Math.max(1, totalItems)) * 40,
            ),
          `Continuing ${label} item in a fresh Fabric function slice`,
        );
        await abortableDelay(
          Math.min(10_000, 1_000 * 2 ** Math.min(batch.attempt, 3)),
          signal,
        );
        batches.push({
          ...batch,
          itemIds: remainingItemIds,
          attempt: batch.attempt + 1,
        });
      } else {
        batches.push({
          ...batch,
          itemIds: remainingItemIds,
          attempt: 0,
        });
      }
    }
  }

  if (completedItemIds.size !== totalItems) {
    throw new Error(
      "Fabric did not complete every resumable metadata slice. The previous snapshot was preserved.",
    );
  }
  merged = {
    ...merged,
    syncMode: "complete",
    enrichmentItemIds: undefined,
    requestedItemIds: undefined,
    completedItemIds: undefined,
    remainingItemIds: undefined,
  };
  reportProgress?.(60, "Deep workspace discovery complete");
  assertSyncActive(signal);
  validateRawSync(merged, workspaceId);
  return merged;
}

/* ------------------------------ mapping -------------------------------- */

const ROLE_TO_ACCESS: Record<string, "owner" | "edit" | "view"> = {
  Admin: "owner",
  Member: "edit",
  Contributor: "edit",
  Viewer: "view",
};

export function toItemType(t: unknown): ItemType | null {
  // Keep every real workspace item; unknown types render with a neutral glyph.
  const value = realText(t);
  return value && value.toLowerCase() !== "item"
    ? (value as ItemType)
    : null;
}

function jobStatus(s: unknown): Job["status"] {
  const v = String(s ?? "").toLowerCase();
  if (v === "completed") return "completed";
  if (v === "failed" || v === "deduped") return "failed";
  if (v.includes("progress") || v === "notstarted") return "running";
  return "cancelled";
}

function accessLevelFrom(ar?: string | null): AccessLevel {
  const s = (ar || "").toLowerCase();
  if (s.includes("owner")) return "owner";
  if (s.includes("write")) return "edit";
  if (s.includes("read")) return "view";
  return "none";
}

function externalIdentityState(
  userType: unknown,
  principalType: unknown,
  email: string | undefined,
): boolean | undefined {
  const normalizedUserType = normalized(userType);
  const normalizedPrincipalType = normalized(principalType);
  if (
    normalizedUserType === "guest" ||
    normalizedUserType === "external" ||
    normalizedPrincipalType === "guest"
  ) {
    return true;
  }
  if (
    normalizedUserType === "member" ||
    normalizedUserType === "internal"
  ) {
    return false;
  }
  if (email?.toUpperCase().includes("#EXT#")) return true;
  return undefined;
}

function canonicalPrincipalId(value: unknown): string | undefined {
  const text = realText(value);
  if (!text) return undefined;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text,
  ) || text.includes("@")
    ? text.toLowerCase()
    : text;
}

export function mapSyncToAtlas(raw: RawSync, fallback: WorkspaceInfo): AtlasData {
  const syncSections = validatedSyncSections(raw.sections);
  const metadataCapabilities = validatedSyncSections(raw.capabilities);
  const items: Item[] = (raw.items ?? [])
    .map((it): Item | null => {
      const fabricId = realText(it.id);
      const type = toItemType(it.type);
      if (!fabricId || !type) {
        throw new Error("Cannot map malformed Fabric item metadata.");
      }
      const metadata = raw.itemMetadata?.[fabricId];
      const scannerMatched = metadata?.scannerMatched;
      const tagEntries = Array.isArray(metadata?.tags)
        ? metadata.tags
        : [];
      const endorsementRaw = realText(
        metadata?.endorsement?.value,
      );
      const sensitivityLabelId = realText(
        metadata?.sensitivity?.labelId,
      );
      const sensitivity = realText(
        metadata?.sensitivity?.displayName,
      );
      const ownerName = realText(metadata?.owner?.displayName);
      const ownerEmail = realText(metadata?.owner?.email);
      return {
        fabricId,
        displayName: realText(it.displayName) ?? fabricId,
        itemType: type,
        description: realText(it.description),
        ownerName,
        ownerEmail,
        configuredBy: realText(metadata?.configuredBy),
        modifiedBy: realText(metadata?.modifiedBy),
        health: "unknown" as Health,
        endorsement: itemEndorsement(endorsementRaw),
        endorsementRaw,
        endorsementBy: realText(metadata?.endorsement?.certifiedBy),
        sensitivity,
        sensitivityLabelId,
        tags: tagEntries
          .map((tag) => realText(tag.displayName))
          .filter((tag): tag is string => !!tag),
        tagIds: tagEntries
          .map((tag) => realText(tag.id))
          .filter((tag): tag is string => !!tag),
        ownerMetadataAvailable:
          metadata == null
            ? undefined
            : metadataCapabilities?.ownership?.status === "complete"
              ? metadata.ownerAvailable ??
                metadata.owner != null
              : false,
        sensitivityMetadataAvailable:
          metadata == null
            ? undefined
            : scannerMatched === true &&
              (metadataCapabilities?.sensitivity?.status ?? "complete") ===
                "complete",
        endorsementMetadataAvailable:
          metadata == null
            ? undefined
            : scannerMatched === true &&
              (metadataCapabilities?.endorsement?.status ?? "complete") ===
                "complete",
        tagMetadataAvailable:
          metadata == null
            ? undefined
            : scannerMatched === true &&
              (metadataCapabilities?.tags?.status ?? "complete") ===
                "complete",
        updatedAt: normalizeFabricTimestamp(metadata?.modifiedDateTime),
      };
    })
    .filter((x): x is Item => x !== null);

  const itemIds = new Set(items.map((i) => i.fabricId));

  const jobs: Job[] = (raw.jobs ?? []).map((j) => {
    const start = normalizeFabricTimestamp(j.startTimeUtc);
    const end = normalizeFabricTimestamp(j.endTimeUtc);
    return {
      itemFabricId: String(j.itemId ?? ""),
      itemName: String(j.itemDisplayName ?? j.itemId ?? ""),
      jobType: String(j.jobType ?? "Job"),
      status: jobStatus(j.status),
      startedAt: start ?? new Date(0).toISOString(),
      durationSec:
        start && end
          ? Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000))
          : 0,
    };
  });

  // Roll job outcomes up into per-item health.
  const byItem = new Map<string, Job[]>();
  for (const j of jobs) {
    const a = byItem.get(j.itemFabricId) ?? [];
    a.push(j);
    byItem.set(j.itemFabricId, a);
  }
  for (const it of items) {
    const js = byItem.get(it.fabricId) ?? [];
    if (js.some((j) => j.status === "failed")) it.health = "failing";
    else if (js.some((j) => j.status === "completed")) {
      it.health = "healthy";
      it.lastRefresh = js[0].startedAt;
    }
  }

  // Workspace users + their access, from role assignments.
  const principals: Principal[] = [];
  const grants: Grant[] = [];
  const principalsById = new Map<string, Principal>();
  const upsertPrincipal = (principal: Principal): Principal => {
    const canonicalId =
      canonicalPrincipalId(principal.principalId) ??
      principal.principalId;
    principal.principalId = canonicalId;
    const key = normalized(canonicalId);
    const existing = principalsById.get(key);
    if (existing) {
      if (!existing.email && principal.email) existing.email = principal.email;
      if (principal.external === true) existing.external = true;
      else if (
        existing.external == null &&
        principal.external === false
      ) {
        existing.external = false;
      }
      return existing;
    }
    principalsById.set(key, principal);
    principals.push(principal);
    return principal;
  };
  for (const ra of raw.roleAssignments ?? []) {
    const p = (ra.principal ?? {}) as Record<string, unknown>;
    const details = (p.userDetails ?? {}) as Record<string, unknown>;
    const email = details.userPrincipalName as string | undefined;
    const external = externalIdentityState(
      details.userType ?? p.userType,
      p.type,
      email,
    );
    const kind: PrincipalKind =
      p.type === "Group"
        ? "group"
        : p.type === "ServicePrincipal"
          ? "servicePrincipal"
          : external === true
            ? "guest"
            : "user";
    const name = String(p.displayName ?? email ?? p.id ?? "Unknown");
    const principalId =
      canonicalPrincipalId(p.id ?? email ?? name) ?? name;
    const role = String(ra.role ?? "Viewer") as WorkspaceRole;
    upsertPrincipal({
      principalId,
      displayName: name,
      kind,
      email,
      external,
      workspaceRole: role,
    });
    grants.push({
      principalRef: principalId,
      accessLevel: ROLE_TO_ACCESS[role] ?? "view",
      source: "workspaceRole",
      roleName: role,
      flag:
        role === "Admin"
          ? "admin"
          : kind === "servicePrincipal"
            ? "servicePrincipal"
            : external === true
              ? "external"
              : undefined,
    });
  }

  // Per-item access from the scanner (who can see each item, beyond workspace roles).
  for (const g of raw.access ?? []) {
    const tenantWide =
      g.tenantWide === true ||
      normalized(g.principalType) === "entiretenant" ||
      normalized(g.principalType) === "none";
    const name = tenantWide
      ? "Entire tenant"
      : String(g.principalName || g.principalEmail || "Unknown");
    const email = g.principalEmail;
    const external = externalIdentityState(
      g.userType,
      g.principalType,
      email,
    );
    const kind: PrincipalKind =
      tenantWide || g.principalType === "Group"
        ? "group"
        : g.principalType === "App" || g.principalType === "ServicePrincipal"
          ? "servicePrincipal"
          : external === true
            ? "guest"
            : "user";
    const explicitPrincipalId = canonicalPrincipalId(g.principalId);
    const existingById = explicitPrincipalId
      ? principalsById.get(normalized(explicitPrincipalId))
      : undefined;
    const emailMatches = email
      ? principals.filter(
          (principal) =>
            normalized(principal.email) === normalized(email),
        )
      : [];
    const nameMatches = principals.filter(
      (principal) =>
        normalized(principal.displayName) === normalized(name),
    );
    const principalId =
      existingById?.principalId ??
      explicitPrincipalId ??
      (emailMatches.length === 1
        ? emailMatches[0].principalId
        : undefined) ??
      (nameMatches.length === 1
        ? nameMatches[0].principalId
        : undefined) ??
      canonicalPrincipalId(email) ??
      (tenantWide ? "entire-tenant" : name);
    upsertPrincipal({
      principalId,
      displayName: name,
      kind,
      email: email || undefined,
      external,
      workspaceRole: "Viewer",
    });
    if (g.itemId && itemIds.has(g.itemId)) {
      grants.push({
        itemFabricId: g.itemId,
        principalRef: principalId,
        accessLevel: accessLevelFrom(g.accessRight),
        source: "directShare",
        roleName: g.accessRight || undefined,
        flag: tenantWide
          ? "broad"
          : external === true
            ? "external"
            : kind === "servicePrincipal"
              ? "servicePrincipal"
              : undefined,
      });
    }
  }

  // Real lineage is computed from Fabric identifiers and sanitized definitions.
  // An absent edge is safer than inferring a relationship from display names.
  const edges: Edge[] = [];
  if (Array.isArray(raw.lineage) && raw.lineage.length) {
    for (const e of raw.lineage) {
      if (e.source && e.target && itemIds.has(e.source) && itemIds.has(e.target)) {
        edges.push({ source: e.source, target: e.target, relation: e.relation || "depends on" });
      }
    }
  }

  const config: ConfigKV[] = (raw.config ?? [])
    .filter((c) => !!c.itemId && itemIds.has(c.itemId))
    .map((c) => ({
      itemFabricId: String(c.itemId),
      section: String(c.section || "General"),
      label: String(c.label || ""),
      value: String(c.value ?? ""),
    }));

  const schema: Record<string, ModelTableSchema[]> = {};
  const itemsById = new Map(items.map((item) => [item.fabricId, item]));
  for (const [id, tables] of Object.entries(raw.schema ?? {})) {
    if (!itemIds.has(id) || !Array.isArray(tables)) continue;
    const item = itemsById.get(id);
    schema[id] = tables.map((t) => ({
      name: String(t.name ?? ""),
      rows: finiteRowCount(t.rows),
      objectType: t.objectType,
      source: t.source,
      description: t.description,
      isHidden: t.isHidden,
      columns: (t.columns ?? []).map((c) => ({
        name: String(c.name ?? ""),
        dataType: String(c.dataType ?? "column"),
        objectType: c.objectType,
        description: c.description,
        isHidden: c.isHidden,
      })),
      measures: (t.measures ?? []).map((m) => ({
        name: String(m.name ?? ""),
        expr: m.expression ?? m.expr,
        description: m.description,
        isHidden: m.isHidden,
      })),
      metadata:
        item && t.metadata != null
          ? parseFabricItemMetadata(item.itemType, t.metadata)
          : undefined,
    }));
  }

  const itemMetadata: Record<string, FabricItemMetadata> = {};
  const derivedObjectEdges: MetadataObjectLineageEdge[] = [];
  for (const item of items) {
    const nestedMetadata =
      raw.itemMetadata?.[item.fabricId]?.artifactMetadata;
    const rawMetadata =
      raw.artifactMetadata?.[item.fabricId] ?? nestedMetadata;
    const metadata =
      rawMetadata != null
        ? parseFabricItemMetadata(item.itemType, rawMetadata)
        : itemMetadataFromSchema(item.itemType, schema[item.fabricId]);
    if (!metadata) continue;
    itemMetadata[item.fabricId] = metadata;
    const existing = schema[item.fabricId] ?? [];
    const merged = new Map(
      existing.map((table) => [
        `${table.name}\u0000${table.objectType ?? ""}`,
        table,
      ]),
    );
    for (const table of projectItemMetadataToSchema(metadata)) {
      merged.set(`${table.name}\u0000${table.objectType ?? ""}`, table);
    }
    schema[item.fabricId] = [...merged.values()];
    edges.push(
      ...metadataItemLineageEdges(item.fabricId, metadata).filter(
        (edge) => itemIds.has(edge.source) && itemIds.has(edge.target),
      ),
    );
    derivedObjectEdges.push(
      ...metadataObjectLineageEdges(item.fabricId, metadata),
    );
  }
  const suppliedObjectEdges =
    parseObjectLineagePayload(raw.objectEdges ?? raw.objectLineage)
      ?.objectEdges ?? [];
  const allObjectEdges = [...suppliedObjectEdges, ...derivedObjectEdges]
    .sort((left, right) =>
      [
        left.source.itemId,
        left.source.kind,
        left.source.id,
        left.target.itemId,
        left.target.kind,
        left.target.id,
        left.relation,
      ]
        .join("\u0000")
        .localeCompare(
          [
            right.source.itemId,
            right.source.kind,
            right.source.id,
            right.target.itemId,
            right.target.kind,
            right.target.id,
            right.relation,
          ].join("\u0000"),
        ),
    )
    .filter(
      (edge, index, values) =>
        index === 0 ||
        JSON.stringify(edge) !== JSON.stringify(values[index - 1]),
    );
  const ws = (raw.workspace ?? {}) as Record<string, unknown>;
  const workspace: WorkspaceInfo = {
    fabricId: String(ws.id ?? fallback.fabricId),
    displayName: String(ws.displayName ?? fallback.displayName),
    capacity: realText(ws.capacityId) ?? fallback.capacity,
    region: realText(ws.capacityRegion) ?? fallback.region,
    syncedAt: normalizeFabricTimestamp(raw.syncedAt),
    syncSections: {
      ...(syncSections ?? {}),
      ...Object.fromEntries(
        Object.entries(metadataCapabilities ?? {}).map(([name, status]) => [
          `metadata${name[0].toUpperCase()}${name.slice(1)}`,
          status,
        ]),
      ),
    },
  };

  return {
    workspace,
    items,
    edges: normalizeLineageEdges(items, edges),
    principals,
    grants,
    jobs,
    config,
    schema,
    itemMetadata,
    objectEdges: allObjectEdges,
    comments: [],
    syncRuns: [],
  };
}
