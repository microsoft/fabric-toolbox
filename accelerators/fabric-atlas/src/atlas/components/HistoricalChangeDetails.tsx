import * as Dialog from "@radix-ui/react-dialog";
import { GitCompareArrows, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  changeFieldValue,
  readableChangeValue,
  snapshotDataForInspection,
  type AtlasChange,
  type HistoricalSnapshot,
} from "../history";
import {
  assetObjectKindLabel,
  findCatalogObject,
  type CatalogObject,
} from "../catalog-objects";
import type { SchemaObjectRef } from "../lineage";
import { cn } from "../ui";
import { ImpactReportDialog } from "./ImpactReportDialog";
import { MetadataObjectImpactDialog } from "./MetadataObjectImpactDialog";

type EvidenceSide = "before" | "after";

function evidenceSideForChange(change: AtlasChange): EvidenceSide {
  return change.after === undefined ? "before" : "after";
}

function subjectExists(
  snapshot: HistoricalSnapshot,
  change: AtlasChange,
): boolean {
  if (!change.itemFabricId) return false;
  if (
    !snapshot.catalog.items.some(
      (item) => item.fabricId === change.itemFabricId,
    )
  ) {
    return false;
  }
  if (!change.objectType || !change.objectName) return true;
  return Boolean(subjectObject(snapshot, change));
}

function subjectObject(
  snapshot: HistoricalSnapshot,
  change: AtlasChange,
): CatalogObject | undefined {
  if (!change.itemFabricId || !change.objectType) return undefined;
  return findCatalogObject(snapshot.catalog, {
    itemId: change.itemFabricId,
    kind: change.objectType,
    objectId: change.objectId,
    name: change.objectName,
    tableName: change.tableName,
  });
}

function objectReference(change: AtlasChange): SchemaObjectRef | undefined {
  if (!change.itemFabricId || !change.objectType || !change.objectName) {
    return undefined;
  }
  if (!["table", "view", "column", "measure"].includes(change.objectType)) {
    return undefined;
  }
  return {
    itemId: change.itemFabricId,
    kind: change.objectType as SchemaObjectRef["kind"],
    name: change.objectName,
    tableName: change.tableName,
  };
}

function DiffValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: unknown;
  tone: "before" | "after";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border p-m",
        tone === "before"
          ? "border-status-failing/20 bg-status-failing/5"
          : "border-status-healthy/20 bg-status-healthy/5",
      )}
    >
      <div className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre className="mt-s max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-200 leading-300 text-foreground">
        {readableChangeValue(value)}
      </pre>
    </div>
  );
}

export function HistoricalChangeDetails({
  change,
  previousSnapshotId,
  currentSnapshotId,
  snapshots,
  historyLoading,
  historyError,
  failedSnapshotIds,
  loadHistorySnapshot,
}: {
  change: AtlasChange;
  previousSnapshotId: string;
  currentSnapshotId: string;
  snapshots: HistoricalSnapshot[];
  historyLoading: boolean;
  historyError?: string;
  failedSnapshotIds: Set<string>;
  loadHistorySnapshot: (snapshotId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [impactOpen, setImpactOpen] = useState(false);
  const [side, setSide] = useState<EvidenceSide>(() =>
    evidenceSideForChange(change),
  );
  const snapshotId =
    side === "before" ? previousSnapshotId : currentSnapshotId;
  const snapshot = snapshots.find(
    (candidate) => candidate.snapshotId === snapshotId,
  );
  const hasSubject = snapshot ? subjectExists(snapshot, change) : false;
  const selectedSubject = snapshot
    ? subjectObject(snapshot, change)
    : undefined;
  const historicalData = useMemo(
    () => (snapshot ? snapshotDataForInspection(snapshot) : undefined),
    [snapshot],
  );
  const object = objectReference(change);
  const metadataObject = selectedSubject?.metadataRef;
  const hasBefore = change.before !== undefined;
  const hasAfter = change.after !== undefined;

  useEffect(() => {
    if (!open || !snapshotId || snapshot) return;
    void loadHistorySnapshot(snapshotId);
  }, [loadHistorySnapshot, open, snapshot, snapshotId]);

  return (
    <>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="atlas-control inline-flex items-center gap-s self-start rounded-lg border border-border px-m font-semibold text-primary hover:bg-primary/10"
          >
            <GitCompareArrows className="icon-size-100" aria-hidden="true" />
            Inspect change
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/55" />
          <div className="pointer-events-none fixed inset-0 z-[111] flex items-center justify-center p-m sm:p-xl">
            <Dialog.Content className="pointer-events-auto flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-fabric-16">
              <header className="atlas-page-header flex items-start gap-m border-b border-border">
                <span className="flex icon-size-600 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand-foreground">
                  <GitCompareArrows
                    className="icon-size-200"
                    aria-hidden="true"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <Dialog.Title className="text-400 font-semibold">
                    {change.label}
                  </Dialog.Title>
                  <Dialog.Description className="mt-xs text-200 text-muted-foreground">
                    {change.objectType
                      ? `${assetObjectKindLabel(change.objectType)} evidence from validated snapshots.`
                      : "Full before and after evidence from validated snapshots."}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close change details"
                    className="atlas-control rounded-lg p-s text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="icon-size-200" />
                  </button>
                </Dialog.Close>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-l">
                {change.changedFields?.length ? (
                  <section aria-label="Changed fields">
                    <h3 className="text-300 font-semibold">Changed fields</h3>
                    <div className="mt-s grid gap-s">
                      {change.changedFields.map((field) => (
                        <div
                          key={field}
                          className="grid gap-s rounded-lg border border-border p-m lg:grid-cols-[10rem_1fr_1fr]"
                        >
                          <div className="text-200 font-semibold">{field}</div>
                          <DiffValue
                            label="Before"
                            value={changeFieldValue(change.before, field)}
                            tone="before"
                          />
                          <DiffValue
                            label="After"
                            value={changeFieldValue(change.after, field)}
                            tone="after"
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="mt-l grid gap-m lg:grid-cols-2">
                  <DiffValue label="Full before" value={change.before} tone="before" />
                  <DiffValue label="Full after" value={change.after} tone="after" />
                </section>

                {change.itemFabricId && (
                  <section className="mt-l rounded-xl border border-border">
                    <div className="atlas-row flex flex-col gap-s border-b border-border bg-secondary/55 px-l sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-300 font-semibold">
                          Historical impact evidence
                        </h3>
                        <p className="text-200 text-muted-foreground">
                          Impact is calculated only from the selected historical
                          snapshot.
                        </p>
                      </div>
                      {hasBefore && hasAfter && (
                        <div
                          className="atlas-toolbar flex gap-s"
                          aria-label="Impact evidence version"
                        >
                          {(["before", "after"] as const).map((value) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={side === value}
                              onClick={() => setSide(value)}
                              className={cn(
                                "atlas-control rounded-lg border px-m font-semibold",
                                side === value
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border hover:bg-accent",
                              )}
                            >
                              {value === "before" ? "Before impact" : "After impact"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-l">
                      {!snapshot ? (
                        failedSnapshotIds.has(snapshotId) ? (
                          <div
                            role="alert"
                            className="flex flex-col gap-m rounded-lg border border-status-warning/30 bg-status-warning/10 p-m sm:flex-row sm:items-center"
                          >
                            <p className="min-w-0 flex-1 text-200 text-status-warning">
                              Historical impact is unavailable.{" "}
                              {historyError ??
                                "The validated snapshot could not be loaded."}
                            </p>
                            <button
                              type="button"
                              disabled={historyLoading}
                              onClick={() =>
                                void loadHistorySnapshot(snapshotId)
                              }
                              className="atlas-control inline-flex items-center gap-s rounded-lg border border-border bg-card px-m font-semibold hover:bg-accent disabled:opacity-50"
                            >
                              <RotateCcw
                                className="icon-size-100"
                                aria-hidden="true"
                              />
                              Retry history
                            </button>
                          </div>
                        ) : (
                          <p role="status" className="text-200 text-muted-foreground">
                            Loading validated historical impact...
                          </p>
                        )
                      ) : !hasSubject ? (
                        <p
                          role="alert"
                          className="text-200 text-status-warning"
                        >
                          The selected historical snapshot does not contain the
                          item or schema object needed for impact analysis.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            setImpactOpen(true);
                          }}
                          className="atlas-control rounded-lg bg-primary px-m font-semibold text-primary-foreground hover:brightness-110"
                        >
                          Open {side} impact report
                        </button>
                      )}
                    </div>
                  </section>
                )}
              </div>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
      {historicalData &&
      change.itemFabricId &&
      hasSubject &&
      metadataObject ? (
        <MetadataObjectImpactDialog
          data={historicalData}
          subject={metadataObject}
          open={impactOpen}
          onClose={() => setImpactOpen(false)}
        />
      ) : historicalData && change.itemFabricId && hasSubject ? (
        <ImpactReportDialog
          data={historicalData}
          itemId={change.itemFabricId}
          object={object}
          open={impactOpen}
          onClose={() => setImpactOpen(false)}
        />
      ) : null}
    </>
  );
}
