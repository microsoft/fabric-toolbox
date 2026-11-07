import { useMemo, useState } from "react";
import {
  ACCESS_EVIDENCE_LABEL,
  ACCESS_LAYER_LABEL,
  unknownAccessLayers,
} from "../access-coverage";
import {
  ACCESS_SOURCE_LABEL,
  accessWhatIfToCsv,
  accessWhatIfToMarkdown,
  modeledAccessLayerSummary,
  recordedGrantLabel,
  simulateAccessGrantRemoval,
  whatIfOutcomeDescription,
  type AccessGrantPath,
} from "../access-what-if";
import { serializeAccessReviewEvidence } from "../access-review-evidence";
import type { AccessReviewRow } from "../governance";
import { cn } from "../ui";

function download(content: string, type: string, extension: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fabric-atlas-access-what-if.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PathEvidence({ path }: { path: AccessGrantPath }) {
  return (
    <span className="min-w-0 break-words">
      <span className="block text-300 font-semibold">
        {ACCESS_SOURCE_LABEL[path.grant.source]}
        {` · Role: ${path.grant.roleName?.trim() || "Not recorded"}`}
        {` · ${recordedGrantLabel(path.grant.accessLevel)}`}
      </span>
      <span className="mt-xs block break-all text-200 leading-300 text-muted-foreground">
        {ACCESS_LAYER_LABEL[path.layer]} · Recorded source: {path.grant.source}
        {` · Scope: ${path.grant.itemFabricId ?? "Workspace"}`}
        {` · Reference: ${path.grant.principalRef}`}
        {` · ${path.observations} recorded observation(s)`}
      </span>
    </span>
  );
}

function GrantScenario({
  row,
  onInspect,
}: {
  row: AccessReviewRow;
  onInspect: () => void;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const result = useMemo(
    () => simulateAccessGrantRemoval(row, [...excluded]),
    [excluded, row],
  );
  const excludeLayer = (layer: AccessGrantPath["layer"]) => {
    setExcluded((previous) => new Set([
      ...previous,
      ...result.paths.filter((path) => path.layer === layer).map((path) => path.key),
    ]));
  };
  const allExcluded = (layer: AccessGrantPath["layer"]) =>
    result.paths.filter((path) => path.layer === layer)
      .every((path) => excluded.has(path.key));
  const buttonClass = "atlas-control rounded-lg border border-border px-m text-300 font-semibold hover:bg-accent disabled:opacity-50";

  return (
    <div className="mt-l grid gap-l">
      <div className="grid grid-cols-2 gap-m">
        <dl className="rounded-lg border border-border bg-secondary/40 p-m">
          <dt className="text-200 text-muted-foreground">Current strongest recorded grant</dt>
          <dd className="mt-s text-400 font-semibold">{recordedGrantLabel(result.currentLevel)}</dd>
        </dl>
        <dl className="rounded-lg border border-primary/30 bg-primary/5 p-m">
          <dt className="text-200 text-muted-foreground">Simulated result</dt>
          <dd className="mt-s text-400 font-semibold">{recordedGrantLabel(result.simulatedLevel)}</dd>
        </dl>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="text-300 leading-300">
        {whatIfOutcomeDescription(result)}
      </p>

      <section aria-labelledby="what-if-layers-heading">
        <h3 id="what-if-layers-heading" className="text-300 font-semibold">Modeled grant layers</h3>
        <p className="mt-xs text-200 leading-300">{modeledAccessLayerSummary(result)}</p>
      </section>
      <div role="group" aria-label="Local grant-removal actions" className="flex flex-wrap gap-s">
        <button type="button" className={buttonClass} disabled={allExcluded("workspace-grants")} onClick={() => excludeLayer("workspace-grants")}>
          Exclude all workspace-inherited grants
        </button>
        <button type="button" className={buttonClass} disabled={allExcluded("item-grants")} onClick={() => excludeLayer("item-grants")}>
          Exclude all recorded item grants
        </button>
        <button type="button" className={buttonClass} disabled={!excluded.size} onClick={() => setExcluded(new Set())}>
          Reset simulation
        </button>
      </div>

      <details className="rounded-lg border border-border">
        <summary className="min-h-[var(--atlas-touch-target)] cursor-pointer px-m py-s text-300 font-semibold hover:bg-accent">
          Advanced: paths, provenance and limits
        </summary>
        <div className="grid gap-l border-t border-border p-m">
        <fieldset>
        <legend className="text-300 font-semibold">Recorded paths to exclude</legend>
        <p className="mt-xs text-200 leading-300 text-muted-foreground">
          Check a path to exclude it. Duplicate observations count once.
        </p>
        <div className="mt-m grid gap-s">
          {result.paths.map((path) => (
            <label key={path.key} className={cn(
              "flex min-h-[var(--atlas-touch-target)] items-start gap-m rounded-lg border border-border p-m",
              excluded.has(path.key) && "bg-secondary",
            )}>
              <input
                type="checkbox"
                checked={excluded.has(path.key)}
                aria-label={`Exclude ${ACCESS_SOURCE_LABEL[path.grant.source]} (${path.grant.roleName ?? "role not recorded"}, ${ACCESS_LAYER_LABEL[path.layer]}, ${recordedGrantLabel(path.grant.accessLevel)}, reference ${path.grant.principalRef})`}
                className="mt-xs icon-size-200 shrink-0 accent-primary"
                onChange={(event) => setExcluded((previous) => {
                  const next = new Set(previous);
                  if (event.target.checked) next.add(path.key);
                  else next.delete(path.key);
                  return next;
                })}
              />
              <PathEvidence path={path} />
            </label>
          ))}
        </div>
      </fieldset>

      <section aria-labelledby="what-if-limits-heading">
        <h3 id="what-if-limits-heading" className="text-300 font-semibold">Unknown or incomplete layers</h3>
        <ul className="mt-s grid gap-xs text-200 leading-300 text-muted-foreground">
          {unknownAccessLayers(row.coverage).map((layer) => (
            <li key={layer.layer}>
              {ACCESS_LAYER_LABEL[layer.layer]}: {ACCESS_EVIDENCE_LABEL[layer.state]}. {layer.reason}
            </li>
          ))}
          <li>Other data-plane and row/column restrictions: Not evaluated.</li>
          <li>Group membership changes: Not modeled.</li>
        </ul>
        <p className="mt-m text-200 leading-300 text-muted-foreground">
          Source: the selected pair's recorded grants in snapshot {row.coverage.snapshotId ?? "not recorded"}.
          {" "}Principal resolution: {row.principalResolution} (recorded references only).
          Missing grant records are not treated as proof of absent access.
        </p>
      </section>
      </div>
      </details>

      <div className="flex flex-wrap gap-s">
        <button type="button" className={buttonClass} onClick={(event) => {
          event.currentTarget.focus();
          onInspect();
        }}>Inspect access evidence</button>
        <button type="button" className={buttonClass} onClick={() =>
          download(accessWhatIfToMarkdown(result), "text/markdown;charset=utf-8", "md")
        }>Export What-if Markdown</button>
        <button type="button" className={buttonClass} onClick={() =>
          download(accessWhatIfToCsv(result), "text/csv;charset=utf-8", "csv")
        }>Export What-if CSV</button>
      </div>
    </div>
  );
}

export function AccessWhatIf({
  rows,
  row,
  onSelect,
  onInspect,
}: {
  rows: AccessReviewRow[];
  row?: AccessReviewRow;
  onSelect: (row: AccessReviewRow | undefined) => void;
  onInspect: () => void;
}) {
  return (
    <section aria-labelledby="access-what-if-heading" className="p-l">
      <h2 id="access-what-if-heading" className="text-400 font-semibold">Read-only grant What-if</h2>
      <p className="mt-xs text-200 leading-300 text-muted-foreground">Try removing recorded grants locally. No Fabric permissions are changed.</p>
      <label className="mt-l block">
        <span className="mb-xs block text-200 font-semibold">Recorded grant pair</span>
        <select
          value={row?.id ?? ""}
          aria-describedby="what-if-pair-help"
          className="atlas-control w-full min-w-0 max-w-full rounded-lg border border-input bg-card px-m text-300"
          onChange={(event) => onSelect(rows.find((candidate) => candidate.id === event.target.value))}
        >
          <option value="">Select a recorded grant pair</option>
          {rows.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.principalRef} → {candidate.item.displayName}
            </option>
          ))}
        </select>
      </label>
      <p id="what-if-pair-help" className="mt-xs text-200 leading-300 text-muted-foreground">
        Pairs follow your filters. Switching pairs, snapshots or mode resets the simulation.
      </p>
      {row ? (
        <GrantScenario
          key={`${serializeAccessReviewEvidence(row)}:${JSON.stringify(row.coverage)}`}
          row={row}
          onInspect={onInspect}
        />
      ) : (
        <p className="mt-l text-300 leading-300">
          {rows.length
            ? "Select a recorded grant pair to model its existing grant paths."
            : "No recorded grant pairs match the filters. Missing evidence does not prove absence of access."}
        </p>
      )}
    </section>
  );
}
