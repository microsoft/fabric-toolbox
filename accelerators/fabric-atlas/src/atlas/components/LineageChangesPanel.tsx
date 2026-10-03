import { AlertTriangle, FlaskConical, History } from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { analyzeBreakingChanges } from "../breaking-changes";
import { changeCenterUrl, openChangeCenter } from "../change-center-link";
import type { HistoricalSnapshot, SnapshotSummary } from "../history";
import { lineageChangesBetween, type LineageChangeRow } from "../lineage-evidence";
import {
  TIME_MACHINE_VIEWS,
  buildLineageTimeMachine,
  type TimeMachineView,
} from "../lineage-time-machine";
import { useAtlas } from "../store";
import { cn } from "../ui";
import { BreakingChangesView } from "./BreakingChangesView";
import {
  LineageTimeMachineView,
  TIME_MACHINE_NODE_H,
  TIME_MACHINE_NODE_W,
} from "./LineageTimeMachineView";

type ChangesSection = "topology" | "breaking" | "list";

const SECTIONS: Array<{ id: ChangesSection; label: string }> = [
  { id: "topology", label: "Time machine" },
  { id: "breaking", label: "Breaking changes" },
  { id: "list", label: "Change list" },
];

const GROUPS: Array<{
  type: LineageChangeRow["change"]["type"];
  title: string;
  tone: string;
}> = [
  { type: "lineage-added", title: "Added relationships", tone: "text-status-healthy" },
  { type: "lineage-removed", title: "Removed relationships", tone: "text-destructive" },
  {
    type: "lineage-broken-state-changed",
    title: "Broken state changed",
    tone: "text-status-warning",
  },
];

function param(name: string): string {
  return new URL(window.location.href).searchParams.get(name) ?? "";
}

function summaryText(summary: SnapshotSummary): string {
  const time = summary.syncedAt ? summary.syncedAt.slice(0, 16).replace("T", " ") : "";
  return time ? `${time} UTC` : summary.label || summary.snapshotId;
}

function brokenStateLabel(row: LineageChangeRow): string {
  return row.change.after === true ? "Now broken" : "No longer broken";
}

/**
 * Changes tab: compares two retained Atlas snapshots as a lineage time
 * machine, a breaking-change guard and a lineage change list.
 */
export function LineageChangesPanel({
  previewIncluded,
}: {
  previewIncluded: boolean;
}) {
  const {
    history,
    historyLoading,
    historyError,
    historyFailedSnapshotIds,
    loadHistorySnapshot,
  } = useAtlas();
  const summaries = history.summaries;
  const known = (id: string) => summaries.some((summary) => summary.snapshotId === id);
  const [section, setSection] = useState<ChangesSection>(() => {
    const value = param("tm.section");
    return value === "breaking" || value === "list" ? value : "topology";
  });
  const [view, setView] = useState<TimeMachineView>(() => {
    const value = param("tm.view") as TimeMachineView;
    return TIME_MACHINE_VIEWS.includes(value) ? value : "changes";
  });
  const [requestedFrom, setRequestedFrom] = useState(() => param("tm.from"));
  const [requestedTo, setRequestedTo] = useState(() => param("tm.to"));
  const [selectedItem, setSelectedItem] = useState(() => param("tm.item"));
  const [selectedCandidate, setSelectedCandidate] = useState(() => param("tm.candidate"));

  const toId = known(requestedTo) ? requestedTo : summaries[0]?.snapshotId ?? "";
  const fromId = known(requestedFrom) && requestedFrom !== toId
    ? requestedFrom
    : summaries.find((summary) => summary.snapshotId !== toId)?.snapshotId ?? "";
  const snapshotFor = (id: string) =>
    history.snapshots.find((snapshot) => snapshot.snapshotId === id);
  const fromSnapshot = snapshotFor(fromId);
  const toSnapshot = snapshotFor(toId);
  // Comparisons always run from the older to the newer snapshot.
  const [older, newer]: [HistoricalSnapshot | undefined, HistoricalSnapshot | undefined] =
    fromSnapshot && toSnapshot && Date.parse(fromSnapshot.syncedAt) > Date.parse(toSnapshot.syncedAt)
      ? [toSnapshot, fromSnapshot]
      : [fromSnapshot, toSnapshot];
  const failedId = [fromId, toId].find((id) => id && historyFailedSnapshotIds.has(id));
  const pinnedFrom = requestedFrom !== "" && requestedFrom === fromId ? fromId : "";
  const pinnedTo = requestedTo !== "" && requestedTo === toId ? toId : "";

  useEffect(() => {
    for (const [id, snapshot] of [
      [fromId, fromSnapshot],
      [toId, toSnapshot],
    ] as const) {
      if (id && !snapshot && !historyFailedSnapshotIds.has(id)) {
        void loadHistorySnapshot(id);
      }
    }
  }, [fromId, fromSnapshot, historyFailedSnapshotIds, loadHistorySnapshot, toId, toSnapshot]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const values: Record<string, string> = {
      "tm.section": section === "topology" ? "" : section,
      "tm.view": view === "changes" ? "" : view,
      "tm.from": pinnedFrom,
      "tm.to": pinnedTo,
      "tm.item": selectedItem,
      "tm.candidate": selectedCandidate,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [pinnedFrom, pinnedTo, section, selectedCandidate, selectedItem, view]);

  const machine = useMemo(
    () =>
      older && newer
        ? buildLineageTimeMachine(older, newer, {
            nodeWidth: TIME_MACHINE_NODE_W,
            nodeHeight: TIME_MACHINE_NODE_H,
            columnGap: 264,
            rowGap: 88,
            componentGap: 40,
          })
        : undefined,
    [older, newer],
  );
  const analysis = useMemo(
    () => (older && newer ? analyzeBreakingChanges(older, newer) : undefined),
    [older, newer],
  );
  const rows = useMemo(
    () => (older && newer ? lineageChangesBetween(older, newer) : []),
    [older, newer],
  );
  const changeCenterHref = (search?: string) =>
    older && newer ? changeCenterUrl(window.location, older.snapshotId, newer.snapshotId, search) : "#";
  const onOpenChangeCenter = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    openChangeCenter(href);
  };

  const loading =
    !historyError &&
    !failedId &&
    summaries.length >= 2 &&
    (historyLoading || !fromSnapshot || !toSnapshot);

  let body;
  if (historyError || failedId) {
    body = (
      <div
        role="alert"
        className="flex items-start gap-s rounded-lg border border-destructive/35 bg-destructive/10 p-m text-200 leading-200 text-foreground"
      >
        <AlertTriangle className="icon-size-200 shrink-0 text-destructive" aria-hidden="true" />
        <span className="min-w-0 break-words">
          {historyError ??
            "A snapshot needed for this comparison could not be loaded. Choose another retained snapshot."}
        </span>
      </div>
    );
  } else if (summaries.length < 2) {
    body = (
      <p className="rounded-lg border border-dashed border-border p-xl text-center text-300 text-muted-foreground">
        Lineage changes appear after a second synchronized snapshot.
      </p>
    );
  } else if (loading || !machine || !analysis || !older || !newer) {
    body = (
      <div role="status" className="flex flex-col gap-s">
        <span className="text-200 text-muted-foreground">Loading snapshot history…</span>
        {[0, 1, 2].map((index) => (
          <span key={index} aria-hidden="true" className="block h-xxxl rounded-md bg-muted" />
        ))}
      </div>
    );
  } else if (section === "topology") {
    body = (
      <LineageTimeMachineView
        machine={machine}
        from={older}
        to={newer}
        view={view}
        onViewChange={setView}
        selectedId={selectedItem}
        onSelect={setSelectedItem}
        changeCenterHref={changeCenterHref}
        onOpenChangeCenter={onOpenChangeCenter}
      />
    );
  } else if (section === "breaking") {
    body = (
      <BreakingChangesView
        analysis={analysis}
        from={older}
        to={newer}
        selectedId={selectedCandidate}
        onSelect={setSelectedCandidate}
        changeCenterHref={changeCenterHref}
        onOpenChangeCenter={onOpenChangeCenter}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <p className="rounded-lg border border-dashed border-border p-xl text-center text-300 text-muted-foreground">
        No lineage relationships changed between these snapshots.
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-l">
        {GROUPS.map((group) => {
          const groupRows = rows.filter((row) => row.change.type === group.type);
          if (groupRows.length === 0) return null;
          return (
            <section key={group.type} aria-label={group.title}>
              <h3 className={cn("text-300 font-semibold", group.tone)}>
                {group.title} · {groupRows.length}
              </h3>
              <ul className="mt-s flex flex-col gap-xs">
                {groupRows.map((row) => (
                  <li
                    key={row.change.id}
                    className="flex flex-wrap items-center gap-x-m gap-y-xxs rounded-lg border border-border bg-card px-m py-s text-300 shadow-fabric-2"
                  >
                    <span className="min-w-0 flex-1 break-words font-semibold">
                      {row.sourceName} <span aria-hidden="true">→</span>
                      <span className="sr-only"> to </span> {row.targetName}
                    </span>
                    <span className="text-200 text-muted-foreground">
                      {row.change.type === "lineage-broken-state-changed"
                        ? brokenStateLabel(row)
                        : row.relation}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-l overflow-auto p-l">
      <header className="flex flex-wrap items-end justify-between gap-m">
        <div className="flex items-center gap-s">
          <History className="icon-size-200 text-brand-foreground" aria-hidden="true" />
          <h2 className="text-400 font-semibold">Atlas snapshot lineage changes</h2>
        </div>
        {summaries.length >= 2 && (
          <div className="atlas-toolbar flex flex-wrap items-center">
            <label className="flex items-center gap-s text-200 text-muted-foreground">
              Baseline
              <select
                value={fromId}
                onChange={(event) => {
                  setRequestedFrom(event.target.value);
                  setSelectedItem("");
                  setSelectedCandidate("");
                }}
                className="rounded-lg border border-input bg-card px-m text-foreground outline-none"
              >
                {summaries
                  .filter((summary) => summary.snapshotId !== toId)
                  .map((summary) => (
                    <option key={summary.snapshotId} value={summary.snapshotId}>
                      {summaryText(summary)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex items-center gap-s text-200 text-muted-foreground">
              Compared with
              <select
                value={toId}
                onChange={(event) => {
                  setRequestedTo(event.target.value);
                  setSelectedItem("");
                  setSelectedCandidate("");
                }}
                className="rounded-lg border border-input bg-card px-m text-foreground outline-none"
              >
                {summaries
                  .filter((summary) => summary.snapshotId !== fromId)
                  .map((summary) => (
                    <option key={summary.snapshotId} value={summary.snapshotId}>
                      {summaryText(summary)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
      </header>
      <Tabs.Root
        value={section}
        onValueChange={(value) => setSection(value as ChangesSection)}
        className="flex min-h-0 flex-1 flex-col gap-l"
      >
        {summaries.length >= 2 && (
          <Tabs.List
            aria-label="Change views"
            className="flex overflow-x-auto border-b border-border"
          >
            {SECTIONS.map(({ id, label }) => (
              <Tabs.Trigger
                key={id}
                value={id}
                className="relative min-h-[var(--atlas-touch-target)] shrink-0 whitespace-nowrap px-l text-300 text-muted-foreground hover:text-foreground focus-visible:ring-inset focus-visible:ring-offset-0 data-[state=active]:font-semibold data-[state=active]:text-brand-foreground data-[state=active]:after:absolute data-[state=active]:after:inset-x-s data-[state=active]:after:bottom-0 data-[state=active]:after:h-xxs data-[state=active]:after:rounded-full data-[state=active]:after:bg-primary"
              >
                {label}
                {id === "breaking" && analysis ? ` · ${analysis.candidates.length}` : ""}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        )}
        <Tabs.Content
          value={section}
          className="flex min-h-0 flex-1 flex-col focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {body}
        </Tabs.Content>
      </Tabs.Root>
      {previewIncluded && (
        <section
          aria-label="Item Relations evidence changes"
          className="flex items-start gap-s rounded-lg border border-lineage-upstream/30 bg-lineage-upstream/5 p-m text-200 leading-200 text-foreground"
        >
          <FlaskConical className="icon-size-200 shrink-0 text-lineage-upstream" aria-hidden="true" />
          <p>
            <span className="font-semibold">Item Relations changes are not tracked.</span>{" "}
            Atlas keeps no history of Beta collections, so Preview evidence is
            never compared across time or mixed into these snapshot changes.
          </p>
        </section>
      )}
    </div>
  );
}
