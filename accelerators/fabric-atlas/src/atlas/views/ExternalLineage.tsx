import { useMemo, useRef, useState, type DragEvent } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  AlertTriangle,
  Database,
  FileCode2,
  FolderOpen,
  Globe,
  Layers,
  Link2,
  Network,
  Upload,
} from "lucide-react";
import { Card, cn } from "../ui";
import { PageHeader } from "../components/PageHeader";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/button-styles";
import { useExternalLineage } from "../external-lineage-store";
import { defaultImportLabel, externalCounts, type ExternalImport, type ExternalLineage } from "../external-lineage";
import { ImportNameDialog } from "./ExternalLineageImportDialog";
import { OL_LIMITS } from "../openlineage";
import { useAtlas } from "../store";
import { ExternalLinkTab } from "./ExternalLineageLink";
import { ExternalFormatTab } from "./ExternalLineageFormat";
import { Note, PlatformBadge } from "./ExternalLineageParts";
import { OpenLineageExportDialog } from "../components/OpenLineageExportDialog";

type Section = "imports" | "link" | "format" | "model";

function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `today ${time}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function actorName(imp: ExternalImport) {
  return imp.importedByEmail.split("@")[0] || imp.importedByEmail;
}

export function ExternalLineageView() {
  const { isPreview } = useAtlas();
  const { externalLineage, loading, error, busy, importFile, removeImport } = useExternalLineage();
  const [section, setSection] = useState<Section>("imports");
  const [message, setMessage] = useState<{ tone: "info" | "warning"; text: string }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const counts = useMemo(() => externalCounts(externalLineage), [externalLineage]);
  const imports = externalLineage.imports;

  const [pending, setPending] = useState<File>();

  function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > OL_LIMITS.maxBytes) {
      setMessage({ tone: "warning", text: `${file.name}: file too large (max 20 MB).` });
      return;
    }
    setPending(file);
  }

  async function confirmImport(file: File, label: string) {
    setPending(undefined);
    const name = label.trim() || defaultImportLabel(file.name);
    try {
      const outcome = await importFile(file, name);
      setMessage(
        outcome.status === "accepted"
          ? {
              tone: "info",
              text: `${name} ${outcome.replaced ? "replaced" : "imported"}${
                outcome.warnings ? ` · ${outcome.warnings} line(s) skipped` : ""
              }.`,
            }
          : { tone: "warning", text: `${name} rejected: ${outcome.rejectReason ?? "invalid file"}.` },
      );
    } catch (e) {
      setMessage({ tone: "warning", text: e instanceof Error ? e.message : String(e) });
    }
  }

  function browse() {
    if (fileInput.current) {
      fileInput.current.value = "";
      fileInput.current.click();
    }
  }

  const tabs: { id: Section; label: string; count?: number }[] = [
    { id: "imports", label: "Imports", count: imports.length },
    { id: "link", label: "Link to Fabric", count: counts.toLink },
    { id: "format", label: "File format" },
    { id: "model", label: "Data model" },
  ];

  const purpose: Record<Section, string> = {
    imports:
      "Import OpenLineage files from other platforms and link their datasets to Fabric items. Manual, on demand — no automation in v1.",
    link: "Link each external dataset to the Fabric item it feeds or reads. Exact OneLake paths link automatically; everything else is picked by hand.",
    format: "What Atlas reads from an OpenLineage file — and what it ignores.",
    model: "Three dedicated tables, outside the snapshot. Read path = snapshot edges ∪ external edges.",
  };

  return (
    <Tabs.Root value={section} onValueChange={(v) => setSection(v as Section)} asChild>
      <div className="atlas-content-frame flex flex-col gap-l p-l sm:p-xxl">
        <Card className="min-w-0">
          <PageHeader
            title="External lineage"
            purpose={purpose[section]}
            help={
              <>
                Atlas reads standard OpenLineage files exported by any external data source. Datasets whose namespace is an exact OneLake path link to the Fabric item
                automatically; the others are linked by hand. External edges are stored in three tables
                outside the Fabric snapshot and merged with it when lineage is read.
              </>
            }
            actions={
              <div className="flex flex-wrap gap-s">
                <OpenLineageExportDialog
                  onExported={(r) =>
                    setMessage({ tone: "info", text: `${r.fileName} downloaded · ${r.eventCount} events.` })
                  }
                />
                <button type="button" className={PRIMARY_BUTTON} onClick={browse} disabled={busy}>
                  <Upload className="size-4" aria-hidden="true" />
                  Import OpenLineage file
                </button>
              </div>
            }
          />
          <input
            ref={fileInput}
            type="file"
            accept=".json,.ndjson,.jsonl,application/json"
            className="hidden"
            data-testid="external-file-input"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <ImportNameDialog
            file={pending}
            existing={pending ? imports.find((i) => i.fileName.trim().toLowerCase() === pending.name.trim().toLowerCase()) : undefined}
            onCancel={() => setPending(undefined)}
            onConfirm={(label) => pending && void confirmImport(pending, label)}
          />
          <Tabs.List
            aria-label="External lineage sections"
            className="atlas-line-tabs border-t border-border bg-secondary/40"
          >
            {tabs.map(({ id, label, count }) => (
              <Tabs.Trigger key={id} value={id} asChild>
                <button
                  type="button"
                  onClick={() => setSection(id)}
                  className="atlas-line-tab grow focus-visible:ring-inset focus-visible:ring-offset-0"
                >
                  {label}
                  {count !== undefined && (
                    <span className="rounded-full bg-muted px-s text-100 font-semibold text-muted-foreground">
                      {count}
                    </span>
                  )}
                </button>
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Card>

        {(message || error) && (
          <div role="status">
            <Note tone={error ? "warning" : message!.tone}>{error ?? message!.text}</Note>
          </div>
        )}

        <Tabs.Content value="imports" className="flex flex-col gap-l outline-none">
          <ImportsTab
            lineage={externalLineage}
            loading={loading}
            busy={busy}
            counts={counts}
            onBrowse={browse}
            onDrop={(file) => handleFile(file)}
            onDelete={async (imp) => {
              await removeImport(imp.id);
              setMessage({ tone: "info", text: `${imp.label} deleted · its edges were removed.` });
            }}
          />
        </Tabs.Content>
        <Tabs.Content value="link" className="outline-none">
          <ExternalLinkTab />
        </Tabs.Content>
        <Tabs.Content value="format" className="outline-none">
          <ExternalFormatTab />
        </Tabs.Content>
        <Tabs.Content value="model" className="outline-none">
          <DataModelTab />
        </Tabs.Content>
        {isPreview && (
          <p className="text-100 text-muted-foreground">
            Preview: sample files are kept in memory only.
          </p>
        )}
      </div>
    </Tabs.Root>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  warning,
}: {
  icon: typeof Globe;
  label: string;
  value: number;
  detail: string;
  warning?: boolean;
}) {
  return (
    <Card className="p-m">
      <div className="flex items-center gap-xs text-200 font-semibold text-muted-foreground">
        <Icon className="size-[14px]" aria-hidden="true" />
        {label}
      </div>
      <div
        className={cn(
          "mt-xs font-numeric text-500 font-bold leading-500 tabular-nums",
          warning && value > 0 && "text-signal-warning-foreground",
        )}
      >
        {value}
      </div>
      <div className="mt-xs text-200 text-muted-foreground">{detail}</div>
    </Card>
  );
}

function ImportsTab({
  lineage,
  loading,
  busy,
  counts,
  onBrowse,
  onDrop,
  onDelete,
}: {
  lineage: ExternalLineage;
  loading: boolean;
  busy: boolean;
  counts: ReturnType<typeof externalCounts>;
  onBrowse: () => void;
  onDrop: (file: File | undefined) => void;
  onDelete: (imp: ExternalImport) => Promise<void>;
}) {
  const [dragging, setDragging] = useState(false);
  const imports = useMemo(
    () => [...lineage.imports].sort((a, b) => b.importedAt.localeCompare(a.importedAt)),
    [lineage.imports],
  );
  const rejected = imports.filter((i) => i.status === "rejected").length;
  const last = imports[0];
  const platforms = [...new Set(lineage.datasets.map((d) => d.platform).filter((p) => p !== "Fabric"))];
  const toLinkByImport = useMemo(() => {
    const byDataset = new Map(lineage.datasets.map((d) => [d.id, d.state]));
    const result = new Map<string, number>();
    for (const imp of imports) {
      const ids = new Set<string>();
      for (const e of lineage.edges) {
        if (e.importId !== imp.id) continue;
        ids.add(e.sourceDatasetId);
        ids.add(e.targetDatasetId);
      }
      result.set(imp.id, [...ids].filter((id) => byDataset.get(id) === "to_link").length);
    }
    return result;
  }, [imports, lineage.datasets, lineage.edges]);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onDrop(e.dataTransfer.files?.[0]);
  };

  return (
    <>
      <div className="grid gap-m sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={FolderOpen}
          label="Imported files"
          value={imports.length}
          detail={`${rejected} rejected${last ? ` · last import ${formatWhen(last.importedAt)}` : ""}`}
        />
        <Kpi
          icon={Globe}
          label="External datasets"
          value={counts.total}
          detail={platforms.length ? platforms.join(" · ") : "No platform yet"}
        />
        <Kpi
          icon={Link2}
          label="Linked to Fabric"
          value={counts.linked}
          detail={`${counts.crossEdges} cross-platform edge${counts.crossEdges === 1 ? "" : "s"} on the map`}
        />
        <Kpi
          icon={AlertTriangle}
          label="To link"
          value={counts.toLink}
          detail="Pick the Fabric item by hand"
          warning
        />
      </div>

      <div className="grid gap-m xl:grid-cols-[1.65fr_1fr]">
        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-baseline gap-xs border-b border-border px-m py-s">
            <h2 className="text-300 font-semibold">Imported files</h2>
            <span className="text-200 text-muted-foreground">
              · stored outside the Fabric snapshot and merged at read time
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-300">
              <thead className="text-100 uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="px-m py-s font-semibold">File</th>
                  <th scope="col" className="px-m py-s font-semibold">Imported by</th>
                  <th scope="col" className="px-m py-s text-right font-semibold">Events</th>
                  <th scope="col" className="px-m py-s text-right font-semibold">Datasets</th>
                  <th scope="col" className="px-m py-s font-semibold">Result</th>
                  <th scope="col" className="px-m py-s"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {imports.map((imp) => {
                  const toLink = toLinkByImport.get(imp.id) ?? 0;
                  return (
                    <tr key={imp.id}>
                      <td className="px-m py-s">
                        <div className="flex items-center gap-s">
                          <PlatformBadge platform={imp.platform} />
                          <div className="min-w-0">
                            <div className="truncate text-300 font-semibold">{imp.label}</div>
                            <div className="truncate text-100 text-muted-foreground">
                              <span className="font-mono">{imp.fileName}</span> · {imp.namespace ?? "—"} · {formatWhen(imp.importedAt)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-m py-s text-200">{actorName(imp)}</td>
                      <td className="px-m py-s text-right tabular-nums">{imp.eventCount}</td>
                      <td className="px-m py-s text-right tabular-nums">{imp.datasetCount}</td>
                      <td className="px-m py-s">
                        {imp.status === "rejected" ? (
                          <span className="rounded-md bg-signal-danger-background px-s py-[2px] text-100 font-semibold text-signal-danger-foreground">
                            {imp.rejectReason ?? "Rejected"}
                          </span>
                        ) : toLink > 0 ? (
                          <span className="rounded-md bg-signal-warning-background px-s py-[2px] text-100 font-semibold text-signal-warning-foreground">
                            {toLink} to link
                          </span>
                        ) : (
                          <span className="rounded-md bg-signal-success-background px-s py-[2px] text-100 font-semibold text-signal-success-foreground">
                            All linked
                          </span>
                        )}
                      </td>
                      <td className="px-m py-s text-right">
                        {imp.status === "rejected" ? (
                          <button
                            type="button"
                            className={cn(SECONDARY_BUTTON, "px-m")}
                            disabled={busy}
                            onClick={() => void onDelete(imp)}
                            aria-label={`Delete ${imp.label}`}
                          >
                            Delete
                          </button>
                        ) : (
                          <div className="flex justify-end gap-xs">
                            <button
                              type="button"
                              className={cn(SECONDARY_BUTTON, "px-m")}
                              disabled={busy}
                              onClick={onBrowse}
                              title="Import the new version of this file — same file name replaces its edges"
                              aria-label={`Replace ${imp.label}`}
                            >
                              Replace
                            </button>
                            <button
                              type="button"
                              className={cn(SECONDARY_BUTTON, "px-s text-muted-foreground")}
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm(`Delete ${imp.label} and its edges?`)) void onDelete(imp);
                              }}
                              aria-label={`Delete ${imp.label}`}
                              title="Delete the file and its edges"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!imports.length && (
                  <tr>
                    <td colSpan={6} className="px-m py-xl text-center text-200 text-muted-foreground">
                      {loading ? "Loading imported files…" : "No OpenLineage file imported yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="min-w-0">
          <div className="border-b border-border px-m py-s">
            <h2 className="text-300 font-semibold">Import a file</h2>
          </div>
          <div className="flex flex-col gap-m p-m">
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop an OpenLineage file or browse"
              onClick={onBrowse}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onBrowse();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "cursor-pointer rounded-lg border-2 border-dashed px-m py-xl text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-input hover:bg-accent/50",
              )}
            >
              <Upload className="mx-auto size-[26px] text-primary" aria-hidden="true" />
              <div className="mt-s text-300">
                <b>Drop an OpenLineage file</b> or{" "}
                <span className="text-brand-foreground underline">browse</span>
              </div>
              <div className="mt-xs text-100 text-muted-foreground">
                .json or .ndjson · RunEvent / JobEvent / DatasetEvent · max 20 MB
              </div>
            </div>
            <Note>
              Atlas only reads standard OpenLineage. Getting the file out of the data source is up to that
              source. Re-importing a file replaces its edges; deleting it removes them.
            </Note>
          </div>
        </Card>
      </div>
    </>
  );
}

const ERD: { name: string; color: string; icon: typeof Database; fields: [string, "pk" | "fk" | "", string][] }[] = [
  {
    name: "OpenLineageImport",
    color: "#0078d4",
    icon: FileCode2,
    fields: [
      ["ImportId", "pk", "guid"],
      ["Label · FileName · FileHash", "", "nvarchar"],
      ["ImportedBy", "", "upn"],
      ["ImportedAt", "", "datetime2"],
      ["EventCount", "", "int"],
      ["Status", "", "accepted | rejected"],
    ],
  },
  {
    name: "ExternalDataset",
    color: "#8764b8",
    icon: Database,
    fields: [
      ["DatasetId", "pk", "hash(ns, name)"],
      ["Namespace · Name", "", "nvarchar"],
      ["FabricItemId", "fk", "guid?"],
      ["State", "", "linked | to link | external"],
      ["LinkedBy", "", "exact path | upn"],
    ],
  },
  {
    name: "ExternalLineageEdge",
    color: "#117865",
    icon: Network,
    fields: [
      ["EdgeId", "pk", "hash(src, tgt, job)"],
      ["ImportId", "fk", "guid"],
      ["SourceDatasetId", "fk", ""],
      ["TargetDatasetId", "fk", ""],
      ["JobName · LastRunState", "", "nvarchar"],
      ["ColumnLineage", "", "json"],
    ],
  },
];

const ERD_HEADER = 34;
const ERD_ROW = 26;
const ERD_BOX_W = 230;
const ERD_SNAPSHOT: (typeof ERD)[number] = {
  name: "Fabric item (snapshot)",
  color: "#605e5c",
  icon: Layers,
  fields: [
    ["ItemId", "pk", "guid"],
    ["Item · ItemDependency", "", "read-only"],
    ["ObjectLineage (columns)", "", "read-only"],
  ],
};
const ERD_BOXES = [
  { table: ERD[0], x: 0, y: 24 },
  { table: ERD[2], x: 300, y: 0 },
  { table: ERD[1], x: 600, y: 24 },
  { table: ERD_SNAPSHOT, x: 900, y: 48 },
];
const ERD_LINKS: { from: [number, number]; to: [number, number]; fromCard: string; toCard: string; label: string; dashed?: boolean }[] = [
  { from: [0, 0], to: [1, 1], fromCard: "1", toCard: "n", label: "ImportId" },
  { from: [1, 2], to: [2, 0], fromCard: "n", toCard: "1", label: "Source" },
  { from: [1, 3], to: [2, 0], fromCard: "n", toCard: "1", label: "Target" },
  { from: [2, 2], to: [3, 0], fromCard: "n", toCard: "0..1", label: "FabricItemId", dashed: true },
];
const ERD_WIDTH = ERD_BOXES[ERD_BOXES.length - 1].x + ERD_BOX_W;
const ERD_HEIGHT = Math.max(...ERD_BOXES.map((b) => b.y + ERD_HEADER + b.table.fields.length * ERD_ROW)) + 8;

function erdRowY(box: number, row: number): number {
  return ERD_BOXES[box].y + ERD_HEADER + row * ERD_ROW + ERD_ROW / 2;
}

function DataModelTab() {
  return (
    <Card className="p-l">
      <div className="overflow-x-auto">
        <div className="relative" style={{ width: ERD_WIDTH, height: ERD_HEIGHT }} data-testid="external-erd">
          <svg className="pointer-events-none absolute inset-0" width={ERD_WIDTH} height={ERD_HEIGHT} aria-hidden="true">
            {ERD_LINKS.map(({ from, to, fromCard, toCard, label, dashed }) => {
              const x1 = ERD_BOXES[from[0]].x + ERD_BOX_W;
              const y1 = erdRowY(from[0], from[1]);
              const x2 = ERD_BOXES[to[0]].x;
              const y2 = erdRowY(to[0], to[1]);
              const mid = (x1 + x2) / 2;
              return (
                <g key={label} data-testid="erd-relation">
                  <path
                    d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="var(--color-muted-foreground)"
                    strokeWidth={1.4}
                    strokeDasharray={dashed ? "5 4" : undefined}
                  />
                  <circle cx={x1} cy={y1} r={3} fill="var(--color-muted-foreground)" />
                  <circle cx={x2} cy={y2} r={3} fill="var(--color-muted-foreground)" />
                  <text x={x1 + 6} y={y1 - 5} fontSize={11} fontWeight={700} fill="var(--color-foreground)">{fromCard}</text>
                  <text x={x2 - 6} y={y2 - 5} fontSize={11} fontWeight={700} textAnchor="end" fill="var(--color-foreground)">{toCard}</text>
                  <text x={mid} y={(y1 + y2) / 2 - 6} fontSize={10} textAnchor="middle" fill="var(--color-muted-foreground)">{label}</text>
                </g>
              );
            })}
          </svg>
          {ERD_BOXES.map(({ table: { name, color, icon: Icon, fields }, x, y }) => (
            <div
              key={name}
              className={cn(
                "absolute overflow-hidden rounded-lg border bg-card shadow-fabric-2",
                name === ERD_SNAPSHOT.name ? "border-dashed border-border" : "border-border",
              )}
              style={{ left: x, top: y, width: ERD_BOX_W }}
            >
              <div className="flex items-center gap-s px-m text-200 font-semibold text-white" style={{ background: color, height: ERD_HEADER }}>
                <Icon className="size-[14px]" aria-hidden="true" />
                {name}
              </div>
              {fields.map(([field, key, type]) => (
                <div key={field} className="flex items-center justify-between gap-s border-t border-border px-m text-100" style={{ height: ERD_ROW }}>
                  <span className={cn("truncate", key && "font-semibold", key === "pk" && "text-brand-foreground")}>
                    {key ? `${key.toUpperCase()} · ` : ""}
                    {field}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{type}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-l grid gap-s text-200 text-muted-foreground sm:grid-cols-3">
        <div>OpenLineageImport 1 — n ExternalLineageEdge (ImportId)</div>
        <div>ExternalDataset 1 — n ExternalLineageEdge (Source / Target)</div>
        <div>ExternalDataset n — 0..1 Fabric item (FabricItemId, optional)</div>
      </div>
      <p className="mt-s text-200 text-muted-foreground">
        Lineage read = snapshot edges <b>∪</b> ExternalLineageEdge, joined on FabricItemId. Snapshot rebuilds never touch
        external tables.
      </p>
    </Card>
  );
}
