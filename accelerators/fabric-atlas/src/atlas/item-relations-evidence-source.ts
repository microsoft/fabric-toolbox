import { useEffect, useState } from "react";
import {
  ItemRelationsContractError,
  parseItemRelationsEvidence,
  type ItemRelationsEvidence,
} from "./item-relations-evidence";
import { readLatestItemRelationsEvidence } from "./item-relations-evidence-store";

/** How much of the workspace the stored collection covered. */
export interface ItemRelationsEvidenceCoverage {
  sampledItemCount?: number;
  workspaceItemCount?: number;
  /** Collector stop reasons; remaining queries were recorded as `not-attempted`. */
  stopReasons: string[];
}

/** One persisted envelope plus the Atlas snapshot it was collected with. */
export interface PersistedItemRelationsEvidence {
  envelope: unknown;
  snapshotId?: string;
  coverage?: ItemRelationsEvidenceCoverage;
}

/** Resolves the latest persisted evidence, or `null` when none exists. */
export type ItemRelationsEvidenceLoader = (
  workspaceId: string,
  signal: AbortSignal,
) => Promise<PersistedItemRelationsEvidence | null>;

/** Reads the newest validated envelope from `ItemRelationsEvidenceSnapshot`. */
export const loadPersistedItemRelationsEvidence: ItemRelationsEvidenceLoader = (
  workspaceId,
  signal,
) => readLatestItemRelationsEvidence(workspaceId, signal);

/** Preview builds have no backend and therefore no persisted evidence. */
export const loadNoPersistedItemRelationsEvidence: ItemRelationsEvidenceLoader =
  async () => null;

export type ItemRelationsEvidenceState =
  | { status: "off" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      evidence: ItemRelationsEvidence;
      snapshotId?: string;
      coverage?: ItemRelationsEvidenceCoverage;
    };

interface LoadedEvidence {
  requestKey: string;
  loader: ItemRelationsEvidenceLoader;
  state: Exclude<ItemRelationsEvidenceState, { status: "off" | "loading" }>;
}

/**
 * Loads persisted Preview evidence only while `active`. The envelope is
 * validated against the active workspace before it reaches the UI.
 */
export function useItemRelationsEvidence(
  workspaceId: string,
  active: boolean,
  loader: ItemRelationsEvidenceLoader,
  attempt = 0,
): ItemRelationsEvidenceState {
  const requestKey = active && workspaceId ? `${workspaceId}|${attempt}` : "";
  const [loaded, setLoaded] = useState<LoadedEvidence | null>(null);

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    const finish = (state: LoadedEvidence["state"]) => {
      if (!controller.signal.aborted) {
        setLoaded({ requestKey, loader, state });
      }
    };
    loader(workspaceId, controller.signal)
      .then((value) =>
        finish(
          value == null
            ? { status: "empty" }
            : {
                status: "ready",
                evidence: parseItemRelationsEvidence(
                  value.envelope,
                  workspaceId,
                ),
                snapshotId: value.snapshotId,
                coverage: value.coverage,
              },
        ),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        finish({
          status: "error",
          message:
            error instanceof ItemRelationsContractError
              ? "Persisted Item Relations evidence failed validation and is not shown."
              : "Persisted Item Relations evidence could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [loader, requestKey, workspaceId]);

  if (!requestKey) return { status: "off" };
  if (
    !loaded ||
    loaded.requestKey !== requestKey ||
    loaded.loader !== loader
  ) {
    return { status: "loading" };
  }
  return loaded.state;
}
