import {
  ChevronDown,
  ChevronRight,
  Columns3,
  ExternalLink,
  Info,
  Maximize2,
  Network,
  RotateCcw,
  Sigma,
  Table2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { DEFAULT_MAP_ZOOM, stepMapZoom } from "../map-zoom";
import type { AtlasData, Item, ModelTableSchema } from "../model";
import {
  modelObjectKey,
  normalizeObjectName,
  objectLineageReducer,
  parseObjectLineageLocation,
  restoreObjectLineageState,
  tableObjectKey,
  writeObjectLineageLocation,
} from "../object-lineage-state";
import {
  buildSemanticObjectGraph,
  OBJECT_LINEAGE_LIMITS,
  semanticTableGeometry,
  type SemanticGraphEdge,
} from "../semantic-object-graph";
import {
  buildSemanticModelXRay,
  xrayObjectLabel,
  type XRayObject,
} from "../semantic-xray";
import { Card, TypeGlyph, cn } from "../ui";

const UPSTREAM = "var(--color-lineage-upstream)";
const DOWNSTREAM = "var(--color-lineage-downstream)";
const NEUTRAL = "var(--color-lineage-neutral)";

function edgePath(edge: SemanticGraphEdge): string {
  const middle = (edge.source.x + edge.target.x) / 2;
  return [
    `M ${edge.source.x} ${edge.source.y}`,
    `C ${middle} ${edge.source.y}, ${middle} ${edge.target.y},`,
    `${edge.target.x} ${edge.target.y}`,
  ].join(" ");
}

function searchMatches(object: XRayObject, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return (
    !normalized ||
    object.name.toLowerCase().includes(normalized) ||
    object.table.toLowerCase().includes(normalized) ||
    (object.expression ?? "").toLowerCase().includes(normalized)
  );
}

function assetHref(itemId: string, object: XRayObject): string {
  const url = new URL(window.location.href);
  for (const key of [...url.searchParams.keys()]) {
    if (
      [
        "lineage",
        "item",
        "tables",
        "object",
        "dax",
        "table",
        "q",
        "view",
      ].includes(key) ||
      key.startsWith("xray.")
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.set("assets.item", itemId);
  url.searchParams.set("assets.table", object.table);
  url.searchParams.set("assets.object", object.name);
  url.searchParams.set("assets.objectKind", object.kind);
  url.hash = "#assets";
  return `${url.pathname}${url.search}${url.hash}`;
}

function noticeText(
  notice: string | undefined,
): string | undefined {
  if (notice === "expansion-limit") {
    return "Close a table before opening another one. The view is limited to 8 expanded tables.";
  }
  if (notice === "linked-table-ambiguous") {
    return "The linked table name is ambiguous in this snapshot. Atlas did not guess.";
  }
  if (notice === "linked-object-missing") {
    return "The linked object is not present in this snapshot.";
  }
  return undefined;
}

function elementByDataKey(
  root: ParentNode | null,
  attribute: "data-object-key" | "data-lineage-key",
  key: string,
): HTMLElement | undefined {
  return [...(root?.querySelectorAll<HTMLElement>(`[${attribute}]`) ?? [])]
    .find((element) => element.getAttribute(attribute) === key);
}

function scrollViewport(
  viewport: HTMLElement | null | undefined,
  options: ScrollToOptions,
): void {
  if (typeof viewport?.scrollTo === "function") viewport.scrollTo(options);
}

export function ObjectLineageCanvas({
  data,
  item,
  tables,
  query,
  onOpenXRay,
  onSelectItem,
}: {
  data: AtlasData;
  item: Item;
  tables: ModelTableSchema[];
  query: string;
  onOpenXRay: (objectKey: string) => void;
  onSelectItem: (itemId: string) => void;
}) {
  const xray = useMemo(
    () =>
      buildSemanticModelXRay(
        item.fabricId,
        tables,
        data.semanticModelEvidence?.[item.fabricId],
      ),
    [data.semanticModelEvidence, item.fabricId, tables],
  );
  const geometries = useMemo(
    () => semanticTableGeometry(tables),
    [tables],
  );
  const [state, dispatch] = useReducer(
    objectLineageReducer,
    undefined,
    () =>
      restoreObjectLineageState(
        parseObjectLineageLocation(
          new URL(window.location.href).searchParams,
          item.fabricId,
        ),
        geometries,
      ),
  );
  const [zoom, setZoom] = useState(DEFAULT_MAP_ZOOM);
  const [keyboardKey, setKeyboardKey] = useState(
    () => modelObjectKey(item.fabricId),
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const graph = useMemo(
    () =>
      buildSemanticObjectGraph({
        item,
        tables,
        xray,
        state,
        items: data.items,
        edges: data.edges,
        schema: data.schema,
      }),
    [data.edges, data.items, data.schema, item, state, tables, xray],
  );
  const selectedObject = state.focus
    ? xray.objects.get(state.focus)
    : undefined;
  const selectedTable = state.focus?.startsWith("table\u0000")
    ? graph.tableRows.find(
        (table) => table.key === state.focus?.split("\u0000")[1],
      )
    : undefined;
  const selectedModel = state.focus === modelObjectKey(item.fabricId);
  const searchResults = useMemo(
    () =>
      [...xray.objects.values()]
        .filter((object) => searchMatches(object, query))
        .sort(
          (left, right) =>
            left.table.localeCompare(right.table) ||
            left.name.localeCompare(right.name),
        )
        .slice(0, 60),
    [query, xray.objects],
  );
  const navigationKeys = useMemo(
    () => [
      modelObjectKey(item.fabricId),
      ...graph.tableRows.map((table) => tableObjectKey(table.name)),
      ...graph.blocks.flatMap((block) =>
        block.fields.map((field) => field.key),
      ),
    ],
    [graph.blocks, graph.tableRows, item.fabricId],
  );
  const notice = noticeText(state.notice);

  useEffect(() => {
    if (!state.focus || xray.objects.has(state.focus)) return;
    if (
      state.focus !== modelObjectKey(item.fabricId) &&
      !state.focus.startsWith("table\u0000")
    ) {
      dispatch({ type: "focus" });
      dispatch({ type: "setNotice", notice: "linked-object-missing" });
    }
  }, [item.fabricId, state.focus, xray.objects]);

  useEffect(() => {
    const url = new URL(window.location.href);
    writeObjectLineageLocation(url, state);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [state]);

  const preserveViewport = (action: () => void) => {
    const viewport = viewportRef.current;
    const left = viewport?.scrollLeft ?? 0;
    const top = viewport?.scrollTop ?? 0;
    action();
    window.requestAnimationFrame(() =>
      scrollViewport(viewport, { left, top }),
    );
  };

  const expand = (tableKey: string) => {
    const geometry = geometries.find(
      (entry) => entry.key === tableKey,
    );
    if (!geometry) return;
    preserveViewport(() =>
      dispatch({
        type: "expand",
        table: tableKey,
        anchorY: geometry.anchorY,
        height: geometry.height,
      }),
    );
  };

  const reveal = (key: string) => {
    const object = xray.objects.get(key);
    if (!object) {
      dispatch({ type: "setNotice", notice: "linked-object-missing" });
      return;
    }
    const table = normalizeObjectName(object.table);
    if (!state.blocks.some((block) => block.table === table)) expand(table);
    dispatch({ type: "focus", key });
    setKeyboardKey(key);
    window.requestAnimationFrame(() => {
      const target = elementByDataKey(
        viewportRef.current,
        "data-object-key",
        key,
      );
      if (typeof target?.scrollIntoView === "function") {
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });
  };

  const toggleTable = (tableName: string) => {
    const key = normalizeObjectName(tableName);
    const open = state.blocks.some((block) => block.table === key);
    preserveViewport(() => {
      if (open) dispatch({ type: "collapse", table: key });
      else expand(key);
    });
    setKeyboardKey(tableObjectKey(tableName));
  };

  const focusTable = (tableName: string) => {
    dispatch({ type: "focus", key: tableObjectKey(tableName) });
    setKeyboardKey(tableObjectKey(tableName));
  };

  const handleRovingKey = (
    event: KeyboardEvent<HTMLElement>,
    key: string,
    activate: () => void,
  ) => {
    const index = navigationKeys.indexOf(key);
    let next = index;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      next = (index + 1) % navigationKeys.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      next = (index + navigationKeys.length - 1) % navigationKeys.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = navigationKeys.length - 1;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
      return;
    } else {
      return;
    }
    event.preventDefault();
    const nextKey = navigationKeys[next];
    setKeyboardKey(nextKey);
    window.requestAnimationFrame(() => {
      elementByDataKey(
        viewportRef.current,
        "data-lineage-key",
        nextKey,
      )?.focus();
    });
  };

  const fit = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setZoom(
      Math.max(
        0.2,
        Math.min(
          1,
          (viewport.clientWidth - 48) / graph.width,
          (viewport.clientHeight - 48) / graph.height,
        ),
      ),
    );
    window.requestAnimationFrame(() =>
      scrollViewport(viewport, { left: 0, top: 0 }),
    );
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <section
        aria-label="Semantic model object lineage summary"
        className="flex flex-wrap items-center gap-m border-b border-border bg-secondary/70 px-l py-s"
      >
        <div className="grid flex-1 grid-cols-2 gap-x-l gap-y-xs sm:grid-cols-4 xl:grid-cols-7">
          <Metric label="Tables" value={tables.length} />
          <Metric label="Measures" value={xray.measureCount} />
          <Metric label="Columns" value={xray.columnCount} />
          <Metric
            label="Expressions"
            value={`${xray.collectedExpressionCount}/${xray.expressionCount}`}
            warning={
              xray.collectedExpressionCount < xray.expressionCount
            }
          />
          <Metric label="DAX edges" value={xray.edgeCount} />
          <Metric
            label="Unresolved"
            value={xray.references.length}
            warning={xray.references.length > 0}
          />
          <Metric
            label="Relationships"
            value={
              data.semanticModelEvidence?.[item.fabricId]?.relationships
                .length ?? 0
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-s">
          <select
            aria-label="DAX edge scope"
            value={state.dax}
            onChange={(event) =>
              dispatch({
                type: "setDax",
                scope: event.target.value as "direct" | "transitive" | "off",
              })
            }
            className="atlas-control rounded-lg border border-input bg-card px-m text-300 text-foreground"
          >
            <option value="direct">Direct DAX</option>
            <option value="transitive">Transitive DAX</option>
            <option value="off">DAX edges off</option>
          </select>
          <button
            type="button"
            onClick={() => {
              for (const geometry of geometries.slice(
                0,
                Math.min(8, geometries.length),
              )) {
                dispatch({
                  type: "expand",
                  table: geometry.key,
                  anchorY: geometry.anchorY,
                  height: geometry.height,
                });
              }
            }}
            className="atlas-control rounded-lg border border-border bg-card px-m text-200 font-semibold text-foreground hover:bg-accent"
          >
            Expand up to 8 tables
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: "reset", itemId: item.fabricId })
            }
            className="atlas-control flex items-center gap-s rounded-lg border border-border bg-card px-m text-200 font-semibold text-foreground hover:bg-accent"
          >
            <RotateCcw className="icon-size-200" aria-hidden="true" />
            Clear object view
          </button>
        </div>
      </section>

      {notice && (
        <p
          role="status"
          className="border-b border-status-warning/30 bg-status-warning/10 px-l py-s text-200 text-foreground"
        >
          {notice}
        </p>
      )}

      {query.trim() && (
        <section
          aria-label="Object lineage search results"
          className="max-h-[var(--atlas-xray-min-height)] overflow-auto border-b border-border bg-card px-l py-s"
        >
          <div className="mb-s flex items-center justify-between gap-m">
            <span className="text-200 font-semibold">
              Whole-model results
            </span>
            <span className="text-200 text-muted-foreground">
              {searchResults.length} shown
            </span>
          </div>
          <div className="flex flex-wrap gap-s">
            {searchResults.map((object) => (
              <button
                key={object.key}
                type="button"
                onClick={() => reveal(object.key)}
                className="rounded-lg border border-border bg-secondary px-m py-s text-left text-200 hover:border-primary/50 hover:bg-accent"
              >
                <span className="block font-semibold">{object.name}</span>
                <span className="text-muted-foreground">
                  {object.table} · {object.kind}
                </span>
              </button>
            ))}
            {searchResults.length === 0 && (
              <p className="text-200 text-muted-foreground">
                No measure or column matches this search.
              </p>
            )}
          </div>
        </section>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col xl:flex-row">
        <div
          ref={viewportRef}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              setZoom((value) => stepMapZoom(value, 1));
            } else if (event.key === "-") {
              event.preventDefault();
              setZoom((value) => stepMapZoom(value, -1));
            } else if (event.key === "0") {
              event.preventDefault();
              setZoom(DEFAULT_MAP_ZOOM);
            } else if (event.key.toLowerCase() === "f") {
              event.preventDefault();
              fit();
            }
          }}
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            setZoom((value) =>
              stepMapZoom(value, event.deltaY > 0 ? -1 : 1),
            );
          }}
          className="atlas-map-grid relative min-h-[500px] min-w-0 flex-1 overflow-auto bg-muted/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <div className="sticky left-m top-s z-30 flex w-fit max-w-[var(--atlas-field-width)] items-start gap-s rounded-lg border border-border bg-card px-m py-s text-200 text-muted-foreground shadow-fabric-4">
            <Info className="mt-xxs icon-size-200 shrink-0 text-brand-foreground" aria-hidden="true" />
            <span>
              Expand a table, search the model, or open an object from X-Ray.
              Tables stay fixed while field blocks open.
            </span>
          </div>
          <div
            style={{
              width: graph.width * zoom,
              height: graph.height * zoom,
            }}
          >
            <div
              className="relative origin-top-left"
              style={{
                width: graph.width,
                height: graph.height,
                transform: `scale(${zoom})`,
              }}
            >
              <StageLabels />
              <svg
                className="pointer-events-none absolute inset-0 overflow-visible"
                width={graph.width}
                height={graph.height}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="semantic-object-arrow"
                    markerWidth="7"
                    markerHeight="7"
                    refX="7"
                    refY="3.5"
                    orient="auto"
                  >
                    <path
                      d="M1 0.75 7 3.5 1 6.25"
                      fill="none"
                      stroke="context-stroke"
                      strokeWidth="1.5"
                    />
                  </marker>
                </defs>
                {graph.blocks.map((block) => {
                  const table = graph.tableRows.find(
                    (entry) => entry.key === block.tableKey,
                  );
                  if (!table || table.y === block.y) return null;
                  return (
                    <path
                      key={`contains-${block.tableKey}`}
                      d={`M ${table.x + table.width} ${table.y + table.height / 2} H ${block.x - 18} V ${block.y + 24} H ${block.x}`}
                      fill="none"
                      stroke={NEUTRAL}
                      strokeDasharray="3 5"
                      strokeOpacity="0.55"
                    />
                  );
                })}
                {graph.edges.map((edge) => {
                  const color =
                    edge.tone === "upstream"
                      ? UPSTREAM
                      : edge.tone === "downstream"
                        ? DOWNSTREAM
                        : NEUTRAL;
                  return (
                    <path
                      key={edge.key}
                      d={edgePath(edge)}
                      fill="none"
                      stroke={color}
                      strokeWidth={
                        edge.kind === "item" ? 2.5 : edge.kind === "dax" ? 2 : 1.5
                      }
                      strokeDasharray={edge.inferred ? "3 6" : undefined}
                      strokeOpacity={edge.collapsedEndpoint ? 0.7 : 0.9}
                      markerEnd="url(#semantic-object-arrow)"
                    >
                      <title>
                        {edge.relation}
                        {edge.inferred ? " (inferred)" : ""}
                      </title>
                    </path>
                  );
                })}
              </svg>

              <div
                className="absolute overflow-hidden rounded-xl border border-border bg-card shadow-fabric-4"
                style={{
                  left: graph.tableRows[0]?.x ?? 300,
                  top: 54,
                  width: graph.tableRows[0]?.width ?? 292,
                }}
              >
                <div className="border-b border-border bg-secondary px-m py-s">
                  <div className="text-300 font-semibold">
                    {item.displayName}
                  </div>
                  <div className="text-200 text-muted-foreground">
                    {tables.length} tables · {xray.measureCount} measures ·{" "}
                    {xray.columnCount} columns
                  </div>
                </div>
                {graph.tableRows.map((table) => {
                  const open = state.blocks.some(
                    (block) => block.table === table.key,
                  );
                  const focusKey = tableObjectKey(table.name);
                  const focused = state.focus === focusKey;
                  return (
                    <div
                      key={table.key}
                      className={cn(
                        "flex border-b border-border/70 last:border-b-0",
                        focused && "bg-primary/10",
                      )}
                      style={{ height: table.height }}
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={`${open ? "Collapse" : "Expand"} ${table.name}`}
                        onClick={() => toggleTable(table.name)}
                        className="flex w-[44px] shrink-0 items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        {open ? (
                          <ChevronDown className="icon-size-200" />
                        ) : (
                          <ChevronRight className="icon-size-200" />
                        )}
                      </button>
                      <button
                        type="button"
                        data-lineage-key={focusKey}
                        tabIndex={keyboardKey === focusKey ? 0 : -1}
                        aria-pressed={focused}
                        onFocus={() => setKeyboardKey(focusKey)}
                        onKeyDown={(event) =>
                          handleRovingKey(event, focusKey, () =>
                            focusTable(table.name),
                          )
                        }
                        onClick={() => focusTable(table.name)}
                        className="min-w-0 flex-1 px-s text-left hover:bg-accent"
                      >
                        <span className="block truncate text-200 font-semibold">
                          {table.name}
                        </span>
                        <span className="text-200 text-muted-foreground">
                          {table.measureCount} fx · {table.columnCount} columns
                          {table.isHidden ? " · hidden" : ""}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {graph.blocks.map((block) => (
                <section
                  key={block.tableKey}
                  aria-label={`${block.tableName} fields`}
                  className="absolute overflow-hidden rounded-xl border border-border bg-card shadow-fabric-8"
                  style={{
                    left: block.x,
                    top: block.y,
                    width: block.width,
                    height: block.height,
                  }}
                >
                  <header className="flex h-[48px] items-center gap-s border-b border-border bg-secondary px-m">
                    <Table2 className="icon-size-200 text-object-table" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-200 font-semibold">
                      {block.tableName}
                    </span>
                    <span className="text-200 text-muted-foreground">
                      {block.totalFieldCount}
                    </span>
                    <button
                      type="button"
                      aria-label={`Close ${block.tableName}`}
                      onClick={() =>
                        preserveViewport(() =>
                          dispatch({
                            type: "collapse",
                            table: block.tableKey,
                          }),
                        )
                      }
                      className="flex h-[28px] w-[28px] items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="icon-size-200" aria-hidden="true" />
                    </button>
                  </header>
                  {block.fields.map((field) => {
                    const focused = state.focus === field.key;
                    return (
                      <button
                        key={field.key}
                        type="button"
                        data-object-key={field.key}
                        data-lineage-key={field.key}
                        tabIndex={keyboardKey === field.key ? 0 : -1}
                        aria-pressed={focused}
                        onFocus={() => setKeyboardKey(field.key)}
                        onKeyDown={(event) =>
                          handleRovingKey(event, field.key, () =>
                            reveal(field.key),
                          )
                        }
                        onClick={() => reveal(field.key)}
                        className={cn(
                          "flex h-[32px] w-full items-center gap-s border-b border-border/60 px-m text-left text-200 hover:bg-accent",
                          focused && "bg-primary/10",
                        )}
                      >
                        {field.kind === "measure" ? (
                          <Sigma className="icon-size-200 shrink-0 text-object-measure" aria-hidden="true" />
                        ) : (
                          <Columns3 className="icon-size-200 shrink-0 text-object-column" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1 truncate font-semibold">
                          {field.name}
                        </span>
                        {field.isHidden && (
                          <span className="text-muted-foreground">hidden</span>
                        )}
                        {field.expressionStatus === "unsupported" && (
                          <span className="text-status-warning">DAX omitted</span>
                        )}
                      </button>
                    );
                  })}
                  {block.withheldFieldCount > 0 && (
                    <div className="flex h-[32px] items-center px-m text-200 text-muted-foreground">
                      {block.withheldFieldCount} more. Use search to reveal a
                      specific object.
                    </div>
                  )}
                </section>
              ))}

              <button
                type="button"
                data-lineage-key={graph.modelNode.key}
                tabIndex={keyboardKey === graph.modelNode.key ? 0 : -1}
                aria-pressed={selectedModel}
                onFocus={() => setKeyboardKey(graph.modelNode.key)}
                onKeyDown={(event) =>
                  handleRovingKey(event, graph.modelNode.key, () =>
                    dispatch({
                      type: "focus",
                      key: graph.modelNode.key,
                    }),
                  )
                }
                onClick={() =>
                  dispatch({
                    type: "focus",
                    key: graph.modelNode.key,
                  })
                }
                className={cn(
                  "absolute flex items-center gap-m rounded-xl border bg-card px-m text-left shadow-fabric-8 hover:border-primary/50",
                  selectedModel ? "border-primary" : "border-border",
                )}
                style={{
                  left: graph.modelNode.x,
                  top: graph.modelNode.y,
                  width: graph.modelNode.width,
                  height: graph.modelNode.height,
                }}
              >
                <TypeGlyph type={item.itemType} size={34} />
                <span className="min-w-0">
                  <span className="line-clamp-2 text-200 font-semibold">
                    {item.displayName}
                  </span>
                  <span className="text-200 text-muted-foreground">
                    Semantic Model
                  </span>
                </span>
              </button>

              {graph.sourceNodes.map((node) => (
                <button
                  key={node.key}
                  type="button"
                  onClick={() => onSelectItem(node.itemId)}
                  className="absolute flex items-center gap-s rounded-lg border border-dashed border-lineage-neutral bg-card px-m text-left shadow-fabric-2 hover:bg-accent"
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                  }}
                >
                  <Table2 className="icon-size-300 shrink-0 text-object-source" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-200 font-semibold">
                      {node.label}
                    </span>
                    <span className="block truncate text-200 text-muted-foreground">
                      {node.subtitle} · inferred
                    </span>
                  </span>
                </button>
              ))}

              {graph.consumerNodes.map((node) => {
                const consumer = data.items.find(
                  (entry) => entry.fabricId === node.itemId,
                );
                return (
                  <button
                    key={node.key}
                    type="button"
                    onClick={() => onSelectItem(node.itemId)}
                    className="absolute flex items-center gap-s rounded-lg border border-border bg-card px-m text-left shadow-fabric-2 hover:bg-accent"
                    style={{
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      height: node.height,
                    }}
                  >
                    {consumer && (
                      <TypeGlyph type={consumer.itemType} size={32} />
                    )}
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-200 font-semibold">
                        {node.label}
                      </span>
                      <span className="text-200 text-muted-foreground">
                        {node.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-m float-right z-30 mr-m flex w-fit items-center gap-xxs rounded-lg border border-border bg-card p-xxs shadow-fabric-4">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((value) => stepMapZoom(value, -1))}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ZoomOut className="icon-size-200" />
            </button>
            <span className="min-w-[42px] text-center font-mono text-200 text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((value) => stepMapZoom(value, 1))}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ZoomIn className="icon-size-200" />
            </button>
            <button
              type="button"
              aria-label="Fit object lineage"
              onClick={fit}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Maximize2 className="icon-size-200" />
            </button>
          </div>
        </div>

        <aside className="min-h-[300px] w-full shrink-0 overflow-auto border-t border-border bg-card p-l xl:w-[var(--atlas-evidence-width)] xl:border-l xl:border-t-0">
          <ObjectInspector
            item={item}
            xray={xray}
            selectedObject={selectedObject}
            selectedTable={selectedTable}
            selectedModel={selectedModel}
            onReveal={reveal}
            onOpenXRay={onOpenXRay}
          />
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-l border-t border-border bg-card px-l py-s text-200 text-muted-foreground">
        <LegendLine color={UPSTREAM} label="DAX input" />
        <LegendLine color={DOWNSTREAM} label="DAX consumer" />
        <LegendLine color={NEUTRAL} label="Item link" />
        <LegendLine color={NEUTRAL} dashed label="Inferred source match" />
        <span>
          {graph.renderedFieldRows} of {xray.measureCount + xray.columnCount}{" "}
          fields rendered. All objects remain searchable.
        </span>
        {graph.daxEdgesTruncated && (
          <span className="text-status-warning">
            DAX edges limited to {OBJECT_LINEAGE_LIMITS.maxDaxEdges}.
          </span>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string | number;
  warning?: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          "font-numeric text-300 font-semibold",
          warning && "text-status-warning",
        )}
      >
        {value}
      </div>
      <div className="text-200 text-muted-foreground">{label}</div>
    </div>
  );
}

function StageLabels() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-s grid grid-cols-5 gap-l px-l text-200 font-semibold uppercase tracking-wide text-muted-foreground">
      {["Sources", "Model tables", "Fields", "Model", "Consumers"].map(
        (label) => (
          <span key={label} className="border-b border-border pb-xs">
            {label}
          </span>
        ),
      )}
    </div>
  );
}

function LegendLine({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-s">
      <span
        className="w-l border-t-2"
        style={{
          borderColor: color,
          borderTopStyle: dashed ? "dashed" : "solid",
        }}
      />
      {label}
    </span>
  );
}

function ObjectInspector({
  item,
  xray,
  selectedObject,
  selectedTable,
  selectedModel,
  onReveal,
  onOpenXRay,
}: {
  item: Item;
  xray: ReturnType<typeof buildSemanticModelXRay>;
  selectedObject?: XRayObject;
  selectedTable?: { name: string; measureCount: number; columnCount: number };
  selectedModel: boolean;
  onReveal: (key: string) => void;
  onOpenXRay: (key: string) => void;
}) {
  if (selectedObject) {
    const dependsOn = xray.dependsOn.get(selectedObject.key) ?? [];
    const usedBy = xray.usedBy.get(selectedObject.key) ?? [];
    return (
      <div className="flex flex-col gap-m">
        <div>
          <div className="text-200 uppercase tracking-wide text-muted-foreground">
            {selectedObject.kind} · {selectedObject.table}
          </div>
          <h3 className="break-words text-400 font-semibold">
            {selectedObject.name}
          </h3>
        </div>
        {selectedObject.expressionStatus === "unsupported" && (
          <p className="rounded-lg bg-status-warning/10 p-m text-200 text-foreground">
            The expression was omitted by the metadata safety boundary.
            Dependency evidence is incomplete.
          </p>
        )}
        {selectedObject.expression && (
          <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-secondary p-m font-mono text-200">
            {selectedObject.expression}
          </pre>
        )}
        <InspectorLinks
          label="Depends on"
          keys={dependsOn}
          xray={xray}
          onReveal={onReveal}
          empty="No resolved DAX references among collected expressions."
        />
        <InspectorLinks
          label="Used by"
          keys={usedBy}
          xray={xray}
          onReveal={onReveal}
          empty="No DAX consumers among collected expressions."
        />
        <div className="flex flex-wrap gap-s">
          <button
            type="button"
            onClick={() => onOpenXRay(selectedObject.key)}
            className="atlas-control flex items-center gap-s rounded-lg bg-primary px-m text-200 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Network className="icon-size-200" />
            Open in X-Ray
          </button>
          <a
            href={assetHref(item.fabricId, selectedObject)}
            className="atlas-control flex items-center gap-s rounded-lg border border-border px-m text-200 font-semibold text-foreground hover:bg-accent"
          >
            <ExternalLink className="icon-size-200" />
            Open in Asset Catalog
          </a>
        </div>
      </div>
    );
  }
  if (selectedTable) {
    return (
      <div className="flex flex-col gap-m">
        <div>
          <div className="text-200 uppercase tracking-wide text-muted-foreground">
            Model table
          </div>
          <h3 className="break-words text-400 font-semibold">
            {selectedTable.name}
          </h3>
        </div>
        <Card className="grid grid-cols-2 gap-m p-m">
          <Metric label="Measures" value={selectedTable.measureCount} />
          <Metric label="Columns" value={selectedTable.columnCount} />
        </Card>
        <p className="text-200 text-muted-foreground">
          Expand the table to inspect its fields. Existing table and block
          positions stay fixed.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-m">
      <div>
        <div className="text-200 uppercase tracking-wide text-muted-foreground">
          {selectedModel ? "Semantic Model inventory" : "Object Lineage"}
        </div>
        <h3 className="break-words text-400 font-semibold">
          {item.displayName}
        </h3>
      </div>
      <Card className="grid grid-cols-2 gap-m p-m">
        <Metric label="Tables" value={xray.tables.length} />
        <Metric label="Measures" value={xray.measureCount} />
        <Metric label="Columns" value={xray.columnCount} />
        <Metric label="DAX dependencies" value={xray.edgeCount} />
      </Card>
      <p className="text-200 leading-300 text-muted-foreground">
        Expand a table, search the complete inventory, or open a selected
        object from X-Ray. No table is selected implicitly.
      </p>
    </div>
  );
}

function InspectorLinks({
  label,
  keys,
  xray,
  onReveal,
  empty,
}: {
  label: string;
  keys: string[];
  xray: ReturnType<typeof buildSemanticModelXRay>;
  onReveal: (key: string) => void;
  empty: string;
}) {
  return (
    <section>
      <h4 className="text-300 font-semibold">
        {label} · {keys.length}
      </h4>
      {keys.length === 0 ? (
        <p className="mt-xs text-200 text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-xs flex flex-col gap-xs">
          {keys.map((key) => {
            const object = xray.objects.get(key);
            if (!object) return null;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onReveal(key)}
                  className="break-words text-left text-200 font-semibold text-brand-foreground hover:underline"
                >
                  {object.table} {xrayObjectLabel(object)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
