import { ChevronDown, ChevronRight, FileDown, Info, RefreshCcw, ScanSearch, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { downloadText, fileSlug } from "../download";
import { LINEAGE_CAPABILITIES } from "../lineage-capabilities";
import { schemaFor } from "../model";
import {
  buildSemanticModelXRay,
  xrayEvidenceMarkdown,
  xrayImpact,
  xrayObjectLabel,
  type XRayDirection,
  type XRayObject,
} from "../semantic-xray";
import { useAtlas } from "../store";
import { cn } from "../ui";

type KindFilter = "all" | "measure" | "column";

function param(name: string): string {
  return new URL(window.location.href).searchParams.get(name) ?? "";
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-0 border-r border-border px-m py-s last:border-r-0">
      <div className={cn("font-numeric text-400 font-semibold", tone)}>{value}</div>
      <div className="text-200 text-muted-foreground">{label}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-border bg-secondary p-xxs">
      {options.map(([option, text], index) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          tabIndex={value === option ? 0 : -1}
          title={label === "Dependency direction"
            ? option === "dependsOn" ? "Inputs referenced by the selected object" : "Consumers that reference the selected object"
            : label === "Impact scope" ? option === "direct" ? "One resolved dependency hop" : "Every reachable resolved dependency hop" : undefined}
          onClick={() => onChange(option)}
          onKeyDown={(event) => {
            let next: number;
            if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % options.length;
            else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + options.length - 1) % options.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = options.length - 1;
            else return;
            event.preventDefault();
            onChange(options[next][0]);
            event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
          }}
          className={cn(
            "min-h-[var(--atlas-touch-target)] rounded-md px-m text-[length:var(--text-300)] font-semibold text-muted-foreground sm:min-h-[var(--atlas-control-height)]",
            value === option && "bg-card text-brand-foreground shadow-fabric-2",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Complete DAX dependency explorer for one synchronized semantic model. */
export function SemanticXRayPanel() {
  const { data } = useAtlas();
  const groupId = useId();
  const models = useMemo(
    () =>
      data.items
        .filter((item) => item.itemType === "SemanticModel" && (schemaFor(data, item.fabricId)?.length ?? 0) > 0)
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    [data],
  );
  const [requestedModel, setRequestedModel] = useState(() => param("xray.model"));
  const modelId = models.some((model) => model.fabricId === requestedModel)
    ? requestedModel
    : models[0]?.fabricId ?? "";
  const model = models.find((entry) => entry.fabricId === modelId);
  const xray = useMemo(
    () => (modelId ? buildSemanticModelXRay(modelId, schemaFor(data, modelId) ?? []) : undefined),
    [data, modelId],
  );
  const [selectedKey, setSelectedKey] = useState(() => param("xray.object"));
  const [direction, setDirection] = useState<XRayDirection>(() =>
    param("xray.dir") === "dependsOn" ? "dependsOn" : "usedBy",
  );
  const [transitive, setTransitive] = useState(() => param("xray.scope") === "transitive");
  const [query, setQuery] = useState(() => param("xray.q"));
  const [kind, setKind] = useState<KindFilter>(() => {
    const value = param("xray.kind");
    return value === "measure" || value === "column" ? value : "all";
  });
  const [openTables, setOpenTables] = useState<Set<string>>(new Set());
  const selected = xray?.objects.get(selectedKey);
  const impact = useMemo(
    () => (xray && selected ? xrayImpact(xray, selected.key, direction, transitive) : undefined),
    [direction, selected, transitive, xray],
  );
  const cycleKeys = useMemo(() => new Set(xray?.cycles.flat() ?? []), [xray]);
  const referencesByObject = useMemo(() => {
    const result = new Map<string, number>();
    for (const reference of xray?.references ?? []) {
      result.set(reference.from, (result.get(reference.from) ?? 0) + 1);
    }
    return result;
  }, [xray]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const values: Record<string, string> = {
      "xray.model": requestedModel === modelId ? modelId : "",
      "xray.object": selected ? selected.key : "",
      "xray.dir": direction === "usedBy" ? "" : direction,
      "xray.scope": transitive ? "transitive" : "",
      "xray.q": query,
      "xray.kind": kind === "all" ? "" : kind,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [direction, kind, modelId, query, requestedModel, selected, transitive]);

  if (!xray || !model) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-l overflow-auto p-l">
        <p className="rounded-lg border border-dashed border-border p-xl text-center text-300 text-muted-foreground">
          No semantic model with synchronized tables, columns or measures is
          in this snapshot.
        </p>
        <CapabilityStates />
      </div>
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const matches = (object: XRayObject) =>
    (kind === "all" || object.kind === kind) &&
    (!normalizedQuery ||
      object.name.toLowerCase().includes(normalizedQuery) ||
      object.table.toLowerCase().includes(normalizedQuery) ||
      (object.expression ?? "").toLowerCase().includes(normalizedQuery));
  const unresolvedCount = xray.references.length;
  const toggle = (table: string) =>
    setOpenTables((previous) => {
      const next = new Set(previous);
      if (next.has(table)) next.delete(table);
      else next.add(table);
      return next;
    });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-m overflow-auto p-l">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-m">
        <div className="flex items-center gap-s">
          <ScanSearch className="icon-size-200 text-brand-foreground" aria-hidden="true" />
          <h2 className="text-400 font-semibold">Semantic model X-Ray</h2>
        </div>
        <label className="flex min-w-0 flex-wrap items-center gap-s text-200 text-muted-foreground">
          Semantic model
          <select
            value={modelId}
            onChange={(event) => {
              setRequestedModel(event.target.value);
              setSelectedKey("");
              setOpenTables(new Set());
            }}
            className="atlas-control max-w-full rounded-md border border-input bg-card px-m text-300 text-foreground sm:max-w-[var(--atlas-field-width)]"
          >
            {models.map((entry) => (
              <option key={entry.fabricId} value={entry.fabricId}>
                {entry.displayName}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="flex shrink-0 items-start gap-s rounded-md border border-signal-info-foreground/15 bg-signal-info-background px-m py-s">
        <Info className="mt-xxs icon-size-200 shrink-0 text-brand-foreground" aria-hidden="true" />
        <div className="text-200 leading-300">
          <p className="text-foreground">
            Open a table and select an object to trace collected DAX references.
            {" "}<strong>Depends on</strong> shows inputs; <strong>Used by</strong> shows consumers.
            {" "}<strong>Direct</strong> is one hop; <strong>Transitive</strong> follows the resolved chain.
          </p>
        </div>
      </div>

      <div aria-label="Semantic model inventory" className="grid shrink-0 grid-cols-2 rounded-lg border border-border bg-card sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="Tables" value={xray.tables.length} />
        <Metric label="Measures" value={xray.measureCount} />
        <Metric label="Columns" value={xray.columnCount} />
        <Metric label="DAX dependencies" value={xray.edgeCount} />
        <Metric
          label="Unresolved or ambiguous"
          value={unresolvedCount}
          tone={unresolvedCount > 0 ? "text-status-warning" : undefined}
        />
        <Metric label="Cycles" value={xray.cycles.length} tone={xray.cycles.length ? "text-status-warning" : undefined} />
      </div>

      <div className="atlas-toolbar flex shrink-0 flex-wrap items-center">
        <label className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto sm:max-w-[var(--atlas-field-width)]">
          <Search
            className="pointer-events-none absolute left-s top-1/2 icon-size-200 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">Search measures and columns</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search measures, columns or DAX…"
            className="w-full rounded-lg border border-input bg-card pl-xxxl pr-m outline-none"
          />
        </label>
        <SegmentedControl
          label="Object kind"
          value={kind}
          onChange={setKind}
          options={[
            ["all", "All"],
            ["measure", "Measures"],
            ["column", "Columns"],
          ]}
        />
        <SegmentedControl
          label="Dependency direction"
          value={direction}
          onChange={setDirection}
          options={[
            ["dependsOn", "Depends on"],
            ["usedBy", "Used by"],
          ]}
        />
        <SegmentedControl
          label="Impact scope"
          value={transitive ? "transitive" : "direct"}
          onChange={(value) => setTransitive(value === "transitive")}
          options={[
            ["direct", "Direct"],
            ["transitive", "Transitive"],
          ]}
        />
      </div>

      <p role="status" className="shrink-0 text-200 leading-300 text-muted-foreground">
        {selected
          ? `${selected.name}: ${impact?.keys.size ?? 0} ${transitive ? "reachable" : "direct"} ${direction === "dependsOn" ? "inputs" : "consumers"} highlighted.`
          : "Tables start collapsed. Select a measure or column to highlight its inputs or consumers."}
        {" "}Report visual usage and runtime queries are not collected or inferred.
      </p>
      <div className="atlas-xray-workbench">
        <div className="flex min-h-0 min-w-0 flex-col rounded-lg border border-border bg-secondary/50">
        <div className="flex shrink-0 items-center justify-between gap-s border-b border-border px-m py-s">
          <h3 className="text-300 font-semibold">Tables &amp; objects</h3>
          <span className="text-200 text-muted-foreground">{xray.tables.length} tables</span>
        </div>
        <ul
          aria-label="Model objects by table"
          className="atlas-xray-objects flex min-h-0 min-w-0 flex-1 flex-col gap-s overflow-y-auto p-s"
        >
          {xray.tables.map((table) => {
            const visible = table.objectKeys
              .map((key) => xray.objects.get(key)!)
              .filter(matches);
            if (normalizedQuery && visible.length === 0) return null;
            const open = !!normalizedQuery || openTables.has(table.name);
            const impacted = table.objectKeys.filter((key) => impact?.keys.has(key)).length;
            const contentId = `${groupId}-${encodeURIComponent(table.name)}`;
            return (
              <li key={table.name} className="shrink-0 overflow-hidden rounded-lg border border-border bg-card">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={contentId}
                  disabled={!!normalizedQuery}
                  onClick={() => toggle(table.name)}
                  className="flex min-h-[var(--atlas-touch-target)] w-full items-center gap-s px-m py-s text-left hover:bg-accent disabled:cursor-default"
                >
                  {open ? (
                    <ChevronDown className="icon-size-200" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="icon-size-200" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 break-words text-300 font-semibold">{table.name}</span>
                  {impacted > 0 && (
                    <span className="rounded-md bg-lineage-downstream/10 px-s py-xxs text-200 font-semibold text-brand-foreground">
                      {impacted}{" "}
                      {direction === "usedBy"
                        ? impacted === 1
                          ? "consumer"
                          : "consumers"
                        : impacted === 1
                          ? "dependency"
                          : "dependencies"}
                    </span>
                  )}
                  <span className="shrink-0 text-200 text-muted-foreground">{visible.length} objects</span>
                </button>
                {open && (
                  <ul id={contentId} className="border-t border-border">
                    {visible.map((object) => {
                      const active = object.key === selectedKey;
                      const hop = impact?.distance.get(object.key);
                      return (
                        <li key={object.key} className="shrink-0 border-b border-border/60 last:border-b-0">
                          <button
                            type="button"
                            data-object-key={object.key}
                            aria-current={active ? "true" : undefined}
                            onClick={() => setSelectedKey(object.key)}
                            className={cn(
                              "flex min-h-[var(--atlas-touch-target)] w-full flex-wrap items-center gap-s px-m py-s text-left text-200 hover:bg-accent",
                              active && "bg-primary/10",
                            )}
                          >
                            <span
                              className={cn(
                                "rounded-sm px-xs font-semibold",
                                object.kind === "measure" ? "bg-object-measure/15" : "bg-object-column/15",
                              )}
                            >
                              {object.kind === "measure" ? "fx" : "col"}
                            </span>
                            <span className="min-w-0 flex-1 break-words font-semibold">{object.name}</span>
                            {object.dataType && <span className="text-muted-foreground">{object.dataType}</span>}
                            {hop != null && (
                              <span className="rounded-md bg-lineage-downstream/10 px-s font-semibold text-brand-foreground">
                                {direction === "usedBy" ? "Used by" : "Depends on"} · {hop} hop{hop === 1 ? "" : "s"}
                              </span>
                            )}
                            {cycleKeys.has(object.key) && (
                              <span className="rounded-md bg-status-warning/10 px-s font-semibold text-status-warning">Cycle</span>
                            )}
                            {referencesByObject.has(object.key) && (
                              <span className="rounded-md bg-status-warning/10 px-s font-semibold text-status-warning">
                                {referencesByObject.get(object.key)} unresolved
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          {normalizedQuery && ![...xray.objects.values()].some(matches) && (
            <li className="p-l text-200 text-muted-foreground">No measures or columns match this search. Try a table name or a DAX reference.</li>
          )}
        </ul>
        </div>
        <aside
          aria-label="X-Ray object evidence"
          className="min-h-0 min-w-0 space-y-m overflow-y-auto rounded-lg border border-border bg-card p-l"
        >
          <h3 className="border-b border-border pb-m text-300 font-semibold">Object evidence</h3>
          {selected ? (
            <ObjectDetail
              object={selected}
              dependsOn={xray.dependsOn.get(selected.key) ?? []}
              usedBy={xray.usedBy.get(selected.key) ?? []}
              objectFor={(key) => xray.objects.get(key)}
              references={xray.references.filter((reference) => reference.from === selected.key)}
              inCycle={cycleKeys.has(selected.key)}
              onSelect={setSelectedKey}
              onExport={() =>
                downloadText(
                  xrayEvidenceMarkdown(xray, selected.key, model.displayName),
                  "text/markdown",
                  `xray-${fileSlug(model.displayName)}-${fileSlug(selected.name)}.md`,
                )
              }
            />
          ) : (
            <p className="text-300 leading-300 text-muted-foreground">
              Open a table and select a measure or column to trace its DAX
              dependencies and consumers.
            </p>
          )}
        </aside>
      </div>

      <CapabilityStates />
    </div>
  );
}

function ObjectDetail({
  object,
  dependsOn,
  usedBy,
  objectFor,
  references,
  inCycle,
  onSelect,
  onExport,
}: {
  object: XRayObject;
  dependsOn: string[];
  usedBy: string[];
  objectFor: (key: string) => XRayObject | undefined;
  references: Array<{ reference: string; status: string }>;
  inCycle: boolean;
  onSelect: (key: string) => void;
  onExport: () => void;
}) {
  const list = (keys: string[], empty: string) =>
    keys.length === 0 ? (
      <p className="mt-xs text-200 text-muted-foreground">{empty}</p>
    ) : (
      <ul className="mt-xs flex flex-col gap-xxs">
        {keys.map((key) => {
          const entry = objectFor(key);
          if (!entry) return null;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                className="atlas-control break-words rounded-md text-left text-200 font-semibold text-brand-foreground hover:underline"
              >
                {entry.table} {xrayObjectLabel(entry)}
              </button>
            </li>
          );
        })}
      </ul>
    );
  return (
    <>
      <div>
        <div className="text-200 uppercase tracking-wide text-muted-foreground">
          {object.kind} · {object.table}
        </div>
        <h3 className="break-words text-400 font-semibold">{object.name}</h3>
        {object.dataType && <p className="text-200 text-muted-foreground">{object.dataType}</p>}
      </div>
      {object.expression && (
        <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary p-s font-mono text-200">
          {object.expression}
        </pre>
      )}
      <p className="text-200 leading-300 text-muted-foreground">
        Direct references are listed below. Direct / Transitive changes which objects are highlighted in the table list.
      </p>
      {inCycle && (
        <p className="flex items-start gap-s rounded-md bg-status-warning/10 p-s text-200 text-foreground">
          <RefreshCcw className="icon-size-200 shrink-0 text-status-warning" aria-hidden="true" />
          Part of a DAX dependency cycle. Traversal stops at repeated objects.
        </p>
      )}
      {object.kind === "measure" && (
        <div>
          <h4 className="text-300 font-semibold">Depends on · {dependsOn.length}</h4>
          {list(dependsOn, "No resolved DAX references.")}
        </div>
      )}
      <div>
        <h4 className="text-300 font-semibold">Used by in this model · {usedBy.length}</h4>
        {list(
          usedBy,
          "No DAX consumers in this model. Report and visual usage is not exposed by Fabric APIs, so this does not mean unused.",
        )}
      </div>
      {references.length > 0 && (
        <div>
          <h4 className="text-300 font-semibold">Unresolved or ambiguous · {references.length}</h4>
          <ul className="mt-xs flex flex-col gap-xxs text-200">
            {references.map((reference) => (
              <li key={reference.reference} className="break-words">
                <code className="font-mono">{reference.reference}</code> · {reference.status}
              </li>
            ))}
          </ul>
          <p className="mt-xs text-200 text-muted-foreground">
            These references are not linked because they do not resolve to
            exactly one synchronized object.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={onExport}
        className="inline-flex min-h-[var(--atlas-touch-target)] items-center gap-s self-start rounded-md border border-input bg-card px-l text-300 font-semibold hover:bg-accent sm:min-h-[var(--atlas-control-height)]"
      >
        <FileDown className="icon-size-200" aria-hidden="true" />
        Export dependency evidence
      </button>
    </>
  );
}

function CapabilityStates() {
  return (
    <details className="shrink-0 rounded-lg border border-border bg-card p-m text-200">
      <summary className="flex min-h-[var(--atlas-touch-target)] cursor-pointer items-center gap-s font-semibold focus-visible:outline-2 focus-visible:outline-ring sm:min-h-[var(--atlas-control-height)]">
        <Info className="icon-size-200 text-muted-foreground" aria-hidden="true" />
        Lineage depth capability states
      </summary>
      <ul className="mt-s flex flex-col gap-s">
        {LINEAGE_CAPABILITIES.map((capability) => (
          <li key={capability.id}>
            <span className="font-semibold">{capability.title}</span>{" "}
            <span
              className={cn(
                "rounded-md px-s py-xxs font-semibold",
                capability.status === "available"
                  ? "bg-status-healthy/10 text-status-healthy"
                  : capability.status === "partial"
                    ? "bg-status-warning/10 text-status-warning"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {capability.status} · {capability.decidedAt}
            </span>
            <p className="mt-xxs text-muted-foreground">{capability.evidence}</p>
            {capability.limitation && (
              <p className="mt-xxs text-muted-foreground">{capability.limitation}</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
