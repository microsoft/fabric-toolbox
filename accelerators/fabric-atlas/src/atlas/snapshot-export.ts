import type { AtlasData } from "./model";

// Portable JSON export of one validated snapshot with a manifest. The
// manifest counts mirror the published snapshot manifest and the fingerprint
// detects edits; it is an integrity check, not a cryptographic signature.

export const SNAPSHOT_EXPORT_FORMAT = "fabric-atlas.snapshot";
export const SNAPSHOT_EXPORT_VERSION = 1;
export const SNAPSHOT_FINGERPRINT_ALGORITHM = "cyrb53-canonical-json";

export type SnapshotPayload = Pick<
  AtlasData,
  | "workspace"
  | "items"
  | "edges"
  | "principals"
  | "grants"
  | "jobs"
  | "config"
  | "schema"
  | "semanticModelEvidence"
  | "itemMetadata"
  | "objectEdges"
  | "governanceEvidence"
>;

export interface SnapshotExportCounts {
  items: number;
  edges: number;
  principals: number;
  grants: number;
  jobs: number;
  config: number;
  schemaTables: number;
}

export interface SnapshotExportManifest {
  snapshotId: string | null;
  syncedAt: string | null;
  workspaceId: string;
  workspaceName: string;
  counts: SnapshotExportCounts;
  fingerprint: { algorithm: typeof SNAPSHOT_FINGERPRINT_ALGORITHM; value: string };
}

export interface SnapshotExport {
  format: typeof SNAPSHOT_EXPORT_FORMAT;
  version: typeof SNAPSHOT_EXPORT_VERSION;
  generatedAt: string;
  manifest: SnapshotExportManifest;
  snapshot: SnapshotPayload;
}

/** Snapshot sections only: comments and sync audit rows are not exported. */
export function snapshotPayload(data: AtlasData | SnapshotPayload): SnapshotPayload {
  const payload: SnapshotPayload = {
    workspace: data.workspace,
    items: data.items,
    edges: data.edges,
    principals: data.principals,
    grants: data.grants,
    jobs: data.jobs,
    config: data.config,
  };
  if (data.schema) payload.schema = data.schema;
  if (data.semanticModelEvidence) payload.semanticModelEvidence = data.semanticModelEvidence;
  if (data.itemMetadata) payload.itemMetadata = data.itemMetadata;
  if (data.objectEdges) payload.objectEdges = data.objectEdges;
  if (data.governanceEvidence) payload.governanceEvidence = data.governanceEvidence;
  return payload;
}

export function snapshotCounts(payload: SnapshotPayload): SnapshotExportCounts {
  return {
    items: payload.items.length,
    edges: payload.edges.length,
    principals: payload.principals.length,
    grants: payload.grants.length,
    jobs: payload.jobs.length,
    config: payload.config.length,
    schemaTables: Object.values(payload.schema ?? {}).reduce(
      (total, tables) => total + tables.length,
      0,
    ),
  };
}

/** JSON with sorted object keys so equal snapshots serialize identically. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => (entry === undefined ? "null" : canonicalJson(entry))).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined && typeof entry !== "function")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export function snapshotFingerprint(payload: SnapshotPayload): string {
  return cyrb53(canonicalJson(payload));
}

export function buildSnapshotManifest(data: AtlasData | SnapshotPayload): SnapshotExportManifest {
  const payload = snapshotPayload(data);
  return {
    snapshotId: payload.workspace.snapshotId ?? null,
    syncedAt: payload.workspace.syncedAt ?? null,
    workspaceId: payload.workspace.fabricId,
    workspaceName: payload.workspace.displayName,
    counts: snapshotCounts(payload),
    fingerprint: {
      algorithm: SNAPSHOT_FINGERPRINT_ALGORITHM,
      value: snapshotFingerprint(payload),
    },
  };
}

export function buildSnapshotExport(data: AtlasData, generatedAt: string): SnapshotExport {
  const snapshot = snapshotPayload(data);
  return {
    format: SNAPSHOT_EXPORT_FORMAT,
    version: SNAPSHOT_EXPORT_VERSION,
    generatedAt,
    manifest: buildSnapshotManifest(snapshot),
    snapshot,
  };
}

export class SnapshotExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotExportError";
  }
}

const LIST_SECTIONS = ["items", "edges", "principals", "grants", "jobs", "config"] as const;

/**
 * Parses an exported file and verifies it against its manifest. Any count or
 * fingerprint mismatch rejects the file instead of returning partial data.
 */
export function parseSnapshotExport(json: string): SnapshotExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SnapshotExportError("The file is not valid JSON.");
  }
  const candidate = parsed as Partial<SnapshotExport> | null;
  if (
    !candidate ||
    candidate.format !== SNAPSHOT_EXPORT_FORMAT ||
    candidate.version !== SNAPSHOT_EXPORT_VERSION
  ) {
    throw new SnapshotExportError("The file is not a Fabric Atlas snapshot export (version 1).");
  }
  const snapshot = candidate.snapshot as SnapshotPayload | undefined;
  const manifest = candidate.manifest;
  if (
    !snapshot ||
    !manifest ||
    typeof snapshot.workspace?.fabricId !== "string" ||
    LIST_SECTIONS.some((section) => !Array.isArray(snapshot[section]))
  ) {
    throw new SnapshotExportError("The snapshot export is missing required sections.");
  }
  const counts = snapshotCounts(snapshot);
  for (const [key, value] of Object.entries(counts)) {
    if (manifest.counts?.[key as keyof SnapshotExportCounts] !== value) {
      throw new SnapshotExportError(`Manifest mismatch for ${key}.`);
    }
  }
  if (
    manifest.fingerprint?.algorithm !== SNAPSHOT_FINGERPRINT_ALGORITHM ||
    manifest.fingerprint.value !== snapshotFingerprint(snapshot)
  ) {
    throw new SnapshotExportError("Manifest fingerprint does not match the snapshot content.");
  }
  if (
    manifest.workspaceId !== snapshot.workspace.fabricId ||
    manifest.snapshotId !== (snapshot.workspace.snapshotId ?? null)
  ) {
    throw new SnapshotExportError("Manifest does not describe this snapshot.");
  }
  return candidate as SnapshotExport;
}
