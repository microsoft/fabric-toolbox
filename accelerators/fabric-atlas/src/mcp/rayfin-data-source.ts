import { loadStoredPolicyEvidence } from "@/atlas/access-policy-evidence-source";
import { loadFromDb, loadHistoryFromDb } from "@/atlas/backend";
import { readLatestItemRelationsEvidence } from "@/atlas/item-relations-evidence-store";
import type { AtlasMcpDataSource } from "@/atlas/mcp/data-source";
import { readOperationalIncidents } from "@/atlas/operational-incident-store";
import { loadWorkspaceScopes } from "@/atlas/workspace-scope";

/** The current snapshot plus the previous one, for change comparison. */
const HISTORY_SNAPSHOTS = 2;

/**
 * Atlas MCP over the same loaders as the deployed UI: trusted manifests,
 * count verification, writer checks and record contracts apply unchanged.
 * Personal entities (saved views, review decisions, Radar acknowledgements)
 * are never read.
 */
export function createRayfinAtlasMcpDataSource(session: {
  requireSession(): Promise<void>;
}): AtlasMcpDataSource {
  return {
    requireSession: () => session.requireSession(),
    loadWorkspaceScope: () => loadWorkspaceScopes(false),
    loadSnapshot: (workspaceId) => loadFromDb(false, workspaceId),
    loadHistory: (workspaceId, current) =>
      loadHistoryFromDb(false, current, HISTORY_SNAPSHOTS, workspaceId),
    loadItemRelationsEvidence: (workspaceId) =>
      readLatestItemRelationsEvidence(workspaceId),
    loadIncidentRecords: (workspaceId, snapshotId) =>
      readOperationalIncidents(workspaceId, snapshotId),
    loadPolicyEvidence: (workspaceId, snapshotId) =>
      loadStoredPolicyEvidence(workspaceId, snapshotId, new AbortController().signal),
  };
}
