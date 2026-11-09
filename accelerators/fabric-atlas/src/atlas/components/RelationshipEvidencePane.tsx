import {
  Check,
  Database,
  FlaskConical,
  Info,
  Network,
  Waypoints,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ItemRelationFlow } from "../item-relations-evidence";
import type {
  RelationshipEndpoint,
  RelationshipEvidence,
} from "../lineage-evidence";
import { snapshotRelationFamily } from "../lineage-relation-family";
import { relativeTime } from "../model";
import { cn } from "../ui";

const FLOW_LABEL: Record<ItemRelationFlow, string> = {
  data: "Data flow",
  control: "Orchestration",
  lifecycle: "Lifecycle",
  association: "Association",
  visibility: "Visibility",
  unknown: "Unknown relation type",
};

export type RelationshipEvidenceSource = "atlas" | "preview";

function workspaceLabel(endpoint: RelationshipEndpoint): string {
  return endpoint.workspaceName ?? "Workspace name not reported";
}

function Fact({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-200 text-muted-foreground">{label}</dt>
      <dd className="mt-xs flex items-center gap-s break-words text-300 text-foreground">
        {icon}
        <span className="min-w-0">{children}</span>
      </dd>
    </div>
  );
}

function SourceCard({
  badge,
  title,
  status,
  statusClass,
  meta,
  statement,
  source,
  confidence,
  children,
}: {
  badge: ReactNode;
  title: string;
  status: string;
  statusClass: string;
  meta?: string;
  statement: ReactNode;
  source: string;
  confidence: string;
  children?: ReactNode;
}) {
  return (
    <li className="rounded-lg border border-border bg-card p-m">
      <div className="flex items-start gap-m">
        {badge}
        <div className="min-w-0 flex-1">
          <div className="text-300 font-semibold text-foreground">
            {title} · <span className={statusClass}>{status}</span>
          </div>
          {meta && (
            <div className="text-200 text-muted-foreground">{meta}</div>
          )}
        </div>
      </div>
      <p className="mt-s rounded-md bg-secondary px-m py-s text-200 leading-200 text-foreground">
        {statement}
      </p>
      <dl className="mt-s grid grid-cols-2 gap-m text-200">
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd className="mt-xxs text-foreground">{source}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Direction</dt>
          <dd className="mt-xxs text-foreground">{confidence}</dd>
        </div>
      </dl>
      {children}
    </li>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-xxs break-words text-foreground">{children}</dd>
    </div>
  );
}

function latest(values: readonly string[]): string | undefined {
  return [...values].sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

export function RelationshipEvidencePane({
  relationship,
  sourceMode,
  snapshotSyncedAt,
  itemNames,
  onClose,
  className,
}: {
  relationship: RelationshipEvidence;
  sourceMode: RelationshipEvidenceSource;
  snapshotSyncedAt?: string;
  itemNames: ReadonlyMap<string, string>;
  onClose?: () => void;
  className?: string;
}) {
  const { source, target } = relationship;
  const nameFor = (id: string) => itemNames.get(id.toLowerCase()) ?? id;
  const endpointName = (key: string) =>
    key === source.key
      ? source.displayName
      : key === target.key
        ? target.displayName
        : nameFor(key.slice(key.indexOf(":") + 1));
  const types =
    sourceMode === "atlas"
      ? [...new Set(relationship.authoritative.map((edge) => edge.relation))]
      : [
          ...new Set(
            relationship.preview.map(
              (entry) => entry.edge.relation.relationType,
            ),
          ),
        ];
  const headingId = `relationship-evidence-${relationship.id.replace(/[^a-z0-9-]/gi, "-")}`;
  const snapshotMeta = snapshotSyncedAt
    ? `Last collected ${relativeTime(snapshotSyncedAt)}`
    : "Collected with the synchronized snapshot";
  const sourceTitle =
    sourceMode === "atlas" ? "Atlas snapshot line" : "Item Relations API line";

  return (
    <section
      aria-labelledby={headingId}
      className={cn("flex min-h-0 flex-1 flex-col", className)}
    >
      <header className="flex shrink-0 items-center gap-s border-b border-border px-l py-m">
        <Waypoints
          className="icon-size-300 shrink-0 text-brand-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-500 font-semibold leading-500">
            Line evidence
          </h2>
          <p className="text-200 text-muted-foreground">{sourceTitle}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close relationship evidence"
            className="flex min-h-[var(--atlas-touch-target)] min-w-[var(--atlas-touch-target)] items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="icon-size-200" aria-hidden="true" />
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-l overflow-auto p-l">
        <div>
          <h3 className="break-words text-500 font-semibold leading-500">
            {source.displayName} <span aria-hidden="true">→</span>
            <span className="sr-only"> to </span> {target.displayName}
          </h3>
          <p className="mt-xxs break-words text-300 text-muted-foreground">
            {workspaceLabel(source)} <span aria-hidden="true">→</span>
            <span className="sr-only"> to </span> {workspaceLabel(target)}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-m border-b border-border pb-l">
          <Fact
            label="Relation type"
            icon={<Database className="icon-size-200 shrink-0 text-muted-foreground" aria-hidden="true" />}
          >
            {types.join(" · ") || "Not reported"}
          </Fact>
          <Fact
            label="Workspace boundary"
            icon={<Network className="icon-size-200 shrink-0 text-muted-foreground" aria-hidden="true" />}
          >
            {relationship.crossWorkspace ? "Cross-workspace" : "Same workspace"}
          </Fact>
        </dl>

        <div>
          <h3 className="text-400 font-semibold">Collected evidence</h3>
          <ul className="mt-m flex flex-col gap-m">
            {sourceMode === "atlas" &&
              relationship.authoritative.map((edge) => {
                const sourceName = nameFor(edge.source);
                const targetName = nameFor(edge.target);
                return (
                  <SourceCard
                    key={`${edge.source}|${edge.target}|${edge.relation}`}
                    badge={
                      <span className="flex icon-size-500 shrink-0 items-center justify-center rounded-full bg-signal-success-background text-signal-success-foreground">
                        <Check className="icon-size-200" aria-hidden="true" />
                      </span>
                    }
                    title="Atlas snapshot"
                    status="Validated"
                    statusClass="text-status-healthy"
                    meta={snapshotMeta}
                    statement={
                      snapshotRelationFamily(edge.relation) === "data"
                        ? `${targetName} uses data from ${sourceName} (${edge.relation}).`
                        : `${sourceName} → ${targetName} (${edge.relation}).`
                    }
                    source="Validated Atlas snapshot"
                    confidence={edge.broken ? "Source to consumer, marked broken" : "Source to consumer"}
                  />
                );
              })}

            {sourceMode === "preview" &&
              relationship.preview.map(({ edge }) => {
                const observedAt = latest(
                  edge.observations.map(
                    (observation) => observation.observedAt,
                  ),
                );
                return (
                  <SourceCard
                    key={edge.id}
                    badge={
                      <span className="flex icon-size-500 shrink-0 items-center justify-center rounded-full bg-lineage-upstream text-background">
                        <FlaskConical className="icon-size-200" aria-hidden="true" />
                      </span>
                    }
                    title="Item Relations API"
                    status="Preview"
                    statusClass="text-lineage-upstream"
                    meta={observedAt ? `Observed ${relativeTime(observedAt)}` : undefined}
                    statement={`${endpointName(edge.sourceKey)} → ${endpointName(edge.targetKey)} (${edge.relation.relationType}).`}
                    source="Fabric Item Relations API"
                    confidence={
                      edge.semantics.directionVerified
                        ? "Normalized source to consumer"
                        : "API orientation, direction not documented"
                    }
                  >
                    <details className="mt-s text-200">
                      <summary className="atlas-control cursor-pointer font-semibold text-lineage-upstream">
                        API details
                      </summary>
                      <dl className="mt-s grid grid-cols-2 gap-m">
                        <DetailRow label="relationType">
                          {edge.relation.relationType}
                        </DetailRow>
                        <DetailRow label="Relation family">
                          {FLOW_LABEL[edge.semantics.flow]}
                        </DetailRow>
                        <DetailRow label="Reported by">
                          {edge.observations
                            .map(
                              (observation) =>
                                `${nameFor(observation.itemId)} (${observation.direction})`,
                            )
                            .join(", ")}
                        </DetailRow>
                        <DetailRow label="Collection state">
                          {edge.preserved ? "Preserved from an earlier collection" : "Observed in this collection"}
                        </DetailRow>
                      </dl>
                      {edge.inCycle && (
                        <p className="mt-s text-muted-foreground">
                          This relation belongs to a dependency cycle.
                        </p>
                      )}
                    </details>
                  </SourceCard>
                );
              })}
          </ul>
        </div>

        <div
          role="note"
          className="flex items-start gap-m rounded-lg border border-signal-info-foreground/20 bg-signal-info-background p-m text-200 leading-300 text-foreground"
        >
          <Info
            className="icon-size-300 shrink-0 text-signal-info-foreground"
            aria-hidden="true"
          />
          <p>
            {sourceMode === "atlas"
              ? "This is the validated snapshot line currently drawn on the graph."
              : "This is the Preview API line currently drawn on the graph. Turn Preview off to return to Atlas snapshot lineage."}
          </p>
        </div>
      </div>
    </section>
  );
}
