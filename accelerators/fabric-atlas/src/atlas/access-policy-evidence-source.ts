import { useEffect, useState } from "react";
import {
  POLICY_KINDS, parseAccessPolicyEvidence,
  type AccessPolicyEvidence,
} from "../../rayfin/functions/src/policy-evidence-contract";

const FIELDS = [
  "id", "workspace_id", "snapshotId", "collectionId", "writerEmail", "schemaVersion",
  "kind", "source", "collectorIdentity", "coverage", "reason", "attemptedAt", "observedAt",
  "inboundPublicAction", "outboundPublicAction", "externalSharesBypassAction",
] as const;
interface Query {
  where(filter: Record<string, unknown>): Query;
  orderBy(order: Record<string, "desc">): Query;
  first(count: number): Query;
  execute(): Promise<unknown[]>;
}
interface EvidenceApi { select(fields: readonly string[]): Query; }
export type PolicyEvidenceLoader = (
  workspaceId: string, snapshotId: string, signal: AbortSignal,
) => Promise<AccessPolicyEvidence[]>;

export const loadStoredPolicyEvidence: PolicyEvidenceLoader = async (workspaceId, snapshotId, signal) => {
  const { getRayfinClient } = await import("@/lib/rayfin-client");
  const api = getRayfinClient().data.AccessPolicyEvidence as unknown as EvidenceApi;
  const records: AccessPolicyEvidence[] = [];
  for (const kind of POLICY_KINDS) {
    if (signal.aborted) return [];
    const rows = await api.select(FIELDS).where({ workspace_id: workspaceId, snapshotId, kind })
      .orderBy({ attemptedAt: "desc" }).first(1).execute();
    if (rows.length > 1) throw new Error("Policy evidence exceeded its read bound.");
    if (rows[0]) {
      const record = parseAccessPolicyEvidence(rows[0], workspaceId, snapshotId);
      if (record.kind !== kind) throw new Error("Policy evidence kind mismatch.");
      records.push(record);
    }
  }
  return signal.aborted ? [] : records;
};

export type PolicyEvidenceState =
  | { status: "off" | "loading" | "unavailable"; records: AccessPolicyEvidence[] }
  | { status: "ready"; records: AccessPolicyEvidence[] };
const EMPTY_RECORDS: AccessPolicyEvidence[] = [];
const OFF_STATE: PolicyEvidenceState = { status: "off", records: EMPTY_RECORDS };
const LOADING_STATE: PolicyEvidenceState = { status: "loading", records: EMPTY_RECORDS };

export function useStoredPolicyEvidence(
  workspaceId: string, snapshotId: string | undefined, active: boolean,
  loader: PolicyEvidenceLoader = loadStoredPolicyEvidence, refresh = 0,
): PolicyEvidenceState {
  const key = active && snapshotId ? `${workspaceId}:${snapshotId}:${refresh}` : "";
  const [loaded, setLoaded] = useState<{ key: string; loader: PolicyEvidenceLoader; state: PolicyEvidenceState } | null>(null);
  useEffect(() => {
    if (!key || !snapshotId) return;
    const controller = new AbortController();
    loader(workspaceId, snapshotId, controller.signal).then((values) => {
      const records = values.map((value) => parseAccessPolicyEvidence(value, workspaceId, snapshotId));
      if (records.length > 3 || new Set(records.map((record) => record.kind)).size !== records.length) {
        throw new Error("Policy evidence collection exceeded its contract.");
      }
      if (!controller.signal.aborted) setLoaded({ key, loader, state: { status: "ready", records } });
    }).catch(() => {
      if (!controller.signal.aborted) setLoaded({ key, loader, state: { status: "unavailable", records: EMPTY_RECORDS } });
    });
    return () => controller.abort();
  }, [key, loader, snapshotId, workspaceId]);
  if (!key) return OFF_STATE;
  return loaded?.key === key && loaded.loader === loader ? loaded.state : LOADING_STATE;
}

export async function collectStoredPolicyEvidence(workspaceId: string, snapshotId: string) {
  const { getRayfinClient } = await import("@/lib/rayfin-client");
  const client = getRayfinClient() as unknown as {
    functions: {
      workspaceCollectAccessPolicyEvidence: {
        invoke(input: { protocolVersion: 1; workspaceId: string; snapshotId: string },
          options: { timeoutMs: number }): Promise<{ status: "off" | "stored"; records: number }>;
      };
    };
  };
  const result = await client.functions.workspaceCollectAccessPolicyEvidence.invoke(
    { protocolVersion: 1, workspaceId, snapshotId }, { timeoutMs: 60_000 },
  );
  if (!["off", "stored"].includes(result.status) || !Number.isInteger(result.records) ||
    result.records < 0 || result.records > 3) throw new Error("Invalid policy collection response.");
  return result;
}
