import type { ReactNode } from "react";
import { Link2, Workflow, X } from "lucide-react";
import { cn } from "../ui";
import {
  EXACT_PATH,
  type ExternalDatasetRecord,
  type ExternalEdgeRecord,
  type ExternalLineage,
} from "../external-lineage";
import { LINEAGE_ARROW_TIP, lineageCurve, type GraphPoint } from "../map-geometry";
import {
  externalDownstream,
  jobKeyOf,
  type ExternalLinkBadge,
  type ExternalMapNode,
  type ExternalOverlay,
} from "../map-external";
import type { Edge, Item } from "../model";
import { ExternalPill, Note, PlatformBadge } from "./ExternalLineageParts";

export const EXTERNAL_COLOR = "#0078d4";
export const LINK_COLOR = "#c239b3";
export const EXTERNAL_DASH = "6 4";
export const LINK_DASH = "2 4";

export type ExternalSelection =
  | { kind: "job"; key: string }
  | { kind: "dataset"; datasetId: string }
  | { kind: "link"; itemId: string };

function who(linkedBy?: string) {
  return linkedBy ? linkedBy.split("@")[0] : "unknown";
}

/** Lane background drawn behind the external nodes. */
export function ExternalLane({ overlay, top, height }: { overlay: ExternalOverlay; top: number; height: number }) {
  if (!overlay.nodes.length) return null;
  return (
    <div
      data-testid="external-lane"
      className="pointer-events-none absolute left-[14px] rounded-xl border border-dashed bg-[#0078d4]/[0.035]"
      style={{ top, width: overlay.width - 28, height, borderColor: `${EXTERNAL_COLOR}66` }}
    >
      <span
        className="absolute left-[12px] top-[8px] max-w-[calc(100%_-_24px)] truncate rounded-md bg-background/80 px-[7px] py-[2px] text-[9px] font-bold uppercase tracking-[0.1em]"
        style={{ color: EXTERNAL_COLOR }}
      >
        {overlay.platforms.join(" · ")} · external · OpenLineage
      </span>
    </div>
  );
}

/** OpenLineage and link edges; rendered inside the Map svg. */
export function ExternalEdges({
  overlay,
  pointOf,
  width,
  height,
  zoom,
  selectedJob,
  onSelect,
}: {
  overlay: ExternalOverlay;
  pointOf: (key: string) => GraphPoint;
  width: number;
  height: number;
  zoom: number;
  selectedJob?: string;
  onSelect: (selection: ExternalSelection) => void;
}) {
  return (
    <g data-testid="external-edges">
      <defs>
        <marker
          id="atlas-external"
          markerWidth="7"
          markerHeight="7"
          refX={LINEAGE_ARROW_TIP}
          refY="3.5"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M1 0.75 7 3.5 1 6.25" fill="none" stroke={EXTERNAL_COLOR} strokeWidth="1.5" strokeLinecap="round" />
        </marker>
      </defs>
      {overlay.edges.map((edge) => {
        const curve = lineageCurve(pointOf(edge.source), pointOf(edge.target), width, height, zoom);
        const link = edge.kind === "link";
        const active = !link && edge.jobKey === selectedJob;
        const select = () =>
          onSelect(link ? { kind: "dataset", datasetId: edge.datasetId! } : { kind: "job", key: edge.jobKey! });
        return (
          <g key={edge.key} data-edge-kind={edge.kind}>
            <title>{link ? "Link point = same dataset" : "OpenLineage (external)"}</title>
            <path
              d={curve.path}
              fill="none"
              stroke={link ? LINK_COLOR : EXTERNAL_COLOR}
              strokeWidth={link ? 2.5 : active ? 2.6 : 1.8}
              strokeOpacity={active || link ? 0.95 : 0.75}
              strokeDasharray={link ? LINK_DASH : EXTERNAL_DASH}
              markerEnd={link ? undefined : "url(#atlas-external)"}
            />
            <path
              role="button"
              aria-label={link ? "Link point" : "OpenLineage edge"}
              d={curve.path}
              fill="none"
              stroke="transparent"
              strokeWidth={12}
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onClick={select}
            />
          </g>
        );
      })}
    </g>
  );
}

function NodeButton({
  node,
  selected,
  onSelect,
  width,
  height,
}: {
  node: ExternalMapNode;
  selected: boolean;
  onSelect: () => void;
  width: number;
  height: number;
}) {
  const job = node.kind === "job";
  return (
    <button
      type="button"
      data-testid="external-node"
      aria-pressed={selected}
      aria-label={`${node.label}, ${job ? "external job" : "external dataset"}, ${node.platform}`}
      title={`${node.namespace}\n${node.label}`}
      onClick={onSelect}
      className={cn(
        "absolute z-[3] flex items-center gap-[10px] rounded-lg border bg-card px-[12px] text-left shadow-fabric-2 hover:-translate-y-[1px] hover:shadow-fabric-8",
        job ? "border-solid" : "border-dashed",
      )}
      style={{
        left: node.x,
        top: node.y,
        width,
        height,
        borderColor: selected ? EXTERNAL_COLOR : `${EXTERNAL_COLOR}80`,
        boxShadow: selected ? `0 0 0 2px ${EXTERNAL_COLOR}` : undefined,
      }}
    >
      <span
        className="flex size-[34px] shrink-0 items-center justify-center rounded-md"
        style={{ background: `${EXTERNAL_COLOR}14`, color: EXTERNAL_COLOR }}
      >
        {job ? <Workflow size={18} aria-hidden="true" /> : <PlatformBadge platform={node.platform} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 break-all text-200 font-semibold leading-200">{node.label}</span>
        <span className="line-clamp-1 text-200 leading-200 text-muted-foreground">
          {job ? `${node.platform} job` : `${node.platform} dataset`}
        </span>
        <span className="line-clamp-1 text-200 leading-200" style={{ color: EXTERNAL_COLOR }}>
          OpenLineage · external
        </span>
      </span>
    </button>
  );
}

export function ExternalNodes({
  overlay,
  selection,
  onSelect,
  width,
  height,
}: {
  overlay: ExternalOverlay;
  selection: ExternalSelection | null;
  onSelect: (selection: ExternalSelection) => void;
  width: number;
  height: number;
}) {
  return (
    <>
      {overlay.nodes.map((node) => (
        <NodeButton
          key={node.key}
          node={node}
          width={width}
          height={height}
          selected={
            node.kind === "job"
              ? selection?.kind === "job" && selection.key === node.key
              : selection?.kind === "dataset" && selection.datasetId === node.datasetId
          }
          onSelect={() =>
            onSelect(node.kind === "job" ? { kind: "job", key: node.key } : { kind: "dataset", datasetId: node.datasetId! })
          }
        />
      ))}
    </>
  );
}

/** Link point badges on top of the linked Fabric items. */
export function ExternalBadges({
  badges,
  pointOf,
  width,
  selection,
  onSelect,
}: {
  badges: ExternalLinkBadge[];
  pointOf: (id: string) => GraphPoint;
  width: number;
  selection: ExternalSelection | null;
  onSelect: (selection: ExternalSelection) => void;
}) {
  return (
    <>
      {badges.map((badge) => {
        const point = pointOf(badge.itemId);
        const active = selection?.kind === "link" && selection.itemId === badge.itemId;
        return (
          <button
            key={badge.itemId}
            type="button"
            data-testid="external-badge"
            onClick={() => onSelect({ kind: "link", itemId: badge.itemId })}
            className="absolute z-[6] inline-flex max-w-[200px] -translate-y-1/2 items-center gap-[4px] truncate rounded-full border-[1.5px] bg-white px-[8px] py-[1px] text-[10px] font-semibold shadow-fabric-2 hover:shadow-fabric-8"
            style={{
              left: point.x + width - 12,
              top: point.y,
              transform: "translate(-100%, -50%)",
              borderColor: LINK_COLOR,
              color: LINK_COLOR,
              boxShadow: active ? `0 0 0 2px ${LINK_COLOR}55` : undefined,
            }}
          >
            <Link2 size={11} aria-hidden="true" />
            {badge.label}
          </button>
        );
      })}
    </>
  );
}

/* ------------------------------ inspector ------------------------------ */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border p-[16px]">
      <h3 className="mb-s text-100 font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-s py-[3px] text-200">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone?: "link" | "ok" }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-sm border px-xs py-[1px] text-100",
        tone === "ok" && "border-signal-success-foreground/30 bg-signal-success-background text-signal-success-foreground",
        !tone && "border-border bg-secondary text-foreground",
      )}
      style={tone === "link" ? { borderColor: LINK_COLOR, color: LINK_COLOR } : undefined}
    >
      {children}
    </span>
  );
}

function linkText(ds: ExternalDatasetRecord): string {
  if (ds.state === "linked") return ds.linkedBy === EXACT_PATH ? "Exact OneLake path" : `Manual (${who(ds.linkedBy)})`;
  return ds.state === "external" ? "Kept external" : "To link";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Header({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="border-b border-border p-[16px] pr-[56px]">
      <ExternalPill>OpenLineage</ExternalPill>
      <h2 className="mt-s break-words text-[17px] font-bold">{title}</h2>
      {subtitle && <div className="mt-[2px] break-all text-200 text-muted-foreground">{subtitle}</div>}
    </div>
  );
}

function Impact({
  lineage,
  snapshot,
  datasetIds,
  itemById,
}: {
  lineage: ExternalLineage;
  snapshot: readonly Edge[];
  datasetIds: string[];
  itemById: ReadonlyMap<string, Item>;
}) {
  const impact = externalDownstream(lineage, snapshot, datasetIds, itemById);
  return (
    <Section title="Downstream impact">
      <div className="grid grid-cols-3 gap-s" data-testid="external-impact">
        {[
          ["Fabric items", impact.items.length],
          ["Workspaces", impact.workspaces],
          ["Reports", impact.reports],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border p-s text-center">
            <div className="font-numeric text-400 font-bold leading-400">{value}</div>
            <div className="mt-xs text-100 text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      {impact.items.length > 0 && (
        <p className="mt-s text-200 text-muted-foreground">{impact.items.map((i) => `${i.displayName} (${i.itemType})`).join(", ")}</p>
      )}
    </Section>
  );
}

function Footer() {
  return (
    <div className="p-[16px]">
      <Note>
        Stored in ExternalLineageEdge, merged with the snapshot at read time. Deleting the imported file removes its
        edges.
      </Note>
    </div>
  );
}

function DatasetLine({ ds, itemById }: { ds: ExternalDatasetRecord; itemById: ReadonlyMap<string, Item> }) {
  const item = ds.fabricItemId ? itemById.get(ds.fabricItemId) : undefined;
  return (
    <li className="flex items-start gap-s py-[3px] text-200">
      <PlatformBadge platform={ds.platform} />
      <span className="min-w-0 flex-1">
        <span className="block break-all font-semibold">{ds.name}</span>
        <span className="block break-all text-muted-foreground">
          {item ? `${item.displayName}${ds.fabricObjectName ? ` · ${ds.fabricObjectName}` : ""}` : ds.namespace}
        </span>
      </span>
      <Chip tone={ds.state === "linked" ? "link" : undefined}>{linkText(ds)}</Chip>
    </li>
  );
}

function HowItMeets({ job, target, item }: { job: string; target?: ExternalDatasetRecord; item?: Item }) {
  const steps = [
    `The imported file says ${job} writes ${target?.name ?? "a dataset"}.`,
    !target || target.state !== "linked"
      ? "No Fabric item is linked to this dataset yet. Link it in External lineage › Link to Fabric."
      : target.linkedBy === EXACT_PATH
        ? `Atlas found the same OneLake path on ${item?.displayName ?? "a Fabric item"}.`
        : `${who(target.linkedBy)} linked the dataset to ${item?.displayName ?? "a Fabric item"}.`,
    "The Map joins both graphs at this link point. Impact then follows Fabric lineage.",
  ];
  return (
    <Section title="How external meets internal">
      <ol className="space-y-s">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-s text-200">
            <span
              className="flex size-[20px] shrink-0 items-center justify-center rounded-full text-100 font-bold text-white"
              style={{ background: i === 1 ? LINK_COLOR : EXTERNAL_COLOR }}
            >
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function JobPane({
  jobKey,
  lineage,
  snapshot,
  itemById,
}: {
  jobKey: string;
  lineage: ExternalLineage;
  snapshot: readonly Edge[];
  itemById: ReadonlyMap<string, Item>;
}) {
  const edges = lineage.edges.filter((e) => jobKeyOf(e) === jobKey);
  const byId = new Map(lineage.datasets.map((d) => [d.id, d]));
  const first: ExternalEdgeRecord | undefined = [...edges].sort((a, b) =>
    (b.lastRunTime ?? "").localeCompare(a.lastRunTime ?? ""),
  )[0];
  if (!first) return null;
  const inputs = [...new Set(edges.map((e) => e.sourceDatasetId))].map((id) => byId.get(id)).filter(Boolean) as ExternalDatasetRecord[];
  const targets = [...new Set(edges.map((e) => e.targetDatasetId))].map((id) => byId.get(id)).filter(Boolean) as ExternalDatasetRecord[];
  const target = targets[0];
  const targetItem = target?.fabricItemId ? itemById.get(target.fabricItemId) : undefined;
  const files = [...new Set(edges.map((e) => lineage.imports.find((i) => i.id === e.importId)?.label).filter(Boolean))];
  const columns = edges.flatMap((e) => e.columns.map((c) => ({ ...c, truncated: e.columnTruncated })));
  const sourcePlatform = byId.get(first.sourceDatasetId)?.platform ?? "";
  return (
    <>
      <Header
        title={`${jobPlatform(first.jobNamespace, sourcePlatform)} → ${targetItem?.displayName ?? target?.name ?? "target"}`}
        subtitle={targetItem && target?.fabricObjectName ? target.fabricObjectName : target?.name}
       
      />
      <Section title="Edge">
        <dl>
          <Row label="Job">
            <span className="font-semibold">{first.jobName}</span>
            <span className="block break-all text-muted-foreground">{first.jobNamespace}</span>
          </Row>
          <Row label="Imported from">{files.join(", ") || "—"}</Row>
          <Row label="Last run in file">
            <span className="inline-flex flex-wrap items-center gap-xs">
              {first.lastRunState && <Chip tone={first.lastRunState === "COMPLETE" ? "ok" : undefined}>{first.lastRunState}</Chip>}
              <span>{formatDate(first.lastRunTime)}</span>
              <span className="text-muted-foreground">(from file)</span>
            </span>
          </Row>
          <Row label="Run id">
            <span className="break-all font-mono text-100">{first.runId ?? "—"}</span>
          </Row>
          {targets.map((t) => {
            const item = t.fabricItemId ? itemById.get(t.fabricItemId) : undefined;
            return (
              <Row key={t.id} label="Target">
                <span className="inline-flex flex-wrap items-center gap-xs">
                  <span className="break-all">{item?.displayName ?? t.name}</span>
                  {item?.endorsement === "certified" && <Chip tone="ok">Certified</Chip>}
                </span>
                {item && t.fabricObjectName && <span className="block text-muted-foreground">{t.fabricObjectName}</span>}
              </Row>
            );
          })}
          <Row label="Link">
            {targets.map((t) => (
              <Chip key={t.id} tone={t.state === "linked" ? "link" : undefined}>
                {linkText(t)}
              </Chip>
            ))}
          </Row>
        </dl>
      </Section>
      <HowItMeets job={first.jobName} target={target} item={targetItem} />
      <Section title="Inputs (external)">
        <ul>
          {inputs.map((ds) => (
            <DatasetLine key={ds.id} ds={ds} itemById={itemById} />
          ))}
        </ul>
      </Section>
      <Section title="Column lineage · columnLineage facet">
        {columns.length ? (
          <ul className="space-y-[2px] font-mono text-100" data-testid="external-columns">
            {columns.map((c) => (
              <li key={`${c.from}>${c.to}`} className="break-all">
                {c.from} → <span className="font-semibold">{c.to}</span>
                {c.transform ? <span className="text-muted-foreground"> ({c.transform})</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-200 text-muted-foreground">No columnLineage facet in the file.</p>
        )}
        {columns.some((c) => c.truncated) && (
          <p className="mt-xs text-100 text-muted-foreground">Column list truncated at import.</p>
        )}
      </Section>
      <Impact lineage={lineage} snapshot={snapshot} datasetIds={targets.map((t) => t.id)} itemById={itemById} />
      <Footer />
    </>
  );
}

function jobPlatform(namespace: string, fallback: string): string {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(namespace)?.[1]?.toLowerCase();
  if (scheme === "source") return "Data source";
  if (scheme === "databricks") return "Databricks";
  return fallback || scheme?.toUpperCase() || "External";
}

function DatasetPane({
  ds,
  lineage,
  snapshot,
  itemById,
}: {
  ds: ExternalDatasetRecord;
  lineage: ExternalLineage;
  snapshot: readonly Edge[];
  itemById: ReadonlyMap<string, Item>;
}) {
  const jobs = [
    ...new Set(
      lineage.edges
        .filter((e) => e.sourceDatasetId === ds.id || e.targetDatasetId === ds.id)
        .map((e) => e.jobName),
    ),
  ];
  const item = ds.fabricItemId ? itemById.get(ds.fabricItemId) : undefined;
  return (
    <>
      <Header title={ds.name} subtitle={ds.namespace} />
      <Section title="Dataset">
        <dl>
          <Row label="Platform">
            <PlatformBadge platform={ds.platform} /> <span className="ml-xs">{ds.platform}</span>
          </Row>
          <Row label="Link">
            <Chip tone={ds.state === "linked" ? "link" : undefined}>{linkText(ds)}</Chip>
          </Row>
          {item && (
            <Row label="Fabric item">
              {item.displayName}
              {ds.fabricObjectName && <span className="block text-muted-foreground">{ds.fabricObjectName}</span>}
            </Row>
          )}
          {ds.linkedAt && ds.state === "linked" && <Row label="Linked at">{formatDate(ds.linkedAt)}</Row>}
          <Row label="Jobs">{jobs.join(", ") || "—"}</Row>
        </dl>
      </Section>
      <Impact lineage={lineage} snapshot={snapshot} datasetIds={[ds.id]} itemById={itemById} />
      <Footer />
    </>
  );
}

function LinkPane({
  itemId,
  badge,
  lineage,
  snapshot,
  itemById,
}: {
  itemId: string;
  badge?: ExternalLinkBadge;
  lineage: ExternalLineage;
  snapshot: readonly Edge[];
  itemById: ReadonlyMap<string, Item>;
}) {
  const item = itemById.get(itemId);
  const ids = badge?.datasetIds ?? [];
  const datasets = lineage.datasets.filter((d) => ids.includes(d.id));
  return (
    <>
      <Header title="Link point" subtitle={item?.displayName} />
      <Section title="Same dataset, two graphs">
        <p className="mb-s text-200 text-muted-foreground">
          These external datasets are the same data as {item?.displayName ?? "this Fabric item"}. Atlas joins the
          OpenLineage graph and the Fabric graph here.
        </p>
        <ul>
          {datasets.map((ds) => (
            <DatasetLine key={ds.id} ds={ds} itemById={itemById} />
          ))}
        </ul>
      </Section>
      <Impact lineage={lineage} snapshot={snapshot} datasetIds={ids} itemById={itemById} />
      <Footer />
    </>
  );
}

export function ExternalMapInspector({
  selection,
  overlay,
  lineage,
  snapshot,
  itemById,
  onClose,
}: {
  selection: ExternalSelection;
  overlay: ExternalOverlay;
  lineage: ExternalLineage;
  snapshot: readonly Edge[];
  itemById: ReadonlyMap<string, Item>;
  onClose: () => void;
}) {
  let body: ReactNode = null;
  if (selection.kind === "job") {
    body = <JobPane jobKey={selection.key} lineage={lineage} snapshot={snapshot} itemById={itemById} />;
  } else if (selection.kind === "dataset") {
    const ds = lineage.datasets.find((d) => d.id === selection.datasetId);
    body = ds ? <DatasetPane ds={ds} lineage={lineage} snapshot={snapshot} itemById={itemById} /> : null;
  } else {
    body = (
      <LinkPane
        itemId={selection.itemId}
        badge={overlay.badges.find((b) => b.itemId === selection.itemId)}
        lineage={lineage}
        snapshot={snapshot}
        itemById={itemById}
      />
    );
  }
  return (
    <aside
      aria-label="External lineage inspector"
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <button
        type="button"
        aria-label="Back to item details"
        onClick={onClose}
        className="absolute right-[16px] top-[16px] z-10 flex h-[32px] w-[32px] items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X size={14} />
      </button>
      {body}
    </aside>
  );
}

