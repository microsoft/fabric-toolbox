import * as Dialog from "@radix-ui/react-dialog";
import { GitBranch, X } from "lucide-react";
import { useMemo } from "react";
import {
  metadataObjectImpact,
  metadataObjectKindLabel,
} from "../catalog-objects";
import type { MetadataObjectRef } from "../item-metadata";
import type { AtlasData } from "../model";

function ObjectList({
  title,
  values,
  itemNames,
}: {
  title: string;
  values: MetadataObjectRef[];
  itemNames: ReadonlyMap<string, string>;
}) {
  return (
    <section className="rounded-xl border border-border bg-secondary/40 p-m">
      <h3 className="text-300 font-semibold">
        {title} · {values.length}
      </h3>
      <div className="mt-s space-y-xs">
        {values.length === 0 ? (
          <p className="text-200 text-muted-foreground">
            No verified object relationship was returned.
          </p>
        ) : (
          values.map((object) => (
            <div
              key={`${object.itemId}:${object.kind}:${object.id}`}
              className="rounded-lg border border-border bg-card px-m py-s"
            >
              <div className="break-words text-300 font-semibold">
                {object.name}
              </div>
              <div className="mt-xxs break-words text-200 text-muted-foreground">
                {metadataObjectKindLabel(object.kind)} ·{" "}
                {itemNames.get(object.itemId) ?? object.itemId}
                {object.tableName ? ` · ${object.tableName}` : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export function MetadataObjectImpactDialog({
  data,
  subject,
  open,
  onClose,
}: {
  data: AtlasData;
  subject: MetadataObjectRef;
  open: boolean;
  onClose: () => void;
}) {
  const impact = useMemo(
    () => metadataObjectImpact(data.objectEdges, subject),
    [data.objectEdges, subject],
  );
  const itemNames = useMemo(
    () =>
      new Map(data.items.map((item) => [item.fabricId, item.displayName])),
    [data.items],
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/55" />
        <div className="pointer-events-none fixed inset-0 z-[121] flex items-center justify-center p-m sm:p-xl">
          <Dialog.Content className="pointer-events-auto flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-fabric-16">
            <header className="atlas-page-header flex items-start gap-m border-b border-border">
              <span className="flex icon-size-600 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand-foreground">
                <GitBranch className="icon-size-200" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="break-words text-400 font-semibold">
                  {subject.name}
                </Dialog.Title>
                <Dialog.Description className="mt-xs text-200 text-muted-foreground">
                  Verified object impact from the selected synchronized
                  workspace snapshot.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close object impact"
                  className="atlas-control rounded-lg p-s text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="icon-size-200" />
                </button>
              </Dialog.Close>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-l">
              <div className="grid gap-m md:grid-cols-2">
                <ObjectList
                  title="Upstream"
                  values={impact.upstream}
                  itemNames={itemNames}
                />
                <ObjectList
                  title="Downstream"
                  values={impact.downstream}
                  itemNames={itemNames}
                />
              </div>
              <section className="mt-m rounded-xl border border-border p-m">
                <h3 className="text-300 font-semibold">
                  Verified relationships · {impact.relevantEdges.length}
                </h3>
                <div className="mt-s space-y-xs">
                  {impact.relevantEdges.length === 0 ? (
                    <p className="text-200 text-muted-foreground">
                      This snapshot contains the object, but no verified
                      object-level lineage for it.
                    </p>
                  ) : (
                    impact.relevantEdges.map((edge) => (
                      <div
                        key={`${edge.source.itemId}:${edge.source.kind}:${edge.source.id}:${edge.target.itemId}:${edge.target.kind}:${edge.target.id}:${edge.relation}`}
                        className="grid gap-xs rounded-lg bg-secondary px-m py-s text-200 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"
                      >
                        <span className="break-words font-semibold">
                          {edge.source.name}
                        </span>
                        <span className="text-muted-foreground">
                          {edge.relation}
                        </span>
                        <span className="break-words font-semibold sm:text-right">
                          {edge.target.name}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
