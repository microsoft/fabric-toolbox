import { AlertTriangle, Info, Loader2, RefreshCw } from "lucide-react";
import type { ItemRelationsEvidenceState } from "../item-relations-evidence-source";
import type { LineageEvidenceModel } from "../lineage-evidence";
import { relativeTime } from "../model";

/** One-line state of persisted Item Relations evidence below the Preview notice. */
export function ItemRelationsEvidenceStatus({
  state,
  model,
  currentSnapshotId,
  onRetry,
}: {
  state: ItemRelationsEvidenceState;
  model: LineageEvidenceModel;
  currentSnapshotId?: string;
  onRetry: () => void;
}) {
  if (state.status === "off") return null;
  if (state.status === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        className="flex items-center gap-s rounded-lg border border-border bg-card px-m py-s text-200 text-muted-foreground"
      >
        <Loader2 className="icon-size-200 animate-spin" aria-hidden="true" />
        Loading persisted Item Relations evidence…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-m rounded-lg border border-destructive/35 bg-destructive/10 px-m py-s text-200 leading-200 text-foreground"
      >
        <AlertTriangle
          className="icon-size-200 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 break-words">
          {state.message} Atlas snapshot lineage is unchanged.
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-[var(--atlas-touch-target)] items-center gap-s rounded-md border border-input bg-card px-l text-300 font-semibold hover:bg-accent sm:min-h-[var(--atlas-control-height)]"
        >
          <RefreshCw className="icon-size-200" aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }
  if (state.status === "empty") {
    return (
      <div
        role="status"
        className="flex items-start gap-s rounded-lg border border-border bg-card px-m py-s text-200 leading-200 text-foreground"
      >
        <Info
          className="icon-size-200 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p>
          <span className="font-semibold">
            No persisted Item Relations evidence for this workspace.
          </span>{" "}
          <span className="text-muted-foreground">
            Sync to collect it. Atlas links stay hidden while Preview is on.
          </span>
        </p>
      </div>
    );
  }
  const graph = model.previewGraph;
  const coverage = state.coverage;
  const sampled =
    coverage?.sampledItemCount != null &&
    coverage.workspaceItemCount != null &&
    coverage.sampledItemCount < coverage.workspaceItemCount;
  const earlierSnapshot =
    !!state.snapshotId &&
    !!currentSnapshotId &&
    state.snapshotId.toLowerCase() !== currentSnapshotId.toLowerCase();
  const drawnRelations =
    graph?.edges.filter(
      (edge) => edge.semantics.flow !== "visibility" && !edge.selfRelation,
    ) ?? [];
  const relationTypes = new Set(
    drawnRelations.map((edge) => edge.relation.relationType),
  );
  const crossWorkspace = drawnRelations.filter(
    (edge) => edge.crossWorkspace,
  ).length;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-m gap-y-xxs rounded-lg border border-border bg-card px-m py-s text-200 text-muted-foreground"
    >
      <span title={state.evidence.collectedAt}>
        Collected {relativeTime(state.evidence.collectedAt)}
        {earlierSnapshot ? " with an earlier Atlas snapshot" : ""}
      </span>
      {graph && (
        <span>
          {graph.coverage.complete} complete · {graph.coverage.preserved}{" "}
          preserved · {graph.coverage.failed} failed queries
        </span>
      )}
      {sampled && (
        <span className="font-semibold text-foreground">
          Partial: {coverage.sampledItemCount} of {coverage.workspaceItemCount}{" "}
          items queried
        </span>
      )}
      {coverage && coverage.stopReasons.length > 0 && (
        <span>Stopped early: {coverage.stopReasons.join(", ")}</span>
      )}
      <span>{drawnRelations.length} drawn relations</span>
      <span>{relationTypes.size} API relation types</span>
      {crossWorkspace > 0 && (
        <span className="font-semibold text-foreground">
          {crossWorkspace} cross-workspace
        </span>
      )}
    </div>
  );
}
