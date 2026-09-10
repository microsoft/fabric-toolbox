import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpLeft,
  Copy,
  Download,
  FileText,
  GitBranch,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import {
  buildItemImpactReport,
  buildSchemaObjectImpactReport,
  type ItemImpactReport,
  type SchemaObjectImpactReport,
  type SchemaObjectRef,
} from "../lineage";
import { buildSchemaDependencies } from "../schema-lineage";
import type { AtlasData } from "../model";
import { Card, TypeGlyph, cn } from "../ui";

function safeFileName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "impact-report"
  );
}

function reportMarkdown(
  data: AtlasData,
  report: ItemImpactReport | SchemaObjectImpactReport,
  object?: SchemaObjectRef,
): string {
  const schemaReport =
    object && "granularity" in report ? report : undefined;
  const itemName = report.item?.displayName ?? report.itemId;
  const title = object
    ? `${object.kind}: ${object.name} (${itemName})`
    : itemName;
  const lines = [
    `# Fabric Atlas impact report`,
    "",
    `- Workspace: ${data.workspace.displayName}`,
    `- Subject: ${title}`,
    `- Generated: ${new Date().toISOString()}`,
    `- Dependency granularity: ${schemaReport?.granularity ?? "item"}`,
    "",
    "## Upstream",
    ...(report.upstream.length
      ? report.upstream.map(
          (entry) =>
            `- ${entry.item?.displayName ?? entry.id} (distance ${entry.distance})`,
        )
      : ["- None"]),
    "",
    "## Downstream",
    ...(report.downstream.length
      ? report.downstream.map(
          (entry) =>
            `- ${entry.item?.displayName ?? entry.id} (distance ${entry.distance})`,
        )
      : ["- None"]),
    "",
    "## Relationships",
    ...(report.relevantEdges.length
      ? report.relevantEdges.map(
          (edge) =>
            `- ${edge.source} -> ${edge.target}: ${edge.relation}${edge.broken ? " (broken)" : ""}`,
        )
      : ["- None"]),
  ];
  if (schemaReport?.objectImpact) {
    lines.push(
      "",
      "## Object dependencies",
      ...(schemaReport.objectImpact.upstream.length
        ? schemaReport.objectImpact.upstream.map(
            (entry) =>
              `- ${entry.object.tableName ? `${entry.object.tableName}.` : ""}${entry.object.name} (${entry.confidence}, distance ${entry.distance})`,
          )
        : ["- None"]),
      "",
      "## Object consumers",
      ...(schemaReport.objectImpact.downstream.length
        ? schemaReport.objectImpact.downstream.map(
            (entry) =>
              `- ${entry.object.tableName ? `${entry.object.tableName}.` : ""}${entry.object.name} (${entry.confidence}, distance ${entry.distance})`,
          )
        : ["- None"]),
    );
  } else if (object) {
    lines.push(
      "",
      "> Fabric verifies dependencies at item level. This report does not infer schema-object lineage from matching names.",
    );
  }
  return lines.join("\n");
}

export function ImpactReportDialog({
  data,
  itemId,
  object,
  open,
  onClose,
}: {
  data: AtlasData;
  itemId: string;
  object?: SchemaObjectRef;
  open: boolean;
  onClose: () => void;
}) {
  const returnFocusRef = useRef<HTMLElement>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      {open && (
        <ImpactReportContent
          data={data}
          itemId={itemId}
          object={object}
          returnFocusRef={returnFocusRef}
        />
      )}
    </Dialog.Root>
  );
}

function ImpactReportContent({
  data,
  itemId,
  object,
  returnFocusRef,
}: {
  data: AtlasData;
  itemId: string;
  object?: SchemaObjectRef;
  returnFocusRef: React.RefObject<HTMLElement | null>;
}) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dependencies = useMemo(
    () => (object ? buildSchemaDependencies(data) : []),
    [data, object],
  );
  const report = useMemo<ItemImpactReport | SchemaObjectImpactReport>(
    () =>
      object
        ? buildSchemaObjectImpactReport(data, object, { dependencies })
        : buildItemImpactReport(data, itemId),
    [data, dependencies, itemId, object],
  );
  const schemaReport = object
    ? (report as SchemaObjectImpactReport)
    : undefined;
  const subject =
    object?.name ?? report.item?.displayName ?? report.itemId ?? "Impact report";
  const markdown = useMemo(
    () => reportMarkdown(data, report, object),
    [data, object, report],
  );

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this impact report", markdown);
    }
  };

  const download = () => {
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(subject)}-impact.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog.Portal>
      <Dialog.Overlay asChild>
        <motion.div
          className="fixed inset-0 z-[110] bg-black/55 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        />
      </Dialog.Overlay>
      <div className="pointer-events-none fixed inset-0 z-[111] flex items-center justify-center p-m sm:p-xl">
        <Dialog.Content
          asChild
          onOpenAutoFocus={(event) => {
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            event.preventDefault();
            closeRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
            returnFocusRef.current = null;
          }}
        >
          <motion.section
            aria-labelledby="impact-report-title"
            aria-describedby="impact-report-description"
            className="pointer-events-auto flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-fabric-16"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
          >
            <header className="atlas-fabric-hero flex flex-col gap-m border-b border-border p-l sm:flex-row sm:items-center">
              <span className="atlas-brand-mark flex icon-size-700 shrink-0 items-center justify-center rounded-xl text-primary-foreground">
                <GitBranch className="icon-size-400" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-200 font-semibold uppercase tracking-[0.12em] text-brand-foreground">
                  Impact report
                </div>
                <Dialog.Title asChild>
                  <h2
                    id="impact-report-title"
                    className="mt-xs truncate font-heading text-500 font-bold leading-500"
                  >
                    {subject}
                  </h2>
                </Dialog.Title>
                <Dialog.Description
                  id="impact-report-description"
                  className="mt-xs text-200 text-muted-foreground"
                >
                  Verified workspace dependencies and affected items.
                </Dialog.Description>
              </div>
              <div className="flex items-center gap-s">
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="inline-flex items-center gap-s rounded-lg border border-border bg-card px-m py-s text-200 font-semibold hover:bg-accent"
                >
                  <Copy className="icon-size-100" aria-hidden="true" />
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={download}
                  className="inline-flex items-center gap-s rounded-lg bg-primary px-m py-s text-200 font-semibold text-primary-foreground hover:brightness-110"
                >
                  <Download className="icon-size-100" aria-hidden="true" />
                  Export
                </button>
                <Dialog.Close asChild>
                  <button
                    ref={closeRef}
                    type="button"
                    aria-label="Close impact report"
                    className="rounded-lg p-s text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="icon-size-200" />
                  </button>
                </Dialog.Close>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-l sm:p-xl">
              {schemaReport?.granularity === "item" && (
                <div className="mb-l flex gap-m rounded-xl border border-status-warning/30 bg-status-warning/10 p-m text-200 text-muted-foreground">
                  <AlertTriangle
                    className="icon-size-200 shrink-0 text-status-warning"
                    aria-hidden="true"
                  />
                  <p>
                    Fabric exposes verified lineage at item level for this
                    object. The report does not claim field or visual usage that
                    the source APIs do not provide.
                  </p>
                </div>
              )}
              {schemaReport?.objectImpact && (
                <Card className="mb-l overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-m border-b border-border bg-secondary px-l py-m">
                    <div>
                      <h3 className="text-300 font-semibold">
                        Object dependency evidence
                      </h3>
                      <p className="text-200 text-muted-foreground">
                        DAX references resolved only to synchronized schema
                        objects.
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-s py-xs text-200 font-semibold",
                        schemaReport.verifiedObjectDependencies
                          ? "border-status-healthy/30 bg-status-healthy/10 text-status-healthy"
                          : "border-status-warning/30 bg-status-warning/10 text-status-warning",
                      )}
                    >
                      {schemaReport.verifiedObjectDependencies
                        ? "Verified by DAX"
                        : "Inferred from item lineage"}
                    </span>
                  </div>
                  <div className="grid gap-l p-l lg:grid-cols-2">
                    <SchemaImpactList
                      title="Depends on"
                      entries={schemaReport.objectImpact.upstream}
                    />
                    <SchemaImpactList
                      title="Used by"
                      entries={schemaReport.objectImpact.downstream}
                    />
                  </div>
                </Card>
              )}

              <section
                aria-label="Impact summary"
                className="grid gap-m sm:grid-cols-2 xl:grid-cols-4"
              >
                {[
                  {
                    label: "Upstream",
                    value: report.upstream.length,
                    icon: ArrowUpLeft,
                    tone: "text-lineage-upstream bg-lineage-upstream/10",
                  },
                  {
                    label: "Downstream",
                    value: report.downstream.length,
                    icon: ArrowDownRight,
                    tone: "text-lineage-downstream bg-lineage-downstream/10",
                  },
                  {
                    label: "Relationships",
                    value: report.relevantEdges.length,
                    icon: GitBranch,
                    tone: "text-brand-foreground bg-primary/10",
                  },
                  {
                    label: "Unresolved",
                    value: report.unresolvedEndpointIds.length,
                    icon: AlertTriangle,
                    tone:
                      report.unresolvedEndpointIds.length > 0
                        ? "text-status-failing bg-status-failing/10"
                        : "text-status-healthy bg-status-healthy/10",
                  },
                ].map(({ label, value, icon: Icon, tone }) => (
                  <Card key={label} className="flex items-center gap-m p-m">
                    <span
                      className={`flex icon-size-600 items-center justify-center rounded-xl ${tone}`}
                    >
                      <Icon className="icon-size-200" aria-hidden="true" />
                    </span>
                    <div>
                      <div className="font-numeric text-500 font-bold">
                        {value}
                      </div>
                      <div className="text-200 text-muted-foreground">
                        {label}
                      </div>
                    </div>
                  </Card>
                ))}
              </section>

              <div className="mt-l grid gap-l lg:grid-cols-2">
                <ImpactList
                  title="Upstream dependencies"
                  empty="No upstream dependency was returned."
                  entries={report.upstream}
                  tone="upstream"
                />
                <ImpactList
                  title="Downstream consumers"
                  empty="No downstream consumer was returned."
                  entries={report.downstream}
                  tone="downstream"
                />
              </div>

              <Card className="mt-l overflow-hidden">
                <div className="flex items-center gap-m border-b border-border bg-secondary px-l py-m">
                  <FileText
                    className="icon-size-200 text-brand-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-300 font-semibold">
                      Relationship evidence
                    </h3>
                    <p className="text-200 text-muted-foreground">
                      Edges returned by the synchronized lineage metadata.
                    </p>
                  </div>
                </div>
                {report.relevantEdges.length === 0 ? (
                  <p className="p-l text-300 text-muted-foreground">
                    No relationship evidence is available for this selection.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {report.relevantEdges.map((edge) => (
                      <div
                        key={`${edge.source}-${edge.target}-${edge.relation}`}
                        className="grid gap-xs px-l py-m text-200 sm:grid-cols-[1fr_auto_1fr]"
                      >
                        <span className="truncate font-mono">{edge.source}</span>
                        <span className="text-muted-foreground">
                          {edge.relation}
                        </span>
                        <span className="truncate text-right font-mono">
                          {edge.target}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </motion.section>
        </Dialog.Content>
      </div>
    </Dialog.Portal>
  );
}

function SchemaImpactList({
  title,
  entries,
}: {
  title: string;
  entries: NonNullable<
    SchemaObjectImpactReport["objectImpact"]
  >["upstream"];
}) {
  return (
    <section>
      <h4 className="text-300 font-semibold">{title}</h4>
      {entries.length === 0 ? (
        <p className="mt-s text-200 text-muted-foreground">None</p>
      ) : (
        <div className="mt-s space-y-xs">
          {entries.map((entry) => (
            <div
              key={`${entry.object.itemId}:${entry.object.tableName}:${entry.object.name}`}
              className="flex items-center justify-between gap-m rounded-lg border border-border bg-secondary/50 px-m py-s"
            >
              <span className="min-w-0 truncate text-200 font-semibold">
                {entry.object.tableName
                  ? `${entry.object.tableName}.${entry.object.name}`
                  : entry.object.name}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-s py-xxs text-100 font-semibold",
                  entry.confidence === "verified"
                    ? "bg-status-healthy/10 text-status-healthy"
                    : "bg-status-warning/10 text-status-warning",
                )}
              >
                {entry.confidence === "verified" ? "DAX" : "Inferred"}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ImpactList({
  title,
  empty,
  entries,
  tone,
}: {
  title: string;
  empty: string;
  entries: ReturnType<typeof buildItemImpactReport>["upstream"];
  tone: "upstream" | "downstream";
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-secondary px-l py-m">
        <h3 className="text-300 font-semibold">{title}</h3>
      </div>
      {entries.length === 0 ? (
        <p className="p-l text-300 text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-m px-l py-m">
              {entry.item && (
                <TypeGlyph type={entry.item.itemType} size={32} />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-300 font-semibold">
                  {entry.item?.displayName ?? entry.id}
                </div>
                <div className="text-200 text-muted-foreground">
                  {entry.item?.itemType ?? "Unresolved item"}
                </div>
              </div>
              <span
                className={`rounded-full px-s py-xs font-numeric text-200 font-semibold ${
                  tone === "upstream"
                    ? "bg-lineage-upstream/10 text-lineage-upstream"
                    : "bg-lineage-downstream/10 text-lineage-downstream"
                }`}
              >
                {entry.distance} hop{entry.distance === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
