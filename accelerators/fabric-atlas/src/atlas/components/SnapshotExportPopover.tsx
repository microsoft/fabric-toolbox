import * as Popover from "@radix-ui/react-popover";
import { Copy, Download, FileJson } from "lucide-react";
import { useState } from "react";
import { downloadText, fileSlug } from "../download";
import { relativeTime, type AtlasData } from "../model";
import { buildSnapshotExport } from "../snapshot-export";

export const SNAPSHOT_EXPORT_MCP_TOOL = "atlas_export_snapshot";

/** Tables plus their columns and measures in the validated snapshot. */
export function schemaObjectCount(data: Pick<AtlasData, "schema">): number {
  return Object.values(data.schema ?? {})
    .flat()
    .reduce((sum, table) => sum + 1 + table.columns.length + table.measures.length, 0);
}

/** Header "Export JSON": validated snapshot with its manifest, also reachable through the MCP tool. */
export function SnapshotExportPopover({ data }: { data: AtlasData }) {
  const [withManifest, setWithManifest] = useState(true);
  const [copied, setCopied] = useState(false);
  const syncedAt =
    data.workspace.syncedAt ??
    data.syncRuns.filter((run) => run.status === "completed" && run.finishedAt).map((run) => run.finishedAt as string).sort().at(-1);
  const validated = Boolean(data.workspace.snapshotId || syncedAt);
  const filename = `atlas-snapshot-${fileSlug(data.workspace.displayName)}-${(syncedAt ?? new Date().toISOString()).slice(0, 10)}.json`;
  const download = () => {
    const exported = buildSnapshotExport(data, new Date().toISOString());
    const content = withManifest ? exported : { ...exported, manifest: undefined };
    downloadText(JSON.stringify(content, null, 2), "application/json", filename);
  };
  const copyTool = async () => {
    try {
      await navigator.clipboard.writeText(SNAPSHOT_EXPORT_MCP_TOOL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const checkbox = "icon-size-100 accent-[var(--color-primary)]";
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={!validated}
          title={validated ? "Export the validated snapshot as JSON" : "Synchronize once to export a validated snapshot"}
          className="flex h-[32px] items-center gap-[7px] rounded-md border border-input bg-card px-[12px] text-[13px] font-semibold text-foreground hover:bg-accent disabled:opacity-60"
        >
          <FileJson size={15} aria-hidden="true" />
          <span className="hidden sm:inline">Export JSON</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-[min(380px,calc(100vw-24px))] rounded-xl border border-border bg-popover p-m text-popover-foreground shadow-fabric-8"
        >
          <h2 className="text-300 font-semibold">Export validated snapshot</h2>
          <p className="mt-xxs text-200 text-muted-foreground">
            {data.workspace.displayName} · snapshot validated {relativeTime(syncedAt)} · manifest
          </p>
          <div className="mt-m flex flex-col gap-xs text-200">
            <label className="flex items-center gap-s">
              <input type="checkbox" className={checkbox} checked disabled />
              Items, objects, lineage, access, findings
            </label>
            <label className="flex items-center gap-s">
              <input type="checkbox" className={checkbox} checked={withManifest} onChange={(event) => setWithManifest(event.target.checked)} />
              Include manifest and evidence status
            </label>
            <label className="flex items-center gap-s text-muted-foreground" title="Each export holds one workspace snapshot; export each workspace of a large estate separately or page through the MCP tool.">
              <input type="checkbox" className={checkbox} checked disabled />
              Split per workspace (large estates)
            </label>
          </div>
          <div className="mt-m rounded-lg border border-border bg-muted/40 p-s">
            <p className="truncate font-mono text-100" title={filename}>{filename}</p>
            <dl className="mt-xs grid grid-cols-3 gap-s text-100 text-muted-foreground">
              <div><dt>Fabric items</dt><dd className="font-numeric text-300 font-semibold text-foreground">{data.items.length}</dd></div>
              <div><dt>Tables, columns &amp; measures</dt><dd className="font-numeric text-300 font-semibold text-foreground">{schemaObjectCount(data)}</dd></div>
              <div><dt>Lineage links</dt><dd className="font-numeric text-300 font-semibold text-foreground">{data.edges.length}</dd></div>
            </dl>
            <p className="mt-xs text-100 text-muted-foreground">Last synchronized: {relativeTime(syncedAt)}</p>
          </div>
          <div className="mt-m flex flex-wrap gap-s">
            <button
              type="button"
              onClick={download}
              className="flex h-[32px] items-center gap-[7px] rounded-md bg-primary px-[12px] text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Download size={15} aria-hidden="true" />
              Download
            </button>
            <button
              type="button"
              onClick={() => void copyTool()}
              title={`MCP tool: ${SNAPSHOT_EXPORT_MCP_TOOL}`}
              className="flex h-[32px] items-center gap-[7px] rounded-md border border-input bg-card px-[12px] text-[13px] font-semibold hover:bg-accent"
            >
              <Copy size={15} aria-hidden="true" />
              {copied ? "Copied" : "Copy MCP tool name"}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
