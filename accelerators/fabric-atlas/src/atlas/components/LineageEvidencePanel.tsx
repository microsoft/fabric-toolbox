import {
  ChevronRight,
  FlaskConical,
  Network,
  Search,
  Waypoints,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ItemRelationsEvidenceState } from "../item-relations-evidence-source";
import {
  isDrawnPreviewEdge,
  relationshipMatches,
  type LineageEvidenceModel,
  type RelationshipEvidence,
} from "../lineage-evidence";
import { relativeTime, type ItemType } from "../model";
import { cn, TypeGlyph } from "../ui";
import {
  RelationshipEvidencePane,
  type RelationshipEvidenceSource,
} from "./RelationshipEvidencePane";

const PAGE_SIZE = 100;

function relationTypes(
  relationship: RelationshipEvidence,
  sourceMode: RelationshipEvidenceSource,
): string[] {
  return sourceMode === "atlas"
    ? [...new Set(relationship.authoritative.map((edge) => edge.relation))]
    : [
        ...new Set(
          relationship.preview
            .filter(isDrawnPreviewEdge)
            .map((entry) => entry.edge.relation.relationType),
        ),
      ];
}

function latestPreviewObservation(
  relationship: RelationshipEvidence,
): string | undefined {
  return relationship.preview
    .flatMap((entry) =>
      entry.edge.observations.map((observation) => observation.observedAt),
    )
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function PreviewCoverage({
  model,
  state,
}: {
  model: LineageEvidenceModel;
  state: ItemRelationsEvidenceState;
}) {
  if (state.status !== "ready" || !model.previewGraph) return null;
  const graph = model.previewGraph;
  const drawn = graph.edges.filter(
    (edge) => edge.semantics.flow !== "visibility" && !edge.selfRelation,
  );
  const relationTypes = new Set(
    drawn.map((edge) => edge.relation.relationType),
  );
  return (
    <section
      aria-label="Item Relations evidence coverage"
      className="rounded-lg border border-lineage-upstream/30 bg-lineage-upstream/5 px-l py-m text-200"
    >
      <div className="flex flex-wrap items-center justify-between gap-s">
        <div>
          <h3 className="text-300 font-semibold">Preview collection</h3>
          <p className="mt-xxs text-muted-foreground">
            Raw API relation types and normalized source-to-consumer direction.
          </p>
        </div>
        <span className="text-muted-foreground" title={state.evidence.collectedAt}>
          Collected {relativeTime(state.evidence.collectedAt)}
        </span>
      </div>
      <dl className="mt-m flex flex-wrap gap-x-xxl gap-y-s">
        {[
          ["Drawn lines", drawn.length],
          ["API relation types", relationTypes.size],
          ["Complete queries", graph.coverage.complete],
          ["Failed queries", graph.coverage.failed],
          ["Cycles", graph.cycles.length],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-numeric text-300 font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {state.coverage?.sampledItemCount != null &&
        state.coverage.workspaceItemCount != null &&
        state.coverage.sampledItemCount <
          state.coverage.workspaceItemCount && (
          <p className="mt-s font-semibold text-foreground">
            Partial collection: {state.coverage.sampledItemCount} of{" "}
            {state.coverage.workspaceItemCount} root items queried.
          </p>
        )}
    </section>
  );
}

export function LineageEvidencePanel({
  model,
  previewState,
  sourceMode,
  snapshotSyncedAt,
  itemNames,
  selectedId,
  onSelect,
}: {
  model: LineageEvidenceModel;
  previewState: ItemRelationsEvidenceState;
  sourceMode: RelationshipEvidenceSource;
  snapshotSyncedAt?: string;
  itemNames: ReadonlyMap<string, string>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const relationships = useMemo(
    () =>
      model.relationships.filter((relationship) =>
        sourceMode === "atlas"
          ? relationship.authoritative.length > 0
          : relationship.preview.some(isDrawnPreviewEdge),
      ),
    [model.relationships, sourceMode],
  );
  const filtered = useMemo(
    () =>
      relationships.filter((relationship) =>
        relationshipMatches(relationship, query),
      ),
    [query, relationships],
  );
  const selected = relationships.find(
    (relationship) => relationship.id === selectedId,
  );
  const endpointCount = new Set(
    relationships.flatMap((relationship) => [
      relationship.source.key,
      relationship.target.key,
    ]),
  ).size;
  const typeCount = new Set(
    relationships.flatMap((relationship) =>
      relationTypes(relationship, sourceMode),
    ),
  ).size;
  const crossWorkspace = relationships.filter(
    (relationship) => relationship.crossWorkspace,
  ).length;
  const sourceTitle =
    sourceMode === "atlas" ? "Atlas snapshot" : "Item Relations API Preview";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-m overflow-auto p-l xl:flex-row xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-m">
        <section
          aria-label={`${sourceTitle} evidence purpose`}
          className="flex flex-col gap-m rounded-lg border border-border bg-card px-l py-m sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="max-w-[680px]">
            <div className="flex items-center gap-s">
              {sourceMode === "atlas" ? (
                <Waypoints
                  className="icon-size-300 text-brand-foreground"
                  aria-hidden="true"
                />
              ) : (
                <FlaskConical
                  className="icon-size-300 text-lineage-upstream"
                  aria-hidden="true"
                />
              )}
              <h2 className="text-400 font-semibold">{sourceTitle} evidence</h2>
            </div>
            <p className="mt-xs text-200 leading-200 text-muted-foreground">
              Review the exact relation type and collection source behind each
              line currently drawn on Graph.
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-xxl gap-y-s">
            {[
              ["Lines", relationships.length],
              ["Items", endpointCount],
              ["Types", typeCount],
              ["Cross-workspace", crossWorkspace],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-200 text-muted-foreground">{label}</dt>
                <dd className="font-numeric text-400 font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {sourceMode === "preview" && (
          <PreviewCoverage model={model} state={previewState} />
        )}

        <section
          aria-labelledby="lineage-relationships-title"
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          <div className="atlas-toolbar flex flex-wrap items-center justify-between gap-m border-b border-border px-l py-m">
            <h3 id="lineage-relationships-title" className="text-400 font-semibold">
              Lineage relationships
            </h3>
            <div className="flex flex-wrap items-center gap-s">
              <label className="relative min-w-[220px] sm:w-[320px]">
                <Search
                  className="pointer-events-none absolute left-s top-1/2 icon-size-200 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="sr-only">Search relationships</span>
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setLimit(PAGE_SIZE);
                  }}
                  placeholder="Search items, workspaces or relation types"
                  className="w-full rounded-lg border border-input bg-card pl-xxxl pr-m outline-none"
                />
              </label>
              <span className="text-200 text-muted-foreground" aria-live="polite">
                {filtered.length} of {relationships.length}
              </span>
            </div>
          </div>

          {relationships.length === 0 ? (
            <p className="p-xl text-center text-300 text-muted-foreground">
              No lines from this source are available for the current snapshot.
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-xl text-center text-300 text-muted-foreground">
              No relationships match this search.
            </p>
          ) : (
            <table
              aria-labelledby="lineage-relationships-title"
              className="w-full border-collapse text-300"
            >
              <thead>
                <tr className="border-b border-border text-left text-200 text-muted-foreground">
                  <th scope="col" className="px-l py-s font-semibold">Relationship</th>
                  <th scope="col" className="hidden px-m py-s font-semibold md:table-cell">Relation type</th>
                  <th scope="col" className="hidden px-m py-s font-semibold lg:table-cell">Scope</th>
                  <th scope="col" className="px-m py-s font-semibold">Evidence</th>
                  <th scope="col" className="w-[40px] px-s py-s">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((relationship) => {
                  const active = relationship.id === selectedId;
                  const types = relationTypes(relationship, sourceMode);
                  const observedAt =
                    sourceMode === "preview"
                      ? latestPreviewObservation(relationship)
                      : snapshotSyncedAt;
                  return (
                    <tr
                      key={relationship.id}
                      onClick={() => onSelect(relationship.id)}
                      className={cn(
                        "cursor-pointer border-b border-border last:border-b-0 hover:bg-accent",
                        active && "bg-primary/5",
                      )}
                    >
                      <td className="atlas-row px-l">
                        <button
                          type="button"
                          aria-current={active ? "true" : undefined}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(relationship.id);
                          }}
                          className="flex min-h-[var(--atlas-touch-target)] w-full min-w-0 items-center gap-m text-left"
                        >
                          <TypeGlyph
                            type={(relationship.source.itemType ?? "Unknown") as ItemType}
                            size={28}
                          />
                          <span className="min-w-0">
                            <span className="block break-words font-semibold">
                              {relationship.source.displayName}{" "}
                              <span aria-hidden="true">→</span>
                              <span className="sr-only"> to </span>{" "}
                              {relationship.target.displayName}
                            </span>
                            <span className="block break-words text-200 text-muted-foreground">
                              {relationship.source.workspaceName ?? "Workspace name not reported"}
                            </span>
                          </span>
                        </button>
                      </td>
                      <td className="hidden px-m text-muted-foreground md:table-cell">
                        {types.join(" · ")}
                      </td>
                      <td className="hidden px-m lg:table-cell">
                        <span className="inline-flex items-center gap-xs text-200">
                          <Network className="icon-size-100 text-muted-foreground" aria-hidden="true" />
                          {relationship.crossWorkspace ? "Cross-workspace" : "Same workspace"}
                        </span>
                      </td>
                      <td className="px-m text-200 text-muted-foreground">
                        {sourceMode === "atlas"
                          ? "Validated snapshot"
                          : observedAt
                            ? `Observed ${relativeTime(observedAt)}`
                            : "Preview API"}
                      </td>
                      <td className="px-s text-muted-foreground">
                        <ChevronRight className="icon-size-200" aria-hidden="true" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {filtered.length > limit && (
            <div className="border-t border-border px-l py-s">
              <button
                type="button"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
                className="rounded-lg border border-border bg-card px-l py-s text-300 font-semibold hover:bg-accent"
              >
                Show {Math.min(PAGE_SIZE, filtered.length - limit)} more
              </button>
            </div>
          )}
        </section>
      </div>

      <div className="flex min-h-[320px] flex-col overflow-hidden rounded-lg border border-border bg-card xl:sticky xl:top-0 xl:max-h-full xl:w-[400px] xl:shrink-0">
        {selected ? (
          <RelationshipEvidencePane
            relationship={selected}
            sourceMode={sourceMode}
            snapshotSyncedAt={snapshotSyncedAt}
            itemNames={itemNames}
            onClose={() => onSelect("")}
          />
        ) : (
          <p className="m-auto max-w-[280px] p-l text-center text-300 text-muted-foreground">
            Select a line to review the evidence currently shown on the graph.
          </p>
        )}
      </div>
    </div>
  );
}
