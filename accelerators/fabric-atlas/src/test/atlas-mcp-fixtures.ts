import type { AtlasHistory, HistoricalSnapshot } from "@/atlas/history";
import { buildAtlasHistory, snapshotFromData } from "@/atlas/history";
import type { PersistedItemRelationsEvidence } from "@/atlas/item-relations-evidence-source";
import { AtlasMcpError } from "@/atlas/mcp/contract";
import type { AtlasMcpDataSource } from "@/atlas/mcp/data-source";
import type { AtlasData } from "@/atlas/model";
import type { OperationalIncidentRecord } from "@/atlas/operational-incident-store";
import type { WorkspaceScope } from "@/atlas/workspace-scope";
import type { AccessPolicyEvidence } from "../../rayfin/functions/src/policy-evidence-contract";

// Synthetic Atlas MCP fixtures for tests only; no tenant data.

export const WORKSPACE_ID = "3f2b9c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5b";
export const OTHER_WORKSPACE_ID = "7d8e9f0a-1b2c-4d3e-8f4a-5b6c7d8e9f0a";
export const SNAPSHOT_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
export const PREVIOUS_SNAPSHOT_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
export const SYNCED_AT = "2026-10-02T08:00:00.000Z";
export const PREVIOUS_SYNCED_AT = "2026-10-01T08:00:00.000Z";

export const PIPELINE = "c0000000-0000-4000-8000-000000000001";
export const NOTEBOOK = "c0000000-0000-4000-8000-000000000002";
export const LAKEHOUSE = "c0000000-0000-4000-8000-000000000003";
export const MODEL = "c0000000-0000-4000-8000-000000000004";
export const REPORT = "c0000000-0000-4000-8000-000000000005";
export const ANA = "d0000000-0000-4000-8000-000000000001";
export const READERS = "d0000000-0000-4000-8000-000000000002";
export const GUEST = "d0000000-0000-4000-8000-000000000003";

export function currentSnapshot(): AtlasData {
  return {
    workspace: {
      fabricId: WORKSPACE_ID,
      displayName: "Sales analytics",
      capacity: "F8",
      region: "West Europe",
      deploymentId: "2.0.0:snapshot-v1:test:2026-10-02T00:00:00.000Z",
      snapshotId: SNAPSHOT_ID,
      syncedAt: SYNCED_AT,
      syncSections: {
        workspace: { status: "complete" },
        items: { status: "complete" },
        lineage: { status: "complete" },
        access: { status: "complete" },
        schema: { status: "complete" },
      },
    },
    items: [
      {
        fabricId: PIPELINE,
        displayName: "Nightly load",
        itemType: "DataPipeline",
        health: "healthy",
        endorsement: "none",
        tags: [],
      },
      {
        fabricId: NOTEBOOK,
        displayName: "Load sales",
        itemType: "Notebook",
        health: "failing",
        endorsement: "none",
        tags: [],
      },
      {
        fabricId: LAKEHOUSE,
        displayName: "Sales lakehouse",
        itemType: "Lakehouse",
        description: "Curated sales tables",
        ownerName: "Ana Silva",
        ownerEmail: "ana@contoso.example",
        health: "healthy",
        endorsement: "certified",
        tags: ["finance"],
        ownerMetadataAvailable: true,
        sensitivityMetadataAvailable: false,
      },
      {
        fabricId: MODEL,
        displayName: "Sales model",
        itemType: "SemanticModel",
        health: "healthy",
        endorsement: "promoted",
        sensitivity: "Confidential",
        tags: [],
      },
      {
        fabricId: REPORT,
        displayName: "Sales report",
        itemType: "Report",
        health: "stale",
        endorsement: "none",
        tags: [],
      },
    ],
    edges: [
      { source: PIPELINE, target: NOTEBOOK, relation: "orchestrates" },
      { source: NOTEBOOK, target: LAKEHOUSE, relation: "writes" },
      { source: LAKEHOUSE, target: MODEL, relation: "Direct Lake" },
      { source: MODEL, target: REPORT, relation: "binds", broken: true },
    ],
    principals: [
      {
        principalId: ANA,
        displayName: "Ana Silva",
        kind: "user",
        email: "ana@contoso.example",
        workspaceRole: "Admin",
      },
      {
        principalId: READERS,
        displayName: "Sales readers",
        kind: "group",
        workspaceRole: "Viewer",
      },
      {
        principalId: GUEST,
        displayName: "Partner guest",
        kind: "guest",
        email: "guest@partner.example",
        external: true,
        workspaceRole: "Viewer",
      },
    ],
    grants: [
      {
        principalRef: ANA,
        accessLevel: "owner",
        source: "workspaceRole",
        roleName: "Admin",
        flag: "admin",
      },
      {
        itemFabricId: REPORT,
        principalRef: READERS,
        accessLevel: "view",
        source: "directShare",
      },
      {
        itemFabricId: REPORT,
        principalRef: "guest@partner.example",
        accessLevel: "view",
        source: "directShare",
        flag: "external",
      },
    ],
    jobs: [
      {
        itemFabricId: NOTEBOOK,
        itemName: "Load sales",
        jobType: "Notebook run",
        status: "failed",
        startedAt: "2026-10-02T06:00:00.000Z",
        durationSec: 61,
        message: "Spark session ended",
      },
      {
        itemFabricId: PIPELINE,
        itemName: "Nightly load",
        jobType: "Pipeline run",
        status: "completed",
        startedAt: "2026-10-02T05:00:00.000Z",
        durationSec: 300,
      },
    ],
    config: [
      {
        itemFabricId: LAKEHOUSE,
        section: "Connection",
        label: "Server",
        value: "sales-db.contoso.example",
      },
    ],
    comments: [
      {
        id: "e0000000-0000-4000-8000-000000000001",
        authorId: ANA,
        authorName: "Ana Silva",
        body: "Quarterly freeze plan",
        createdAt: SYNCED_AT,
      },
    ],
    syncRuns: [
      {
        id: "f0000000-0000-4000-8000-000000000002",
        startedAt: "2026-10-02T07:58:00.000Z",
        finishedAt: SYNCED_AT,
        status: "completed",
        itemsSynced: 5,
        durationMs: 120_000,
      },
      {
        id: "f0000000-0000-4000-8000-000000000001",
        startedAt: "2026-10-01T07:50:00.000Z",
        finishedAt: "2026-10-01T07:51:00.000Z",
        status: "failed",
        failureCode: "deadline-exhausted",
        failureMessage: "The previous snapshot was preserved.",
      },
    ],
    schema: {
      [MODEL]: [
        {
          name: "Sales",
          columns: [{ name: "Amount", dataType: "decimal" }],
          measures: [{ name: "Total Sales", expr: "SUM(Sales[Amount])" }],
        },
      ],
    },
  };
}

export function previousSnapshot(): AtlasData {
  const current = currentSnapshot();
  return {
    ...current,
    workspace: {
      ...current.workspace,
      snapshotId: PREVIOUS_SNAPSHOT_ID,
      syncedAt: PREVIOUS_SYNCED_AT,
    },
    items: current.items
      .filter((item) => item.fabricId !== REPORT)
      .map((item) =>
        item.fabricId === LAKEHOUSE
          ? { ...item, ownerEmail: "former.owner@contoso.example", health: "stale" as const }
          : item.fabricId === MODEL
            ? { ...item, sensitivity: "General" }
            : item,
      ),
    edges: current.edges.filter((edge) => edge.target !== REPORT),
    grants: current.grants.filter((grant) => grant.itemFabricId !== REPORT),
    jobs: current.jobs.map((job) =>
      job.itemFabricId === NOTEBOOK ? { ...job, status: "completed" as const } : job,
    ),
  };
}

export function snapshotHistory(): AtlasHistory {
  const snapshots: HistoricalSnapshot[] = [
    snapshotFromData(currentSnapshot()),
    snapshotFromData(previousSnapshot()),
  ];
  return buildAtlasHistory(snapshots);
}

export function scopeEntry(
  id: string,
  displayName: string,
  persisted = true,
): WorkspaceScope {
  return {
    id,
    displayName,
    workspaceType: "Workspace",
    selectedAt: persisted ? "2026-09-30T10:00:00.000Z" : undefined,
    persisted,
  };
}

export interface FakeSourceOptions {
  authenticated?: boolean;
  scope?: WorkspaceScope[];
  snapshots?: Record<string, AtlasData | null>;
  history?: AtlasHistory | Error;
  evidence?: PersistedItemRelationsEvidence | null | Error;
  incidentRecords?: OperationalIncidentRecord[] | Error;
  policyEvidence?: AccessPolicyEvidence[] | Error;
}

/** In-memory read-only source that records every call. */
export function fakeSource(options: FakeSourceOptions = {}) {
  const calls: string[] = [];
  const source: AtlasMcpDataSource = {
    async requireSession() {
      calls.push("requireSession");
      if (options.authenticated === false) {
        throw new AtlasMcpError(
          "unauthenticated",
          "Sign-in to the Atlas app audience did not complete.",
        );
      }
    },
    async loadWorkspaceScope() {
      calls.push("loadWorkspaceScope");
      return options.scope ?? [scopeEntry(WORKSPACE_ID, "Sales analytics")];
    },
    async loadSnapshot(workspaceId) {
      calls.push(`loadSnapshot:${workspaceId}`);
      const snapshots = options.snapshots ?? { [WORKSPACE_ID]: currentSnapshot() };
      return snapshots[workspaceId] ?? null;
    },
    async loadHistory(workspaceId) {
      calls.push(`loadHistory:${workspaceId}`);
      if (options.history instanceof Error) throw options.history;
      return options.history ?? snapshotHistory();
    },
    async loadItemRelationsEvidence(workspaceId) {
      calls.push(`loadItemRelationsEvidence:${workspaceId}`);
      if (options.evidence instanceof Error) throw options.evidence;
      return options.evidence ?? null;
    },
    async loadIncidentRecords(workspaceId, snapshotId) {
      calls.push(`loadIncidentRecords:${workspaceId}:${snapshotId}`);
      if (options.incidentRecords instanceof Error) throw options.incidentRecords;
      return options.incidentRecords ?? [];
    },
    async loadPolicyEvidence(workspaceId, snapshotId) {
      calls.push(`loadPolicyEvidence:${workspaceId}:${snapshotId}`);
      if (options.policyEvidence instanceof Error) throw options.policyEvidence;
      return options.policyEvidence ?? [];
    },
  };
  return { source, calls };
}
