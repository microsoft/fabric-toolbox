import { useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleHelp, Database, History, Info, Search, ShieldQuestion, X } from "lucide-react";
import type { AtlasData } from "../model";
import type { HistoricalSnapshot } from "../history";
import type { AtlasNavigation } from "../navigation";
import {
  buildAiGovernanceInventory, compareAgentSourceSelections, POLICIES_AI_LIMITATION,
  type AiInventoryRow,
} from "../policies-ai";
import { isFeatureEnabled } from "../feature-flags";
import {
  useStoredPolicyEvidence, type PolicyEvidenceLoader,
} from "../access-policy-evidence-source";
import {
  POLICY_LABELS, POLICY_DOCS, POLICY_LIMITATION,
} from "../../../rayfin/functions/src/policy-evidence-contract";
import { Card, TypeGlyph, cn } from "../ui";
import { AccessEvidenceInspector } from "../components/AccessEvidenceInspector";
import { useDesktopEvidence } from "../use-desktop-evidence";

export function PoliciesAiSection({
  data, previous, current, historyLoading, historyError, isPreview,
  onNavigate, onCompare, policyEvidenceLoader,
}: {
  data: AtlasData;
  previous?: HistoricalSnapshot;
  current?: HistoricalSnapshot;
  historyLoading: boolean;
  historyError?: string;
  isPreview: boolean;
  onNavigate: (navigation: AtlasNavigation) => void;
  onCompare: (previousId: string, currentId: string) => void;
  policyEvidenceLoader?: PolicyEvidenceLoader;
}) {
  const rows = useMemo(() => buildAiGovernanceInventory(data), [data]);
  const comparison = useMemo(() => compareAgentSourceSelections(previous, current), [previous, current]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = rows.filter((row) => [
    row.item.displayName, row.owner, ...row.sources.map((source) => source.displayName),
  ].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const desktop = useDesktopEvidence();
  const selected = filtered.find((row) => row.item.fabricId === selectedId) ?? (desktop ? filtered[0] : undefined);
  const selectionTrigger = useRef<HTMLElement | null>(null);
  const returnFocus = () => selectionTrigger.current?.isConnected && selectionTrigger.current.focus();
  const closeDetails = () => {
    setSelectedId(null);
    returnFocus();
  };
  const enabled = isFeatureEnabled("fabric-policies");
  const policy = useStoredPolicyEvidence(
    data.workspace.fabricId, data.workspace.snapshotId,
    enabled && (!isPreview || !!policyEvidenceLoader), policyEvidenceLoader,
  );
  const navigate = (tab: AtlasNavigation["tab"], itemId: string) => onNavigate({
    tab, focus: { requestId: crypto.randomUUID(), itemId },
  });
  const policyStatus = !enabled
    ? "Policy collection is off. No policy records were queried."
    : policy.status === "loading"
      ? "Loading stored workspace context..."
      : policy.status === "unavailable"
        ? "Stored policy context unavailable. No restriction decision is inferred."
        : !policy.records.length
          ? "No stored context for this snapshot. Applicability is unknown."
          : `${policy.records.length} stored workspace context records.`;

  return (
    <div className="grid min-w-0 gap-m">
      <div>
        <h2 className="sr-only">Policies &amp; AI evidence</h2>
        <p className="text-300 text-muted-foreground">
          AI-facing items in this workspace, the sources their data agents read and their protection labels.
        </p>
      </div>
      <div role="note" className="flex items-start gap-s rounded-md border border-signal-warning-foreground/15 bg-signal-warning-background px-m py-s text-200 leading-300 text-signal-warning-foreground">
        <Info className="mt-xxs icon-size-200 shrink-0" aria-hidden="true" />
        Coverage is partial. AI and Copilot exposure is not collected because Fabric has no public exposure contract. Unknown exposure does not mean not exposed; unknown controls are not compliant.
      </div>
      <dl aria-label="Policy and AI inventory summary" className="grid grid-cols-1 gap-s sm:grid-cols-3">
        {[
          ["Models", rows.filter((row) => row.item.itemType === "SemanticModel").length, "Semantic models in inventory"],
          ["Data agents", rows.filter((row) => row.item.itemType === "DataAgent").length, "Cataloged Data Agent items"],
          ["Source gaps", rows.filter((row) => row.selections === "unavailable").length, "Agent definitions not collected"],
        ].map(([label, value, detail]) => (
          <div key={label} className="min-w-0 rounded-lg border border-border bg-card p-m">
            <dt className="text-300 font-semibold">{label}</dt>
            <dd className="mt-xs font-numeric text-500 font-semibold">{value}</dd>
            <p className="mt-xs text-200 leading-300 text-muted-foreground">{detail}</p>
          </div>
        ))}
      </dl>
      <div className="atlas-ai-workbench">
        <Card className="min-w-0 overflow-hidden shadow-none">
          <div className="atlas-toolbar flex flex-wrap items-center justify-between gap-m border-b border-border p-m">
            <h3 className="text-400 font-semibold">AI governance inventory</h3>
            <label className="relative min-w-0 flex-1 sm:max-w-[var(--atlas-field-width)]">
              <Search className="pointer-events-none absolute left-s top-1/2 icon-size-200 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Search policy and AI inventory</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
                placeholder="Search assets, owners or sources"
                className="atlas-control w-full rounded-md border border-input bg-card pl-xxxl pr-m text-300" />
            </label>
          </div>
          <table className="w-full table-fixed border-collapse text-left text-200">
            <caption className="sr-only">AI governance inventory. Select an asset to inspect its evidence.</caption>
            <thead className="border-b border-border bg-secondary text-muted-foreground">
              <tr>
                <th scope="col" className="w-2/5 px-m py-s font-medium md:w-1/3">Asset</th>
                <th scope="col" className="hidden px-s py-s font-medium md:table-cell">Owner</th>
                <th scope="col" className="hidden px-s py-s font-medium md:table-cell md:w-1/12">Sources</th>
                <th scope="col" className="px-s py-s font-medium">Protection evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((row) => (
                <tr key={row.item.fabricId} className={cn("hover:bg-accent", selected?.item.fabricId === row.item.fabricId && "bg-primary/5")}>
                  <td className="px-m py-xs">
                    <button type="button" aria-pressed={selected?.item.fabricId === row.item.fabricId}
                      aria-label={`Inspect ${row.item.displayName}. AI exposure unknown. Source selection evidence ${row.selections}.`}
                      onClick={(event) => {
                        event.currentTarget.focus();
                        selectionTrigger.current = event.currentTarget;
                        setSelectedId(row.item.fabricId);
                      }}
                      className="atlas-control flex w-full items-center gap-s rounded-md text-left text-300">
                      <TypeGlyph type={row.item.itemType} size={24} />
                      <span className="min-w-0 break-words font-medium">{row.item.displayName}</span>
                    </button>
                  </td>
                  <td className="hidden break-words px-s py-s text-muted-foreground md:table-cell">{row.owner}</td>
                  <td className="hidden px-s py-s md:table-cell">
                    <span title={sourceSelectionLabel(row)}>{row.selections.startsWith("observed") ? row.sources.length : row.selections === "not-applicable" ? "N/A" : "Unknown"}</span>
                  </td>
                  <td className="px-s py-s">
                    <ProtectionEvidence row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="p-l text-300 leading-300">
            No inventoried artifacts match. Missing inventory is not evidence of absent AI exposure.
          </p>}
        </Card>
        {(desktop || selected) && (
          <AccessEvidenceInspector desktop={desktop} onClose={closeDetails} onReturnFocus={() => { returnFocus(); }}
            title="Policies and AI evidence" desktopLabel="Selected policy and AI evidence"
            description="Catalog and definition metadata, source selections and unknown exposure."
            closeButtonId="close-ai-evidence">
          <section aria-labelledby="ai-evidence-detail-heading" className="min-w-0"
            onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeDetails(); } }}>
            <Card className="overflow-hidden shadow-none">
              <div className="flex items-start justify-between gap-m">
                <h3 id="ai-evidence-detail-heading" className="p-m text-400 font-semibold">Evidence details</h3>
                {!desktop && <button id="close-ai-evidence" type="button" onClick={closeDetails}
                  className="atlas-control m-xs flex min-w-[var(--atlas-touch-target)] items-center justify-center rounded-md hover:bg-accent"
                  aria-label="Close AI evidence details"><X className="icon-size-200" aria-hidden="true" /></button>}
              </div>
              {selected ? <div className="px-m pb-m" role="region" aria-label={`Evidence details: ${selected.item.displayName}`}>
                <div className="flex items-center gap-s border-b border-border pb-m">
                  <TypeGlyph type={selected.item.itemType} size={32} />
                  <div className="min-w-0">
                    <h4 className="break-words text-300 font-semibold">{selected.item.displayName}</h4>
                    <p className="text-200 text-muted-foreground">{selected.item.itemType}</p>
                  </div>
                </div>
                <dl className="grid gap-m py-m text-200 leading-300">
                  {[
                    ["Owner", selected.owner], ["Sensitivity", selected.sensitivity],
                    ["Source metadata", sourceSelectionLabel(selected)],
                    ["AI/Copilot exposure", "Unknown; no exposure contract collected"],
                    ["Catalog collected", selected.catalogCollectedAt ?? "Not recorded"],
                  ].map(([label, value]) => <div key={label} className="grid grid-cols-2 gap-s">
                    <dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd>
                  </div>)}
                </dl>
                <details className="border-t border-border py-s text-200 leading-300">
                  <summary className="cursor-pointer py-xs font-semibold">Sources and provenance</summary>
                  <p className="mt-s text-muted-foreground">{POLICIES_AI_LIMITATION}</p>
                  <dl className="mt-m grid gap-s">
                    {[
                      ["Endorsement metadata", selected.endorsement], ["Observed lineage", selected.lineage],
                      ["Provenance", selected.provenance], ["Snapshot ID", selected.snapshotId ?? "Not recorded"],
                      ["Per-definition observation time", "Not collected"],
                    ].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="break-words text-muted-foreground">{value}</dd></div>)}
                  </dl>
                  {!selected.sources.length && <p className="mt-m">
                    {selected.selections === "observed-empty" ? "No source references in the collected definition." : "Source-selection evidence unavailable or not applicable."}
                    {" "}Neither statement establishes that this artifact is not exposed.
                  </p>}
                  <ul className="mt-m grid gap-s">
                    {selected.sources.map((source) => (
                      <li key={`${source.workspaceId ?? "unknown"}:${source.artifactId}`} className="rounded-md bg-secondary p-s">
                        <p className="font-semibold">{source.displayName} · {source.sourceType}</p>
                        <p className="break-all text-muted-foreground">Artifact: {source.artifactId} · Workspace: {source.workspaceId ?? "Not recorded"}</p>
                        <ul className="mt-s grid gap-xs">
                          {source.selectedElements.map((element) => (
                            <li key={JSON.stringify([element.parentId, element.parentPath, element.id, element.elementType])}>
                              {element.elementType}: {element.displayName} · Recorded ID: {element.id}
                            </li>
                          ))}
                        </ul>
                        {!source.selectedElements.length && <p>No supported selected elements recorded; other selections remain unknown.</p>}
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="flex flex-wrap gap-s border-t border-border pt-m">
                  <button type="button" onClick={() => navigate("catalog", selected.item.fabricId)}
                    className="atlas-control rounded-md border border-border px-s text-200 hover:bg-accent">Open catalog evidence</button>
                  <button type="button" onClick={() => navigate("map", selected.item.fabricId)}
                    className="atlas-control rounded-md border border-border px-s text-200 hover:bg-accent">Open lineage evidence</button>
                </div>
              </div> : <p className="px-m pb-l text-200 leading-300 text-muted-foreground">
                No asset matches the current inventory filter. Clear the search to inspect collected metadata.
              </p>}
              <div className="border-t border-border bg-secondary/50 p-m">
                <h4 className="flex items-center gap-s text-300 font-semibold"><ShieldQuestion className="icon-size-200 text-muted-foreground" aria-hidden="true" />Workspace policy context</h4>
                <p role={policy.status === "unavailable" ? "alert" : "status"} className="mt-s text-200 leading-300 text-muted-foreground">{policyStatus}</p>
                {enabled && <p className="mt-s text-200 leading-300">Workspace settings only, not item restriction or exposure decisions.</p>}
                {!!policy.records.length && <details className="mt-s text-200 leading-300">
                  <summary className="cursor-pointer py-s font-semibold">Stored context records</summary>
                  <p className="text-muted-foreground">{POLICY_LIMITATION}</p>
                  <ul className="mt-m grid gap-m">
                    {policy.records.map((record) => <li key={record.id} className="border-t border-border pt-s">
                      <p className="font-semibold">{POLICY_LABELS[record.kind]} · {record.coverage}</p>
                      {record.inboundPublicAction && <p>Inbound public-network default: {record.inboundPublicAction}</p>}
                      {record.outboundPublicAction && <p>Outbound public-network default: {record.outboundPublicAction}</p>}
                      {record.externalSharesBypassAction && <p>External-share network bypass default: {record.externalSharesBypassAction}</p>}
                      <p>Observation: {record.observedAt ?? "Not observed"} · Attempt: {record.attemptedAt} · {record.reason}</p>
                      <p>Connection identity: {record.collectorIdentity}</p>
                      <a href={POLICY_DOCS[record.kind]} className="atlas-control inline-flex items-center text-brand-foreground underline"
                        target="_blank" rel="noopener noreferrer">Source contract</a>
                    </li>)}
                  </ul>
                </details>}
              </div>
            </Card>
          </section>
          </AccessEvidenceInspector>
        )}
      </div>
      <Card className="p-m shadow-none">
        <h3 className="flex items-center gap-s text-300 font-semibold"><History className="icon-size-200 text-brand-foreground" aria-hidden="true" />Source-selection changes</h3>
        {historyError ? <p role="alert" className="mt-s text-300">Snapshot history unavailable; no selection changes are inferred.</p> :
          historyLoading ? <p role="status" className="mt-s text-300">Loading validated snapshot history…</p> :
          comparison.state === "unavailable" ? <p className="mt-s text-200 leading-300 text-muted-foreground">{comparison.reason}</p> :
          <>
            <p className="mt-s text-200 leading-300 text-muted-foreground">
              {comparison.differences.length} recorded changes between validated snapshots. These are source selections, not effective exposure or revoked access.
            </p>
            <ul className="mt-m grid gap-s sm:grid-cols-2">
              {comparison.differences.slice(0, 4).map((difference) => <li key={difference.id} className="rounded-md bg-secondary p-s text-200 leading-300">
                <p className="font-semibold">{difference.agentName}: {difference.type} · {difference.label}</p>
              </li>)}
            </ul>
            {comparison.differences.length > 4 && <p className="mt-s text-200 text-muted-foreground">Showing the first 4 changes. Expand source-change evidence for all recorded changes.</p>}
            {!comparison.differences.length && <p className="mt-s text-200">No recorded selection differences for comparable agents. Unavailable agents are not treated as unchanged.</p>}
            {!!comparison.unavailableAgents.length && <p className="mt-s text-200">{comparison.unavailableAgents.length} agents lack comparable source/identity evidence.</p>}
            <details className="mt-s text-200 leading-300">
              <summary className="cursor-pointer py-s font-semibold">Source-change evidence</summary>
              <p className="break-words text-muted-foreground">
                {comparison.previousSnapshotId} ({comparison.previousCollectedAt}) to {comparison.currentSnapshotId} ({comparison.currentCollectedAt}).
              </p>
              <ul className="mt-s grid gap-s">
                {comparison.differences.map((difference) => <li key={difference.id} className="border-t border-border pt-s">
                  <p className="font-semibold">{difference.agentName}: {difference.type} · {difference.label}</p>
                  <p className="break-all text-muted-foreground">Agent ID: {difference.agentId} · Source ID: {difference.sourceId} · Element ID: {difference.elementId ?? "Not applicable"}</p>
                </li>)}
              </ul>
            </details>
            <button type="button" onClick={() => onCompare(comparison.previousSnapshotId, comparison.currentSnapshotId)}
              className="atlas-control mt-m rounded-lg border border-border px-m text-300">Open exact historical comparison</button>
          </>}
      </Card>
    </div>
  );
}

function sourceSelectionLabel(row: AiInventoryRow): string {
  switch (row.selections) {
    case "observed": return `${row.sources.length} configured source references`;
    case "observed-empty": return "Collected; no source references";
    case "unavailable": return "Not collected";
    case "not-applicable": return "N/A for this artifact type";
  }
}

function ProtectionEvidence({ row }: { row: AiInventoryRow }) {
  const collected = !!(row.item.sensitivity?.trim() || row.item.sensitivityLabelId);
  const knownEmpty = row.item.sensitivityMetadataAvailable === true;
  const Icon = collected ? CheckCircle2 : knownEmpty ? Database : CircleHelp;
  return (
    <span title={row.sensitivity} className={cn(
      "inline-flex items-center gap-xs rounded-md px-s py-xxs",
      collected ? "bg-signal-success-background text-signal-success-foreground" : "bg-muted text-muted-foreground",
    )}>
      <Icon className="icon-size-100 shrink-0" aria-hidden="true" />
      {collected ? "Label collected" : knownEmpty ? "No label recorded" : "Not collected"}
    </span>
  );
}
