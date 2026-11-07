import * as Dialog from "@radix-ui/react-dialog";
import { Download, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAtlas } from "../store";
import { useExternalLineage } from "../external-lineage-store";
import { exportOpenLineage, type OlExportResult } from "../openlineage";
import { SECONDARY_BUTTON } from "./button-styles";
import { cn } from "../ui";

type Scope = "workspace" | "selection";

/** Focused items plus their direct neighbours in the Fabric graph. */
function selectionScope(seed: readonly string[], edges: readonly { source: string; target: string }[]): Set<string> {
  const out = new Set(seed);
  for (const e of edges) {
    if (seed.includes(e.source)) out.add(e.target);
    if (seed.includes(e.target)) out.add(e.source);
  }
  return out;
}

function downloadText(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function OpenLineageExportDialog({
  selection = [],
  className,
  onExported,
}: {
  /** Item ids selected on the map; enables the "Selection on the map" scope. */
  selection?: readonly string[];
  className?: string;
  onExported?: (result: OlExportResult) => void;
}) {
  const { data } = useAtlas();
  const { externalLineage } = useExternalLineage();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("workspace");
  const [includeExternal, setIncludeExternal] = useState(true);

  const selectionIds = useMemo(
    () => (selection.length ? selectionScope(selection, data.edges) : null),
    [selection, data.edges],
  );
  const linkedCount = externalLineage.datasets.filter((d) => d.state === "linked").length;
  const effectiveScope: Scope = scope === "selection" && selectionIds ? "selection" : "workspace";
  const preview = useMemo(
    () =>
      exportOpenLineage(data, {
        itemIds: effectiveScope === "selection" ? selectionIds ?? undefined : undefined,
        includeExternal,
        external: externalLineage,
      }),
    [data, effectiveScope, selectionIds, includeExternal, externalLineage],
  );
  const workspaceStats = useMemo(
    () => ({ items: data.items.length, edges: data.edges.length }),
    [data.items.length, data.edges.length],
  );

  function download() {
    const result = exportOpenLineage(data, {
      itemIds: effectiveScope === "selection" ? selectionIds ?? undefined : undefined,
      includeExternal,
      external: externalLineage,
    });
    downloadText(result.text, result.fileName);
    onExported?.(result);
    setOpen(false);
  }

  const option = (value: Scope, label: string, hint: string, disabled = false) => (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-s rounded-lg border px-m py-s text-300",
        effectiveScope === value ? "border-2 border-primary" : "border-border",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <input
        type="radio"
        name="ol-export-scope"
        value={value}
        checked={effectiveScope === value}
        disabled={disabled}
        onChange={() => setScope(value)}
        className="accent-primary"
      />
      {label}
      <span className="ml-auto text-200 text-muted-foreground">{hint}</span>
    </label>
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className={cn(SECONDARY_BUTTON, className)}>
          <Download className="size-4" aria-hidden="true" />
          Download OpenLineage
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/55" />
        <div className="pointer-events-none fixed inset-0 z-[111] flex items-center justify-center p-m">
          <Dialog.Content className="pointer-events-auto w-full max-w-[460px] rounded-xl border border-border bg-card shadow-fabric-16">
            <header className="atlas-page-header flex items-start gap-m border-b border-border">
              <span className="flex icon-size-600 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-brand-foreground">
                <Download className="icon-size-200" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-400 font-semibold">Download OpenLineage</Dialog.Title>
                <Dialog.Description className="mt-xs text-200 text-muted-foreground">
                  Writes the Fabric lineage as standard OpenLineage events (NDJSON). No data, SQL or
                  credentials — only item, table and job names.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close download dialog"
                  className="atlas-control rounded-lg p-s text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="icon-size-200" />
                </button>
              </Dialog.Close>
            </header>
            <div className="grid gap-m p-l">
              <fieldset className="grid gap-xs">
                <legend className="mb-xs text-200 font-semibold">Scope</legend>
                {option("workspace", "Current workspace", `${workspaceStats.items} items · ${workspaceStats.edges} edges`)}
                {option(
                  "selection",
                  "Selection on the map",
                  selectionIds ? `${selectionIds.size} items (focused + neighbours)` : "select an item on the map",
                  !selectionIds,
                )}
              </fieldset>
              <label className="flex items-center gap-s text-300">
                <input
                  type="checkbox"
                  checked={includeExternal}
                  onChange={(e) => setIncludeExternal(e.target.checked)}
                  className="accent-primary"
                />
                Include linked external datasets
                <span className="text-200 text-muted-foreground">({linkedCount})</span>
              </label>
              <p className="text-200 text-muted-foreground" data-testid="ol-export-summary">
                {preview.eventCount} events · {preview.jobCount} jobs · {preview.datasetCount} datasets
                {includeExternal ? ` · ${preview.externalEdgeCount} external edges` : ""}
              </p>
              <div className="atlas-toolbar flex flex-wrap justify-end gap-s border-t border-border pt-m">
                <Dialog.Close asChild>
                  <button type="button" className="atlas-control rounded-lg border border-border px-m font-semibold hover:bg-accent">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={download}
                  disabled={!preview.eventCount}
                  className="atlas-control inline-flex items-center gap-s rounded-lg bg-primary px-m font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-50"
                >
                  <Download className="icon-size-100" aria-hidden="true" />
                  Download .ndjson
                </button>
              </div>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
