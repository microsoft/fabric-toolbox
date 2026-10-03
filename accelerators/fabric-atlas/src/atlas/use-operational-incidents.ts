import { useEffect, useState } from "react";
import {
  OperationalIncidentsUnavailableError,
  readOperationalIncidents,
  type OperationalIncidentRecord,
} from "./operational-incident-store";

export type IncidentRecordsState =
  | { status: "loading" }
  | { status: "ready"; records: OperationalIncidentRecord[] }
  | { status: "unavailable"; reason: "preview" | "not-deployed" | "no-snapshot" }
  | { status: "error" };

/**
 * Loads persisted incident records for one published snapshot. Failures are
 * reported as state; incidents stay derivable from the snapshot's job history.
 */
export function useOperationalIncidentRecords(
  isPreview: boolean,
  workspaceId: string,
  snapshotId: string | undefined,
): IncidentRecordsState {
  const key =
    isPreview || !snapshotId ? undefined : `${workspaceId}|${snapshotId}`;
  const [result, setResult] = useState<{
    key: string;
    state: IncidentRecordsState;
  }>();

  useEffect(() => {
    if (!key || !snapshotId) return;
    const controller = new AbortController();
    readOperationalIncidents(workspaceId, snapshotId, undefined, controller.signal)
      .then((records) => {
        if (!controller.signal.aborted) {
          setResult({ key, state: { status: "ready", records } });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          state:
            error instanceof OperationalIncidentsUnavailableError
              ? { status: "unavailable", reason: "not-deployed" }
              : { status: "error" },
        });
      });
    return () => controller.abort();
  }, [key, snapshotId, workspaceId]);

  if (isPreview) return { status: "unavailable", reason: "preview" };
  if (!snapshotId) return { status: "unavailable", reason: "no-snapshot" };
  return result && result.key === key ? result.state : { status: "loading" };
}
