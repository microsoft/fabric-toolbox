import { ArrowRight } from "lucide-react";
import type { MouseEvent } from "react";
import type { HistoricalSnapshot } from "../history";
import {
  TIME_MACHINE_VIEWS,
  edgeInView,
  nodeVisibleIn,
  type LineageTimeMachine,
  type TimeMachineEdgeState,
  type TimeMachineItemField,
  type TimeMachineNode,
  type TimeMachineNodeState,
  type TimeMachineView,
} from "../lineage-time-machine";
import { relativeTime, typeMeta, type Item } from "../model";
import { cn, TypeGlyph } from "../ui";

export const TIME_MACHINE_NODE_W = 200;
export const TIME_MACHINE_NODE_H = 64;

const NODE_STATE_LABEL: Record<TimeMachineNodeState, string> = {
  retained: "Unchanged",
  added: "Added",
  removed: "Removed",
  changed: "Changed",
};

const EDGE_STATE_LABEL: Record<TimeMachineEdgeState, string> = {
  retained: "unchanged",
  added: "added",
  removed: "removed",
  reversed: "reversed",
  changed: "changed",
};

const FIELD_LABEL: Record<TimeMachineItemField, string> = {
  displayName: "Name",
  itemType: "Type",
  health: "Health",
  ownerName: "Documented owner",
  ownerEmail: "Owner email",
  sensitivity: "Sensitivity",
  endorsement: "Endorsement",
};

const VIEW_LABEL: Record<TimeMachineView, string> = {
  before: "Before",
  changes: "Changes",
  after: "After",
};

function edgeStyle(state: TimeMachineEdgeState, view: TimeMachineView) {
  if (view !== "changes" || state === "retained") {
    return { stroke: "var(--color-lineage-neutral)", dash: undefined, opacity: 0.6 };
  }
  switch (state) {
    case "added":
      return { stroke: "var(--color-status-healthy)", dash: undefined, opacity: 0.95 };
    case "removed":
      return { stroke: "var(--color-destructive)", dash: "6 5", opacity: 0.8 };
    case "reversed":
      return { stroke: "var(--color-status-warning)", dash: "3 4", opacity: 0.95 };
    default:
      return { stroke: "var(--color-status-warning)", dash: undefined, opacity: 0.95 };
  }
}

function nodeTone(state: TimeMachineNodeState, view: TimeMachineView): string {
  if (view !== "changes") return "border-border";
  switch (state) {
    case "added":
      return "border-status-healthy";
    case "removed":
      return "border-dashed border-destructive opacity-70";
    case "changed":
      return "border-status-warning";
    default:
      return "border-border";
  }
}

function curve(
  source: { x: number; y: number },
  target: { x: number; y: number },
): string {
  const x1 = source.x + TIME_MACHINE_NODE_W;
  const y1 = source.y + TIME_MACHINE_NODE_H / 2;
  const x2 = target.x;
  const y2 = target.y + TIME_MACHINE_NODE_H / 2;
  const bend = Math.max(40, Math.abs(x2 - x1) * 0.32);
  return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
}

function fieldText(item: Item | undefined, field: TimeMachineItemField): string {
  if (!item) return "—";
  const value =
    field === "sensitivity" ? item.sensitivity ?? item.sensitivityLabelId : item[field];
  return typeof value === "string" && value.trim() ? value : "Not recorded";
}

function snapshotLabel(snapshot: HistoricalSnapshot): string {
  return snapshot.syncedAt ? relativeTime(snapshot.syncedAt) : snapshot.snapshotId;
}

export function LineageTimeMachineView({
  machine,
  from,
  to,
  view,
  onViewChange,
  selectedId,
  onSelect,
  changeCenterHref,
  onOpenChangeCenter,
}: {
  machine: LineageTimeMachine;
  from: HistoricalSnapshot;
  to: HistoricalSnapshot;
  view: TimeMachineView;
  onViewChange: (view: TimeMachineView) => void;
  selectedId: string;
  onSelect: (id: string) => void;
  changeCenterHref: (search?: string) => string;
  onOpenChangeCenter: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const { layout } = machine;
  const selected = machine.nodes.find((node) => node.id === selectedId);
  const nameOf = (id: string) =>
    machine.nodes.find((node) => node.id === id)?.item.displayName ?? id;
  const position = (id: string) => layout.positions.get(id) ?? { x: 0, y: 0 };
  const nodeCounts = machine.counts.nodes;
  const edgeCounts = machine.counts.edges;
  const selectedEdges = selected
    ? machine.edges.filter(
        (edge) =>
          edge.state !== "retained" &&
          [edge.before, edge.after].some(
            (entry) => entry?.source === selected.id || entry?.target === selected.id,
          ),
      )
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-m">
      <div className="flex flex-wrap items-center justify-between gap-m">
        <div
          role="radiogroup"
          aria-label="Snapshot view"
          className="flex rounded-md border border-border bg-secondary p-xxs"
        >
          {TIME_MACHINE_VIEWS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={view === value}
              onClick={() => onViewChange(value)}
              className={cn(
                "min-h-[var(--atlas-touch-target)] rounded-md px-l text-300 font-semibold text-muted-foreground sm:min-h-[var(--atlas-control-height)]",
                view === value && "bg-card text-brand-foreground shadow-fabric-2",
              )}
            >
              {VIEW_LABEL[value]}
              {value === "before" ? ` · ${snapshotLabel(from)}` : ""}
              {value === "after" ? ` · ${snapshotLabel(to)}` : ""}
            </button>
          ))}
        </div>
        <p className="text-200 text-muted-foreground" aria-live="polite">
          Items: {nodeCounts.added} added · {nodeCounts.removed} removed ·{" "}
          {nodeCounts.changed} changed. Relationships: {edgeCounts.added} added ·{" "}
          {edgeCounts.removed} removed · {edgeCounts.reversed} reversed ·{" "}
          {edgeCounts.changed} changed.
        </p>
      </div>

      <div
        role="group"
        aria-label="Time machine legend"
        className="flex flex-wrap items-center gap-x-m gap-y-xs text-200 text-muted-foreground"
      >
        {[
          ["Added", "var(--color-status-healthy)", undefined],
          ["Removed (historical)", "var(--color-destructive)", "6 5"],
          ["Changed", "var(--color-status-warning)", undefined],
          ["Reversed", "var(--color-status-warning)", "3 4"],
          ["Unchanged", "var(--color-lineage-neutral)", undefined],
        ].map(([label, color, dash]) => (
          <span key={label} className="flex items-center gap-xs">
            <svg width="24" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="24" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dash} />
            </svg>
            {label}
          </span>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-m xl:flex-row">
        <div className="atlas-map-grid relative min-h-[420px] min-w-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/30">
          <div
            className="relative"
            style={{ width: layout.width, height: layout.height }}
          >
            <svg
              className="pointer-events-none absolute inset-0"
              width={layout.width}
              height={layout.height}
              aria-hidden="true"
            >
              {machine.edges.map((edge) => {
                const drawn = edgeInView(edge, view);
                if (!drawn) return null;
                const style = edgeStyle(edge.state, view);
                return (
                  <path
                    key={edge.key}
                    data-edge-state={edge.state}
                    d={curve(position(drawn.source), position(drawn.target))}
                    fill="none"
                    stroke={style.stroke}
                    strokeDasharray={style.dash}
                    strokeOpacity={style.opacity}
                    strokeWidth={view === "changes" && edge.state !== "retained" ? 2.4 : 1.5}
                  />
                );
              })}
            </svg>
            {machine.nodes.map((node) => {
              if (!nodeVisibleIn(node, view)) return null;
              const point = position(node.id);
              const active = node.id === selectedId;
              return (
                <button
                  key={node.id}
                  type="button"
                  aria-current={active ? "true" : undefined}
                  aria-label={`${node.item.displayName}, ${typeMeta(node.item.itemType).label}, ${NODE_STATE_LABEL[node.state]}`}
                  data-node-state={node.state}
                  onClick={() => onSelect(node.id)}
                  className={cn(
                    "absolute flex items-center gap-s rounded-lg border bg-card px-m text-left shadow-fabric-2 hover:shadow-fabric-8",
                    nodeTone(node.state, view),
                    active && "ring-2 ring-ring",
                  )}
                  style={{
                    left: point.x,
                    top: point.y,
                    width: TIME_MACHINE_NODE_W,
                    height: TIME_MACHINE_NODE_H,
                  }}
                >
                  <TypeGlyph type={node.item.itemType} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words text-200 font-semibold leading-200">
                      {node.item.displayName}
                    </span>
                    {view === "changes" && node.state !== "retained" && (
                      <span className="text-200 leading-200 text-muted-foreground">
                        {NODE_STATE_LABEL[node.state]}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside
          aria-label="Time machine inspector"
          className="flex min-h-[220px] flex-col gap-m rounded-lg border border-border bg-card p-l xl:w-[340px] xl:shrink-0"
        >
          {selected ? (
            <TimeMachineInspector
              node={selected}
              from={from}
              to={to}
              edges={selectedEdges}
              nameOf={nameOf}
              changeCenterHref={changeCenterHref(selected.item.displayName)}
              onOpenChangeCenter={onOpenChangeCenter}
            />
          ) : (
            <p className="m-auto max-w-[260px] text-center text-300 text-muted-foreground">
              Select an item to see how it changed between the two snapshots.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function TimeMachineInspector({
  node,
  from,
  to,
  edges,
  nameOf,
  changeCenterHref,
  onOpenChangeCenter,
}: {
  node: TimeMachineNode;
  from: HistoricalSnapshot;
  to: HistoricalSnapshot;
  edges: LineageTimeMachine["edges"];
  nameOf: (id: string) => string;
  changeCenterHref: string;
  onOpenChangeCenter: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const fields: TimeMachineItemField[] =
    node.state === "changed"
      ? node.changedFields
      : ["itemType", "health", "ownerName", "sensitivity"];
  return (
    <>
      <div className="flex items-start gap-s">
        <TypeGlyph type={node.item.itemType} size={36} />
        <div className="min-w-0">
          <h3 className="break-words text-400 font-semibold">{node.item.displayName}</h3>
          <p className="text-200 text-muted-foreground">
            {NODE_STATE_LABEL[node.state]}
            {node.state === "removed"
              ? ` · present in the snapshot from ${snapshotLabel(from)}, absent in the one from ${snapshotLabel(to)}`
              : node.state === "added"
                ? ` · new in the snapshot from ${snapshotLabel(to)}`
                : ""}
          </p>
        </div>
      </div>
      <table className="w-full text-200">
        <caption className="sr-only">Item values in both snapshots</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="py-xxs font-semibold">Field</th>
            <th scope="col" className="py-xxs font-semibold">Before</th>
            <th scope="col" className="py-xxs font-semibold">After</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field} className="border-t border-border align-top">
              <th scope="row" className="py-xs pr-s text-left font-normal text-muted-foreground">
                {FIELD_LABEL[field]}
              </th>
              <td className="break-words py-xs pr-s">{fieldText(node.before, field)}</td>
              <td className="break-words py-xs">{fieldText(node.after, field)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div>
        <h4 className="text-300 font-semibold">Relationship changes · {edges.length}</h4>
        {edges.length === 0 ? (
          <p className="mt-xs text-200 text-muted-foreground">
            No relationship of this item changed.
          </p>
        ) : (
          <ul className="mt-xs flex flex-col gap-xs text-200">
            {edges.map((edge) => {
              const shown = edge.after ?? edge.before!;
              return (
                <li key={edge.key} className="break-words">
                  <span className="font-semibold">{EDGE_STATE_LABEL[edge.state]}</span>:{" "}
                  {nameOf(shown.source)} → {nameOf(shown.target)} · {shown.relation}
                  {edge.state === "changed" && edge.before && edge.after
                    ? edge.before.relation !== edge.after.relation
                      ? ` (was ${edge.before.relation})`
                      : edge.after.broken
                        ? " (now broken)"
                        : " (no longer broken)"
                    : ""}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <a
        href={changeCenterHref}
        onClick={(event) => onOpenChangeCenter(event, changeCenterHref)}
        className="inline-flex min-h-[var(--atlas-touch-target)] items-center gap-s self-start rounded-md border border-input bg-card px-l text-300 font-semibold hover:bg-accent sm:min-h-[var(--atlas-control-height)]"
      >
        Open in Change Center
        <ArrowRight className="icon-size-200" aria-hidden="true" />
      </a>
    </>
  );
}
