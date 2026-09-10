import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as RME,
  type PointerEvent as RPE,
} from "react";
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileDown,
  GitBranch,
  Maximize2,
  RotateCcw,
  Search,
  Table2,
  Users,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { ImpactReportDialog } from "../components/ImpactReportDialog";
import { MetadataObjectImpactDialog } from "../components/MetadataObjectImpactDialog";
import { ResizableInspector } from "../components/ResizableInspector";
import {
  metadataObjectKindLabel,
  verifiedMetadataEdgesForItem,
} from "../catalog-objects";
import {
  buildMetadataObjectGraph,
  groupObjectGraphByItem,
  MAX_VISIBLE_OBJECT_EDGES,
  objectItemGroups,
  shouldUseVerifiedMetadataGraph,
  type ObjectGraph,
  type ObjectGraphEdge as ObjectEdge,
  type ObjectGraphNode as ObjectNode,
} from "../metadata-object-graph";
import { useDisplayPreference } from "../display-preferences";
import {
  buildAccessReviewRows,
  selectAccessByItem,
} from "../governance";
import {
  MAP_INSPECTOR_DEFAULT_WIDTH,
  isMapInspectorWidth,
} from "../map-inspector";
import { useAtlas } from "../store";
import {
  Avatar,
  Card,
  EndorsementChip,
  HealthChip,
  HealthDot,
  PrincipalAvatar,
  SectionLabel,
  TypeGlyph,
  cn,
} from "../ui";
import {
  typeMeta,
  schemaFor,
  relativeTime,
  type AtlasData,
  type Health,
  type Item,
  type ModelTableSchema,
} from "../model";
import type {
  MetadataObjectKind,
} from "../item-metadata";
import {
  LINEAGE_STAGE_LABELS,
  buildStagedLayout,
  createLineageIndex,
  getLineageImpact,
  lineageEdgeKey,
  type LineageIndex,
  type SchemaObjectRef,
} from "../lineage";

const NODE_W = 220;
const NODE_H = 76;
const OBJECT_W = 224;
const OBJECT_H = 76;
const NODE_COLUMN_GAP = 292;
const NODE_ROW_GAP = 100;
const OBJECT_ROW_GAP = 100;
const UP = "var(--color-lineage-upstream)";
const DOWN = "var(--color-lineage-downstream)";

type Mode = "items" | "objects";
type InspectorTab = "summary" | "schema" | "access" | "runs";

interface Point {
  x: number;
  y: number;
}

interface ObjectLineageIndex {
  incoming: Map<string, ObjectEdge[]>;
  outgoing: Map<string, ObjectEdge[]>;
}

function objectEdgeKey(edge: ObjectEdge): string {
  return `${edge.source}\u0000${edge.target}\u0000${edge.relation}`;
}

function createObjectLineageIndex(edges: ObjectEdge[]): ObjectLineageIndex {
  const incoming = new Map<string, ObjectEdge[]>();
  const outgoing = new Map<string, ObjectEdge[]>();
  for (const edge of edges) {
    const sourceEdges = outgoing.get(edge.source) ?? [];
    sourceEdges.push(edge);
    outgoing.set(edge.source, sourceEdges);
    const targetEdges = incoming.get(edge.target) ?? [];
    targetEdges.push(edge);
    incoming.set(edge.target, targetEdges);
  }
  return { incoming, outgoing };
}

function getObjectImpact(index: ObjectLineageIndex, startId: string) {
  const walk = (direction: "upstream" | "downstream") => {
    const ids = new Set<string>();
    const edgeKeys = new Set<string>();
    const visited = new Set<string>([startId]);
    const queue = [startId];
    let head = 0;

    while (head < queue.length) {
      const current = queue[head++];
      const edges =
        direction === "upstream"
          ? index.incoming.get(current) ?? []
          : index.outgoing.get(current) ?? [];
      for (const edge of edges) {
        const next = direction === "upstream" ? edge.source : edge.target;
        if (next === startId) continue;
        ids.add(next);
        edgeKeys.add(objectEdgeKey(edge));
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    return { ids, edgeKeys };
  };

  return {
    upstream: walk("upstream"),
    downstream: walk("downstream"),
  };
}

function searchParam(name: string): string {
  return new URL(window.location.href).searchParams.get(name) ?? "";
}

function initialMode(): Mode {
  return searchParam("lineage") === "objects" ? "objects" : "items";
}

function initialInspectorTab(): InspectorTab {
  const requested = searchParam("inspector") as InspectorTab;
  return ["summary", "schema", "access", "runs"].includes(requested)
    ? requested
    : "summary";
}

function initialSelected(items: Item[], index: LineageIndex): string {
  const requested = searchParam("item");
  if (items.some((item) => item.fabricId === requested)) return requested;
  const candidates = items.filter((item) => item.itemType === "SemanticModel");
  const ranked = (candidates.length > 0 ? candidates : items)
    .map((item) => {
      const impact = getLineageImpact(index, item.fabricId);
      return {
        item,
        score: impact.upstream.ids.size + impact.downstream.ids.size,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.displayName.localeCompare(b.item.displayName),
    );
  return ranked[0]?.item.fabricId ?? "";
}

function curve(source: Point, target: Point, width = NODE_W, height = NODE_H): string {
  const x1 = source.x + width;
  const y1 = source.y + height / 2;
  const x2 = target.x;
  const y2 = target.y + height / 2;
  const bend = Math.max(42, Math.abs(x2 - x1) * 0.32);
  return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
}

function matchesItemFilters(
  item: Item,
  type: string,
  health: Health | "all",
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  return (
    (type === "all" || item.itemType === type) &&
    (health === "all" || item.health === health) &&
    (!normalized ||
      item.displayName.toLowerCase().includes(normalized) ||
      typeMeta(item.itemType).label.toLowerCase().includes(normalized) ||
      item.tags.some((tag) => tag.toLowerCase().includes(normalized)))
  );
}

function matchesObjectQuery(node: ObjectNode, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return (
    !normalized ||
    node.label.toLowerCase().includes(normalized) ||
    node.subtitle.toLowerCase().includes(normalized)
  );
}

function objectGraph(
  data: AtlasData,
  selected: Item | undefined,
  selectedSchema: ModelTableSchema[],
  upstream: Item[],
  itemById: Map<string, Item>,
  lineageIndex: LineageIndex,
  tableName: string,
): ObjectGraph {
  if (!selected || selectedSchema.length === 0) {
    return {
      nodes: [],
      edges: [],
      width: 1080,
      height: 520,
      stageLabels: ["Source objects", "Model tables", "Fields", "Consumers"],
      verifiedMetadata: false,
      truncated: false,
    };
  }

  const table = selectedSchema.find((entry) => entry.name === tableName) ?? selectedSchema[0];
  const nodes: ObjectNode[] = [];
  const graphEdges: ObjectEdge[] = [];

  selectedSchema.forEach((entry, index) => {
    const modelNode: ObjectNode = {
      id: `table:${entry.name}`,
      label: entry.name,
      subtitle: `${entry.columns.length} columns · ${entry.measures.length} measures`,
      code: "TB",
      color: "var(--color-object-table)",
      table: entry.name,
      kind: "table",
      x: 330,
      y: 62 + index * OBJECT_ROW_GAP,
    };
    nodes.push(modelNode);

    const sourceItem = upstream.find((item) =>
      (schemaFor(data, item.fabricId) ?? []).some(
        (sourceTable) => sourceTable.name === entry.name,
      ),
    );
    if (sourceItem) {
      const sourceNode: ObjectNode = {
        id: `source:${sourceItem.fabricId}:${entry.name}`,
        label: entry.name,
        subtitle: sourceItem.displayName,
        code: "TB",
        color: "var(--color-object-source)",
        table: entry.name,
        itemId: sourceItem.fabricId,
        kind: "source",
        x: 24,
        y: modelNode.y,
      };
      nodes.push(sourceNode);
      graphEdges.push({
        source: sourceNode.id,
        target: modelNode.id,
        relation:
          lineageIndex.outgoing
            .get(sourceItem.fabricId)
            ?.find((entry) => entry.edge.target === selected.fabricId)
            ?.edge.relation ?? "feeds",
      });
    }
  });

  const owner: ObjectNode = {
    id: `owner:${selected.fabricId}`,
    label: selected.displayName,
    subtitle: typeMeta(selected.itemType).label,
    code: typeMeta(selected.itemType).code,
    color: typeMeta(selected.itemType).color,
    itemId: selected.fabricId,
    kind: "owner",
    x: 660,
    y: 36,
  };
  nodes.push(owner);

  for (const entry of selectedSchema) {
    graphEdges.push({
      source: `table:${entry.name}`,
      target: owner.id,
      relation: "part of",
      structural: true,
    });
  }

  const fields = [
    ...table.measures.map((measure) => ({
      name: measure.name,
      code: "fx",
      color: "var(--color-object-measure)",
      subtitle: "Measure",
    })),
    ...table.columns.map((column) => ({
      name: column.name,
      code: "CL",
      color: "var(--color-object-column)",
      subtitle: column.dataType,
    })),
  ];
  fields.forEach((field, index) => {
    const node: ObjectNode = {
      id: `field:${field.code}:${field.name}`,
      label: field.name,
      subtitle: field.subtitle,
      code: field.code,
      color: field.color,
      table: table.name,
      itemId: selected.fabricId,
      kind: "field",
      x: 660,
      y: 126 + index * OBJECT_ROW_GAP,
    };
    nodes.push(node);
    graphEdges.push({
      source: `table:${table.name}`,
      target: node.id,
      relation: field.code === "fx" ? "measure" : "column",
      structural: true,
    });
  });

  (lineageIndex.outgoing.get(selected.fabricId) ?? [])
    .forEach((entry, index) => {
      const edge = entry.edge;
      const consumer = itemById.get(edge.target);
      if (!consumer) return;
      const node: ObjectNode = {
        id: `consumer:${consumer.fabricId}`,
        label: consumer.displayName,
        subtitle: typeMeta(consumer.itemType).label,
        code: typeMeta(consumer.itemType).code,
        color: typeMeta(consumer.itemType).color,
        itemId: consumer.fabricId,
        kind: "consumer",
        x: 1000,
        y: 72 + index * OBJECT_ROW_GAP,
      };
      nodes.push(node);
      graphEdges.push({ source: owner.id, target: node.id, relation: edge.relation });
    });

  return {
    nodes,
    edges: graphEdges,
    width: 1240,
    height: Math.max(
      520,
      selectedSchema.length * OBJECT_ROW_GAP + 96,
      fields.length * OBJECT_ROW_GAP + 204,
    ),
    table: table.name,
    stageLabels: ["Source objects", "Model tables", "Fields", "Consumers"],
    verifiedMetadata: false,
    truncated: false,
  };
}

function InspectorTabButton({
  active,
  value,
  icon: Icon,
  label,
}: {
  active: boolean;
  value: InspectorTab;
  icon: typeof GitBranch;
  label: string;
}) {
  return (
    <Tabs.Trigger value={value} asChild>
      <button
        type="button"
        className={cn(
          "relative flex h-[42px] flex-1 items-center justify-center gap-[6px] text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground",
          active &&
            "text-foreground after:absolute after:inset-x-[8px] after:bottom-0 after:h-[2px] after:rounded-full after:bg-lineage-downstream",
        )}
      >
        <Icon size={13} />
        {label}
      </button>
    </Tabs.Trigger>
  );
}

export function MapView() {
  const { data, currentUser } = useAtlas();
  const { items, edges, comments, config, principals, jobs } = data;
  const inspectorWidth = useDisplayPreference(
    currentUser.id,
    data.workspace.fabricId,
    "map-inspector-width",
    MAP_INSPECTOR_DEFAULT_WIDTH,
    isMapInspectorWidth,
  );
  const itemById = useMemo(
    () => new Map<string, Item>(items.map((item) => [item.fabricId, item])),
    [items],
  );
  const lineageIndex = useMemo(() => createLineageIndex(edges), [edges]);

  const startingId = useMemo(
    () => initialSelected(items, lineageIndex),
    [items, lineageIndex],
  );
  const [mode, setMode] = useState<Mode>(initialMode);
  const [selId, setSelId] = useState(startingId);
  const [focusId, setFocusId] = useState(startingId);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(startingId ? [startingId] : []),
  );
  const [impactMode, setImpactMode] = useState(
    searchParam("impact") === "focused",
  );
  const [query, setQuery] = useState(searchParam("q"));
  const [typeFilter, setTypeFilter] = useState(searchParam("type") || "all");
  const [healthFilter, setHealthFilter] = useState<Health | "all">(
    (searchParam("health") as Health | "all") || "all",
  );
  const [tableName, setTableName] = useState(searchParam("table"));
  const [sourceItemFilter, setSourceItemFilter] = useState(
    searchParam("source") || "all",
  );
  const [objectKindFilter, setObjectKindFilter] = useState<
    MetadataObjectKind | "all"
  >((searchParam("objectKind") as MetadataObjectKind | "all") || "all");
  const [tab, setTab] = useState<InspectorTab>(initialInspectorTab);
  const [openTables, setOpenTables] = useState<Set<string>>(new Set());
  const [expandedObjectItemIds, setExpandedObjectItemIds] = useState<
    Set<string>
  >(() => new Set(startingId ? [startingId] : []));
  const [drag, setDrag] = useState<Record<string, Point>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [objectDrag, setObjectDrag] = useState<Record<string, Point>>({});
  const [objectDragId, setObjectDragId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [selectedObjectIds, setSelectedObjectIds] = useState<Set<string>>(
    new Set(),
  );
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [impactReportOpen, setImpactReportOpen] = useState(false);
  const dragging = useRef<{
    id: string;
    ids: string[];
    origins: Record<string, Point>;
    pointer: Point;
    moved: boolean;
  } | null>(null);
  const objectDragging = useRef<{
    id: string;
    ids: string[];
    origins: Record<string, Point>;
    pointer: Point;
    moved: boolean;
  } | null>(null);
  const mapPanning = useRef<{
    pointerId: number;
    pointer: Point;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const suppressItemClick = useRef(false);
  const suppressObjectClick = useRef(false);
  const mapRef = useRef<HTMLDivElement>(null);

  const selected =
    itemById.get(selId) ?? (selId ? itemById.get(startingId) : undefined);
  const activeId = selected?.fabricId ?? "";
  const resolvedFocusId = itemById.has(focusId) ? focusId : activeId;
  const schema = useMemo(
    () => schemaFor(data, activeId) ?? [],
    [activeId, data],
  );
  const impact = useMemo(
    () =>
      getLineageImpact(
        lineageIndex,
        activeId,
        impactMode ? Number.POSITIVE_INFINITY : 1,
      ),
    [activeId, impactMode, lineageIndex],
  );
  const upstream = useMemo(
    () =>
      [...impact.upstream.ids]
        .map((id) => itemById.get(id))
        .filter((item): item is Item => !!item)
        .sort(
          (a, b) =>
            (impact.upstream.distance.get(a.fabricId) ?? 0) -
              (impact.upstream.distance.get(b.fabricId) ?? 0) ||
            a.displayName.localeCompare(b.displayName),
        ),
    [impact.upstream.distance, impact.upstream.ids, itemById],
  );
  const downstream = useMemo(
    () =>
      [...impact.downstream.ids]
        .map((id) => itemById.get(id))
        .filter((item): item is Item => !!item)
        .sort(
          (a, b) =>
            (impact.downstream.distance.get(a.fabricId) ?? 0) -
              (impact.downstream.distance.get(b.fabricId) ?? 0) ||
            a.displayName.localeCompare(b.displayName),
        ),
    [impact.downstream.distance, impact.downstream.ids, itemById],
  );
  const connected = useMemo(
    () => new Set([activeId, ...impact.upstream.ids, ...impact.downstream.ids]),
    [activeId, impact.downstream.ids, impact.upstream.ids],
  );
  const types = useMemo(
    () =>
      [...new Set(items.map((item) => item.itemType))].sort((a, b) =>
        typeMeta(a).label.localeCompare(typeMeta(b).label),
      ),
    [items],
  );
  const visibleItems = useMemo(() => {
    if (
      typeFilter === "all" &&
      healthFilter === "all" &&
      !query.trim()
    ) {
      return items;
    }
    return items.filter((item) =>
      matchesItemFilters(item, typeFilter, healthFilter, query),
    );
  }, [healthFilter, items, query, typeFilter]);
  const visibleIds = useMemo(
    () => new Set(visibleItems.map((item) => item.fabricId)),
    [visibleItems],
  );
  const visibleEdges = useMemo(
    () =>
      edges.filter(
        (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
      ),
    [edges, visibleIds],
  );
  const layout = useMemo(
    () =>
      buildStagedLayout(visibleItems, visibleEdges, {
        nodeWidth: NODE_W,
        nodeHeight: NODE_H,
        columnGap: NODE_COLUMN_GAP,
        rowGap: NODE_ROW_GAP,
        componentGap: 52,
        focusId: resolvedFocusId,
      }),
    [resolvedFocusId, visibleEdges, visibleItems],
  );
  const posOf = (id: string) => drag[id] ?? layout.positions.get(id) ?? { x: 0, y: 0 };
  const bounds = useMemo(() => {
    let width = layout.width;
    let height = layout.height;
    Object.values(drag).forEach((point) => {
      width = Math.max(width, point.x + NODE_W + 48);
      height = Math.max(height, point.y + NODE_H + 48);
    });
    return { width, height };
  }, [drag, layout.height, layout.width]);
  const selectedMetadataEdges = useMemo(
    () => verifiedMetadataEdgesForItem(data.objectEdges, activeId),
    [activeId, data.objectEdges],
  );
  const metadataSourceOptions = useMemo(
    () =>
      [
        ...new Set(
          selectedMetadataEdges
            .flatMap((edge) => [edge.source.itemId, edge.target.itemId])
            .filter((itemId) => itemId !== activeId),
        ),
      ].sort((left, right) =>
        (itemById.get(left)?.displayName ?? left).localeCompare(
          itemById.get(right)?.displayName ?? right,
        ),
      ),
    [activeId, itemById, selectedMetadataEdges],
  );
  const metadataTableOptions = useMemo(
    () =>
      [
        ...new Set(
          selectedMetadataEdges.flatMap((edge) =>
            [edge.source.tableName, edge.target.tableName].filter(
              (value): value is string => Boolean(value),
            ),
          ),
        ),
      ].sort(),
    [selectedMetadataEdges],
  );
  const metadataKindOptions = useMemo(
    () =>
      [
        ...new Set(
          selectedMetadataEdges.flatMap((edge) => [
            edge.source.kind,
            edge.target.kind,
          ]),
        ),
      ].sort((left, right) =>
        metadataObjectKindLabel(left).localeCompare(
          metadataObjectKindLabel(right),
        ),
      ),
    [selectedMetadataEdges],
  );
  const resolvedSourceFilter = metadataSourceOptions.includes(sourceItemFilter)
    ? sourceItemFilter
    : "all";
  const resolvedTableFilter = metadataTableOptions.includes(tableName)
    ? tableName
    : "all";
  const resolvedObjectKindFilter = metadataKindOptions.includes(
    objectKindFilter as MetadataObjectKind,
  )
    ? objectKindFilter
    : "all";
  const ungroupedObjects = useMemo(
    () =>
      shouldUseVerifiedMetadataGraph(
        selected,
        schema.length,
        selectedMetadataEdges.length,
      )
        ? buildMetadataObjectGraph(
            selectedMetadataEdges,
            activeId,
            itemById,
            {
              query,
              sourceItemId: resolvedSourceFilter,
              tableName: resolvedTableFilter,
              objectKind: resolvedObjectKindFilter,
            },
          )
        : objectGraph(
            data,
            selected,
            schema,
            upstream,
            itemById,
            lineageIndex,
            tableName,
          ),
    [
      activeId,
      data,
      itemById,
      lineageIndex,
      query,
      resolvedObjectKindFilter,
      resolvedSourceFilter,
      resolvedTableFilter,
      schema,
      selected,
      selectedMetadataEdges,
      tableName,
      upstream,
    ],
  );
  const objectGroups = useMemo(
    () => objectItemGroups(ungroupedObjects, activeId, itemById),
    [activeId, itemById, ungroupedObjects],
  );
  const objects = useMemo(
    () =>
      groupObjectGraphByItem(
        ungroupedObjects,
        activeId,
        itemById,
        expandedObjectItemIds,
      ),
    [activeId, expandedObjectItemIds, itemById, ungroupedObjects],
  );
  const objectLineageIndex = useMemo(
    () => createObjectLineageIndex(objects.edges),
    [objects.edges],
  );
  const objectNodeById = useMemo(
    () => new Map(objects.nodes.map((node) => [node.id, node])),
    [objects.nodes],
  );
  const activeObjectId = objects.nodes.some(
    (node) =>
      node.id === selectedObjectId &&
      matchesObjectQuery(node, query),
  )
    ? selectedObjectId
    : (objects.nodes.find((node) => matchesObjectQuery(node, query))?.id ?? "");
  const activeObject = objectNodeById.get(activeObjectId);
  const reportItemId =
    mode === "objects" ? activeObject?.itemId ?? activeId : activeId;
  const metadataReportObject =
    mode === "objects" ? activeObject?.metadataRef : undefined;
  const reportObject: SchemaObjectRef | undefined =
    mode === "objects" && activeObject?.kind === "table"
      ? {
          itemId: activeId,
          kind: "table",
          name: activeObject.label,
        }
      : mode === "objects" && activeObject?.kind === "source" && activeObject.itemId
        ? {
            itemId: activeObject.itemId,
            kind: "table",
            name: activeObject.label,
          }
        : mode === "objects" && activeObject?.kind === "field"
          ? {
              itemId: activeId,
              kind: activeObject.code === "fx" ? "measure" : "column",
              name: activeObject.label,
              tableName: activeObject.table,
            }
          : undefined;
  const objectImpact = useMemo(
    () => getObjectImpact(objectLineageIndex, activeObjectId),
    [activeObjectId, objectLineageIndex],
  );
  const objectConnected = useMemo(
    () =>
      new Set([
        activeObjectId,
        ...objectImpact.upstream.ids,
        ...objectImpact.downstream.ids,
      ]),
    [activeObjectId, objectImpact.downstream.ids, objectImpact.upstream.ids],
  );
  const objectPosOf = (node: ObjectNode): Point =>
    objectDrag[node.id] ?? { x: node.x, y: node.y };
  const objectBounds = useMemo(() => {
    let width = objects.width;
    let height = objects.height;
    objects.nodes.forEach((node) => {
      const point = objectDrag[node.id] ?? node;
      width = Math.max(width, point.x + OBJECT_W + 48);
      height = Math.max(height, point.y + OBJECT_H + 48);
    });
    return { width, height };
  }, [objectDrag, objects.height, objects.nodes, objects.width]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("lineage", mode);
    if (activeId) url.searchParams.set("item", activeId);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (typeFilter !== "all") url.searchParams.set("type", typeFilter);
    else url.searchParams.delete("type");
    if (healthFilter !== "all") url.searchParams.set("health", healthFilter);
    else url.searchParams.delete("health");
    if (impactMode) url.searchParams.set("impact", "focused");
    else url.searchParams.delete("impact");
    if (mode === "objects" && objects.table) url.searchParams.set("table", objects.table);
    else url.searchParams.delete("table");
    if (mode === "objects" && resolvedSourceFilter !== "all") {
      url.searchParams.set("source", resolvedSourceFilter);
    } else {
      url.searchParams.delete("source");
    }
    if (mode === "objects" && resolvedObjectKindFilter !== "all") {
      url.searchParams.set("objectKind", resolvedObjectKindFilter);
    } else {
      url.searchParams.delete("objectKind");
    }
    if (tab !== "summary") url.searchParams.set("inspector", tab);
    else url.searchParams.delete("inspector");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [
    activeId,
    healthFilter,
    impactMode,
    mode,
    objects.table,
    query,
    resolvedObjectKindFilter,
    resolvedSourceFilter,
    tab,
    typeFilter,
  ]);

  const nodeDown = (event: RPE<HTMLButtonElement>, id: string) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const multi = event.ctrlKey || event.metaKey || event.shiftKey;
    let selection = selectedItemIds;
    if (!selection.has(id)) {
      selection = multi
        ? new Set([...selection, id])
        : new Set([id]);
      setSelectedItemIds(selection);
    }
    const ids = [...selection];
    dragging.current = {
      id,
      ids,
      origins: Object.fromEntries(ids.map((selectedId) => [selectedId, posOf(selectedId)])),
      pointer: { x: event.clientX, y: event.clientY },
      moved: false,
    };
    setDragId(id);
  };
  const nodeMove = (event: RPE<HTMLButtonElement>) => {
    const current = dragging.current;
    if (!current) return;
    const dx = (event.clientX - current.pointer.x) / zoom;
    const dy = (event.clientY - current.pointer.y) / zoom;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) current.moved = true;
    setDrag((previous) => {
      const next = { ...previous };
      current.ids.forEach((id) => {
        const origin = current.origins[id];
        next[id] = {
          x: Math.max(12, origin.x + dx),
          y: Math.max(46, origin.y + dy),
        };
      });
      return next;
    });
  };
  const nodeUp = (event: RPE<HTMLButtonElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const moved = dragging.current?.moved;
    dragging.current = null;
    setDragId(null);
    suppressItemClick.current = !!moved;
    window.setTimeout(() => {
      suppressItemClick.current = false;
    }, 0);
  };
  const resetObjectContext = (
    clearQuery = false,
    expandedItemId = activeId,
  ) => {
    setSelectedObjectId("");
    setSelectedObjectIds(new Set());
    setObjectDrag({});
    setTableName("");
    setSourceItemFilter("all");
    setObjectKindFilter("all");
    setOpenTables(new Set());
    setExpandedObjectItemIds(
      new Set(expandedItemId ? [expandedItemId] : []),
    );
    if (clearQuery) setQuery("");
  };
  const nodeClick = (event: RME<HTMLButtonElement>, id: string) => {
    if (suppressItemClick.current) return;
    const multi = event.ctrlKey || event.metaKey || event.shiftKey;
    if (multi) {
      const next = new Set(selectedItemIds);
      if (next.has(id) && next.size > 1) next.delete(id);
      else next.add(id);
      setSelectedItemIds(next);
      setSelId(next.has(id) ? id : ([...next][0] ?? id));
    } else {
      setSelectedItemIds(new Set([id]));
      setSelId(id);
    }
    resetObjectContext(false, id);
    setTab("summary");
  };

  const switchActiveItem = (itemId: string) => {
    if (!itemById.has(itemId) || itemId === activeId) return false;
    setSelId(itemId);
    setFocusId(itemId);
    setSelectedItemIds(new Set([itemId]));
    resetObjectContext(true, itemId);
    setTypeFilter("all");
    setHealthFilter("all");
    setTab("summary");
    return true;
  };

  const selectObjectNode = (node: ObjectNode) => {
    setSelectedObjectId(node.id);
    if ((node.kind === "source" || node.kind === "table") && node.table) {
      setTableName(node.table);
    }
  };

  const reconcileItemSelection = (
    nextType: string,
    nextHealth: Health | "all",
    nextQuery: string,
  ) => {
    if (
      selected &&
      matchesItemFilters(selected, nextType, nextHealth, nextQuery)
    ) {
      return;
    }
    const next = items.find((item) =>
      matchesItemFilters(item, nextType, nextHealth, nextQuery),
    );
    const nextId = next?.fabricId ?? "";
    setSelId(nextId);
    setFocusId(nextId);
    setSelectedItemIds(new Set(nextId ? [nextId] : []));
    setDrag({});
    resetObjectContext(false, nextId);
  };

  const changeObjectTable = (nextTable: string) => {
    setTableName(nextTable);
    if (selectedMetadataEdges.length > 0) {
      setSelectedObjectId("");
      setSelectedObjectIds(new Set());
      setObjectDrag({});
      return;
    }
    const nextId = `table:${nextTable}`;
    setSelectedObjectId(nextId);
    setSelectedObjectIds(new Set([nextId]));
    setObjectDrag({});
  };

  const changeObjectSource = (nextSource: string) => {
    setSourceItemFilter(nextSource);
    setSelectedObjectId("");
    setSelectedObjectIds(new Set());
    setObjectDrag({});
  };

  const changeObjectKind = (nextKind: MetadataObjectKind | "all") => {
    setObjectKindFilter(nextKind);
    setSelectedObjectId("");
    setSelectedObjectIds(new Set());
    setObjectDrag({});
  };

  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    if (mode === "items") return;
    const active = objectNodeById.get(activeObjectId);
    if (active && matchesObjectQuery(active, nextQuery)) return;
    const next = objects.nodes.find((node) =>
      matchesObjectQuery(node, nextQuery),
    );
    setSelectedObjectId(next?.id ?? "");
    setSelectedObjectIds(new Set(next ? [next.id] : []));
    setObjectDrag({});
  };

  const objectNodeDown = (
    event: RPE<HTMLButtonElement>,
    node: ObjectNode,
  ) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const multi = event.ctrlKey || event.metaKey || event.shiftKey;
    if (
      !multi &&
      node.collapsedItemGroup &&
      node.itemId === activeId
    ) {
      setExpandedObjectItemIds((previous) =>
        new Set([...previous, activeId]),
      );
      return;
    }
    let selection = selectedObjectIds;
    if (!selection.has(node.id)) {
      selection = multi
        ? new Set([...selection, node.id])
        : new Set([node.id]);
      setSelectedObjectIds(selection);
    }
    const ids = [...selection];
    objectDragging.current = {
      id: node.id,
      ids,
      origins: Object.fromEntries(
        ids.map((id) => {
          const selectedNode = objectNodeById.get(id);
          return [
            id,
            selectedNode ? objectPosOf(selectedNode) : { x: 0, y: 0 },
          ];
        }),
      ),
      pointer: { x: event.clientX, y: event.clientY },
      moved: false,
    };
    setObjectDragId(node.id);
  };

  const objectNodeMove = (event: RPE<HTMLButtonElement>) => {
    const current = objectDragging.current;
    if (!current) return;
    const dx = (event.clientX - current.pointer.x) / zoom;
    const dy = (event.clientY - current.pointer.y) / zoom;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) current.moved = true;
    setObjectDrag((previous) => {
      const next = { ...previous };
      current.ids.forEach((id) => {
        const origin = current.origins[id];
        next[id] = {
          x: Math.max(12, origin.x + dx),
          y: Math.max(46, origin.y + dy),
        };
      });
      return next;
    });
  };

  const objectNodeUp = (event: RPE<HTMLButtonElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const moved = objectDragging.current?.moved;
    objectDragging.current = null;
    setObjectDragId(null);
    suppressObjectClick.current = !!moved;
    window.setTimeout(() => {
      suppressObjectClick.current = false;
    }, 0);
  };

  const mapPanStart = (event: RPE<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, a, input, select, textarea, [role='button']")
    ) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    mapPanning.current = {
      pointerId: event.pointerId,
      pointer: { x: event.clientX, y: event.clientY },
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    };
    setIsPanning(true);
  };

  const mapPanMove = (event: RPE<HTMLDivElement>) => {
    const current = mapPanning.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.currentTarget.scrollLeft =
      current.scrollLeft - (event.clientX - current.pointer.x);
    event.currentTarget.scrollTop =
      current.scrollTop - (event.clientY - current.pointer.y);
  };

  const mapPanEnd = (event: RPE<HTMLDivElement>) => {
    if (mapPanning.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    mapPanning.current = null;
    setIsPanning(false);
  };

  const objectNodeClick = (
    event: RME<HTMLButtonElement>,
    node: ObjectNode,
  ) => {
    if (suppressObjectClick.current) return;
    const multi = event.ctrlKey || event.metaKey || event.shiftKey;
    if (
      !multi &&
      node.itemId &&
      node.itemId !== activeId &&
      switchActiveItem(node.itemId)
    ) {
      return;
    }
    if (multi) {
      const next = new Set(selectedObjectIds);
      if (next.has(node.id) && next.size > 1) next.delete(node.id);
      else next.add(node.id);
      setSelectedObjectIds(next);
      const active = next.has(node.id)
        ? node
        : objectNodeById.get([...next][0]);
      if (active) selectObjectNode(active);
    } else {
      setSelectedObjectIds(new Set([node.id]));
      selectObjectNode(node);
    }
  };

  const toggleTable = (name: string) =>
    setOpenTables((previous) => {
      const next = new Set(previous);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const expandAllTables = () =>
    setOpenTables(new Set(schema.map((table) => table.name)));
  const collapseAllTables = () => setOpenTables(new Set());

  const fit = () => {
    const viewport = mapRef.current;
    const graph = mode === "items" ? bounds : objectBounds;
    if (!viewport) return;
    const next = Math.min(
      1.1,
      Math.max(
        0.55,
        Math.min(
          (viewport.clientWidth - 48) / graph.width,
          (viewport.clientHeight - 48) / graph.height,
        ),
      ),
    );
    setZoom(next);
    window.requestAnimationFrame(() => viewport.scrollTo({ top: 0, left: 0 }));
  };

  const resetGraph = () => {
    setDrag({});
    setObjectDrag({});
    setZoom(1);
    setFocusId(activeId);
    setSelectedItemIds(new Set(activeId ? [activeId] : []));
    setSelectedObjectIds(
      new Set(activeObjectId ? [activeObjectId] : []),
    );
    window.requestAnimationFrame(() =>
      mapRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" }),
    );
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy this Fabric Atlas link", window.location.href);
    }
  };

  const accessRows = useMemo(() => buildAccessReviewRows(data), [data]);
  const effectiveAccess = useMemo(() => {
    return selectAccessByItem(accessRows, activeId).map((row) => ({
      principalRef: row.principalRef,
      accessLevel: row.effectiveAccess,
      inherited: row.origin === "workspace",
      mixed: row.origin === "mixed",
      roleName: row.effectiveGrants
        .map((grant) => grant.roleName)
        .filter(Boolean)
        .join(", "),
    }));
  }, [accessRows, activeId]);
  const selectedJobs = jobs
    .filter((job) => job.itemFabricId === activeId)
    .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));
  const graph = mode === "items" ? bounds : objectBounds;
  const portal = (
    (import.meta.env.VITE_FABRIC_PORTAL_URL as string | undefined) ??
    "https://app.fabric.microsoft.com"
  ).replace(/\/$/, "");
  const workspaceUrl = data.workspace.fabricId
    ? `${portal}/groups/${encodeURIComponent(data.workspace.fabricId)}/list?experience=power-bi`
    : portal;

  return (
    <div className="flex h-full min-h-[720px] flex-col xl:min-h-0">
      <div className="atlas-page-header flex flex-wrap items-end justify-between border-b border-border">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-lineage-downstream">
            Workspace topology
          </div>
          <h1 className="mt-[3px] text-[22px] font-bold">Map &amp; lineage</h1>
          <div className="mt-[3px] text-[12px] text-muted-foreground">
            Trace dependencies, inspect objects and estimate downstream change impact.
          </div>
        </div>
        <div className="flex flex-wrap gap-[7px]">
          {[
            ["Items", items.length],
            ["Links", edges.length],
            ["Upstream", upstream.length],
            ["Downstream", downstream.length],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-[78px] rounded-lg border border-border bg-card px-[10px] py-[7px] shadow-fabric-2"
            >
              <div className="font-numeric text-[15px] font-bold">{value}</div>
              <div className="text-[10px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="atlas-toolbar flex flex-wrap items-center border-b border-border bg-card px-l py-s shadow-fabric-2">
        <div className="flex rounded-md border border-border bg-secondary p-[2px]">
          {(["items", "objects"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                if (value === "objects") {
                  setExpandedObjectItemIds(
                    new Set(activeId ? [activeId] : []),
                  );
                }
              }}
              className={cn(
                "rounded-md px-m font-semibold capitalize text-muted-foreground",
                mode === value && "bg-card text-brand-foreground shadow-fabric-2",
              )}
            >
              {value}
            </button>
          ))}
        </div>
        <label className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-[10px] top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <span className="sr-only">Search lineage</span>
          <input
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder={mode === "items" ? "Search items…" : "Search objects…"}
            className="w-full rounded-lg border border-input bg-card pl-[31px] pr-m outline-none"
          />
        </label>
        {mode === "items" ? (
          <>
            <select
              aria-label="Filter by item type"
              value={typeFilter}
              onChange={(event) => {
                const nextType = event.target.value;
                setTypeFilter(nextType);
                reconcileItemSelection(nextType, healthFilter, query);
              }}
              className="rounded-lg border border-input bg-card px-m text-muted-foreground outline-none"
            >
              <option value="all">All types</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {typeMeta(type).label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by health"
              value={healthFilter}
              onChange={(event) => {
                const nextHealth = event.target.value as Health | "all";
                setHealthFilter(nextHealth);
                reconcileItemSelection(typeFilter, nextHealth, query);
              }}
              className="rounded-lg border border-input bg-card px-m text-muted-foreground outline-none"
            >
              <option value="all">All health</option>
              <option value="healthy">Healthy</option>
              <option value="stale">Stale</option>
              <option value="failing">Failing</option>
              <option value="unknown">Unknown</option>
            </select>
          </>
        ) : (
          selectedMetadataEdges.length > 0 ? (
            <>
              {metadataSourceOptions.length > 0 && (
                <select
                  aria-label="Filter object lineage by source item"
                  value={resolvedSourceFilter}
                  onChange={(event) =>
                    changeObjectSource(event.target.value)
                  }
                  className="max-w-[220px] rounded-lg border border-input bg-card px-m text-muted-foreground outline-none"
                >
                  <option value="all">All source items</option>
                  {metadataSourceOptions.map((itemId) => (
                    <option key={itemId} value={itemId}>
                      {itemById.get(itemId)?.displayName ?? itemId}
                    </option>
                  ))}
                </select>
              )}
              {metadataTableOptions.length > 0 && (
                <select
                  aria-label="Select object lineage table"
                  value={resolvedTableFilter}
                  onChange={(event) => changeObjectTable(event.target.value)}
                  className="max-w-[220px] rounded-lg border border-input bg-card px-m text-muted-foreground outline-none"
                >
                  <option value="all">All source objects</option>
                  {metadataTableOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Filter object lineage by object kind"
                value={resolvedObjectKindFilter}
                onChange={(event) =>
                  changeObjectKind(
                    event.target.value as MetadataObjectKind | "all",
                  )
                }
                className="max-w-[220px] rounded-lg border border-input bg-card px-m text-muted-foreground outline-none"
              >
                <option value="all">All object kinds</option>
                {metadataKindOptions.map((objectKind) => (
                  <option key={objectKind} value={objectKind}>
                    {metadataObjectKindLabel(objectKind)}
                  </option>
                ))}
              </select>
            </>
          ) : (
            schema.length > 0 && (
              <select
                aria-label="Select object lineage table"
                value={objects.table ?? ""}
                onChange={(event) => changeObjectTable(event.target.value)}
                className="max-w-[220px] rounded-lg border border-input bg-card px-m text-muted-foreground outline-none"
              >
                {schema.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </select>
            )
          )
        )}
        {mode === "items" && <button
          type="button"
          role="switch"
          aria-checked={impactMode}
          onClick={() => setImpactMode((current) => !current)}
          className={cn(
            "ml-auto flex items-center gap-s rounded-lg border px-m font-semibold",
            impactMode
              ? "border-lineage-upstream/50 bg-lineage-upstream/10 text-lineage-upstream"
              : "border-border text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "relative h-[16px] w-[28px] rounded-full bg-muted after:absolute after:left-[3px] after:top-[3px] after:h-[10px] after:w-[10px] after:rounded-full after:bg-white after:transition-transform",
              impactMode && "bg-lineage-upstream after:translate-x-[12px]",
            )}
          />
          Impact mode
        </button>}
        {mode === "items" && (
          <button
            type="button"
            onClick={() => {
              setFocusId(activeId);
              setDrag({});
            }}
            className="flex items-center gap-s rounded-lg border border-border px-m font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <GitBranch size={13} />
            Focus selection
          </button>
        )}
        {(mode === "items"
          ? selectedItemIds.size
          : selectedObjectIds.size) > 1 && (
          <span className="rounded-lg border border-primary/30 bg-primary/10 px-[9px] py-[7px] text-[11px] font-semibold text-primary">
            {mode === "items"
              ? selectedItemIds.size
              : selectedObjectIds.size}{" "}
            selected
          </span>
        )}
        <button
          type="button"
          onClick={resetGraph}
          className="flex items-center gap-s rounded-lg border border-border px-m font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RotateCcw size={13} />
          Reset
        </button>
      </div>

      {mode === "objects" && objectGroups.length > 0 && (
        <section
          aria-label="Object item groups"
          className="flex flex-wrap items-center gap-m border-b border-border bg-secondary/70 px-l py-s"
        >
          <div className="shrink-0">
            <div className="text-200 font-semibold text-foreground">
              Object item groups
            </div>
            <div className="text-200 text-muted-foreground">
              {objectGroups.length} connected Fabric items
            </div>
          </div>
          <div className="flex min-w-0 flex-1 gap-s overflow-x-auto py-xxs">
            {objectGroups.map((group) => {
              const item = itemById.get(group.itemId);
              const expanded = expandedObjectItemIds.has(group.itemId);
              const active = group.itemId === activeId;
              return (
                <button
                  key={group.itemId}
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => {
                    if (!active) {
                      switchActiveItem(group.itemId);
                      return;
                    }
                    setExpandedObjectItemIds((previous) => {
                      const next = new Set(previous);
                      if (next.has(group.itemId)) next.delete(group.itemId);
                      else next.add(group.itemId);
                      return next;
                    });
                  }}
                  className={cn(
                    "flex shrink-0 items-center gap-s rounded-lg border bg-card px-m py-s text-left shadow-fabric-2 hover:bg-accent",
                    active
                      ? "border-primary/60 text-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {expanded ? (
                    <ChevronDown size={14} aria-hidden="true" />
                  ) : (
                    <ChevronRight size={14} aria-hidden="true" />
                  )}
                  {item && <TypeGlyph type={item.itemType} size={23} />}
                  <span className="max-w-[190px] truncate text-200 font-semibold">
                    {group.label}
                  </span>
                  <span className="rounded-md bg-muted px-s py-xxs font-numeric text-200">
                    {group.objectCount}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-s">
            <button
              type="button"
              onClick={() =>
                setExpandedObjectItemIds(
                  new Set(objectGroups.map((group) => group.itemId)),
                )
              }
              className="rounded-lg border border-primary/35 bg-primary/10 px-m py-s text-200 font-semibold text-primary hover:bg-primary/15"
            >
              Expand all item groups
            </button>
            <button
              type="button"
              onClick={() => setExpandedObjectItemIds(new Set())}
              className="rounded-lg border border-border bg-card px-m py-s text-200 font-semibold text-foreground hover:bg-accent"
            >
              Collapse all item groups
            </button>
          </div>
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div
          ref={mapRef}
          onPointerDown={mapPanStart}
          onPointerMove={mapPanMove}
          onPointerUp={mapPanEnd}
          onPointerCancel={mapPanEnd}
          className={cn(
            "atlas-map-grid relative min-h-[500px] min-w-0 flex-1 touch-none overflow-auto bg-muted/30",
            isPanning ? "cursor-grabbing select-none" : "cursor-grab",
          )}
        >
          {mode === "objects" && (
            <div className="sticky left-[16px] top-[12px] z-20 max-w-[500px] rounded-lg border border-border bg-card px-[10px] py-[7px] text-[11px] text-muted-foreground shadow-fabric-4">
              {objects.verifiedMetadata
                ? "Verified object metadata is shown from the selected item snapshot."
                : "Object metadata is exact; field-to-report usage remains item-level because Fabric does not expose visual field bindings through the current APIs."}
              {objects.truncated
                ? ` The view is limited to ${MAX_VISIBLE_OBJECT_EDGES} edges. Narrow the source, object or kind filter for the remaining relationships.`
                : ""}
            </div>
          )}
          <div style={{ width: graph.width * zoom, height: graph.height * zoom }}>
            <div
              className="relative origin-top-left"
              style={{
                width: graph.width,
                height: graph.height,
                transform: `scale(${zoom})`,
              }}
            >
              {mode === "items" ? (
                <>
                  {layout.groups.map((group) => (
                    <div
                      key={group.id}
                      className="pointer-events-none absolute left-[14px] right-[14px] rounded-xl border border-border/60 bg-card/30"
                      style={{ top: group.y, height: group.height }}
                    >
                      <span className="absolute left-[12px] top-[8px] max-w-[280px] truncate rounded-md bg-background/80 px-[7px] py-[2px] text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                        {group.label}
                      </span>
                    </div>
                  ))}
                  <div
                    className="pointer-events-none absolute inset-x-0 top-[9px] z-[2] grid"
                    style={{
                      gridTemplateColumns: `repeat(${LINEAGE_STAGE_LABELS.length}, 285px)`,
                      paddingLeft: 28,
                    }}
                  >
                    {LINEAGE_STAGE_LABELS.map((label) => (
                      <div
                        key={label}
                        className="flex items-center gap-[7px] pr-[20px] text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                      >
                        <span>{label}</span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    ))}
                  </div>
                  <svg
                    className="pointer-events-none absolute inset-0 z-[1] overflow-visible"
                    width={bounds.width}
                    height={bounds.height}
                    aria-hidden="true"
                  >
                    <defs>
                      {[
                        ["default", "var(--color-lineage-neutral)"],
                        ["up", UP],
                        ["down", DOWN],
                        ["broken", "var(--color-destructive)"],
                      ].map(([id, fill]) => (
                        <marker
                          key={id}
                          id={`atlas-${id}`}
                          markerWidth="7"
                          markerHeight="7"
                          refX="6.2"
                          refY="3.5"
                          orient="auto"
                        >
                          <path d="M0 0 7 3.5 0 7Z" fill={fill} />
                        </marker>
                      ))}
                    </defs>
                    {visibleEdges.map((edge) => {
                      const source = posOf(edge.source);
                      const target = posOf(edge.target);
                      const key = lineageEdgeKey(edge);
                      const isUp = impact.upstream.edgeKeys.has(key);
                      const isDown = impact.downstream.edgeKeys.has(key);
                      const active = isUp || isDown;
                      const color = edge.broken
                        ? "var(--color-destructive)"
                        : isUp
                          ? UP
                          : isDown
                            ? DOWN
                            : "var(--color-lineage-neutral)";
                      return (
                        <g key={key}>
                          <title>{edge.relation}</title>
                          <path
                            className={active && !edge.broken ? "atlas-flow" : undefined}
                            d={curve(source, target)}
                            fill="none"
                            stroke={color}
                            strokeWidth={active ? 2.6 : 1.5}
                            strokeOpacity={
                              active
                                ? 0.96
                                : impactMode
                                  ? 0.08
                                  : edge.broken
                                    ? 0.9
                                    : activeId
                                      ? 0.3
                                      : 0.55
                            }
                            strokeDasharray={
                              edge.broken
                                ? "6 5"
                                : isUp
                                  ? "2 5"
                                  : undefined
                            }
                            markerEnd={`url(#atlas-${
                              edge.broken
                                ? "broken"
                                : isUp
                                  ? "up"
                                  : isDown
                                    ? "down"
                                    : "default"
                            })`}
                          />
                        </g>
                      );
                    })}
                  </svg>
                  {activeId && (
                    <section
                      aria-live="polite"
                      aria-label="Selected lineage relationships"
                      className="sr-only"
                    >
                      <h2>
                        Lineage relationships for{" "}
                        {itemById.get(activeId)?.displayName ?? activeId}
                      </h2>
                      <ul>
                        {visibleEdges
                          .filter((edge) => {
                            const key = lineageEdgeKey(edge);
                            return (
                              impact.upstream.edgeKeys.has(key) ||
                              impact.downstream.edgeKeys.has(key)
                            );
                          })
                          .map((edge) => {
                            const key = lineageEdgeKey(edge);
                            const direction = impact.upstream.edgeKeys.has(key)
                              ? "Upstream"
                              : "Downstream";
                            return (
                              <li key={key}>
                                {direction}:{" "}
                                {itemById.get(edge.source)?.displayName ??
                                  edge.source}{" "}
                                to{" "}
                                {itemById.get(edge.target)?.displayName ??
                                  edge.target}
                                , {edge.relation}
                              </li>
                            );
                          })}
                      </ul>
                    </section>
                  )}
                  {visibleItems.map((item) => {
                    const point = posOf(item.fabricId);
                    const primaryNode = item.fabricId === activeId;
                    const selectedNode =
                      selectedItemIds.has(item.fabricId) || primaryNode;
                    const isUp = impact.upstream.ids.has(item.fabricId);
                    const isDown = impact.downstream.ids.has(item.fabricId);
                    const dim =
                      impactMode &&
                      !!activeId &&
                      !connected.has(item.fabricId);
                    const activeDrag = dragId === item.fabricId;
                    const accent = primaryNode
                      ? "var(--color-primary)"
                      : isUp
                        ? UP
                        : isDown
                          ? DOWN
                          : undefined;
                    return (
                      <button
                        key={item.fabricId}
                        type="button"
                        aria-pressed={selectedNode}
                        onClick={(event) => nodeClick(event, item.fabricId)}
                        aria-label={`${item.displayName}, ${typeMeta(item.itemType).label}, ${item.health}`}
                        title={item.displayName}
                        onPointerDown={(event) => nodeDown(event, item.fabricId)}
                        onPointerMove={nodeMove}
                        onPointerUp={nodeUp}
                        className={cn(
                          "absolute flex touch-none select-none items-center gap-[10px] rounded-lg border bg-card px-[12px] text-left shadow-fabric-2 transition-[box-shadow,opacity,border-color,transform] hover:-translate-y-[1px] hover:shadow-fabric-8",
                          selectedNode ? "border-primary/70" : "border-border",
                          dim &&
                            "border-border/50 bg-card/60 opacity-[0.14] shadow-none",
                          "cursor-grab active:cursor-grabbing",
                        )}
                        style={{
                          left: point.x,
                          top: point.y,
                          width: NODE_W,
                          height: NODE_H,
                          zIndex: activeDrag ? 7 : primaryNode ? 5 : selectedNode ? 4 : dim ? 1 : 3,
                          transform: activeDrag ? "scale(1.04)" : undefined,
                          borderColor: accent,
                          boxShadow: primaryNode
                            ? "0 0 0 2px var(--color-primary), 0 12px 28px -18px rgba(0,0,0,.8)"
                            : selectedNode
                              ? "0 0 0 1px var(--color-primary)"
                            : undefined,
                        }}
                      >
                        {accent && !primaryNode && (
                          <span
                            className="absolute -left-[6px] top-1/2 h-[11px] w-[11px] -translate-y-1/2 rounded-full ring-2 ring-card"
                            style={{ background: accent }}
                          />
                        )}
                        <TypeGlyph type={item.itemType} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 break-words text-200 font-semibold leading-200">
                            {item.displayName}
                          </span>
                          <span className="mt-xs line-clamp-1 text-200 leading-200 text-muted-foreground">
                            {typeMeta(item.itemType).label} · {item.health}
                          </span>
                        </span>
                        <HealthDot health={item.health} />
                      </button>
                    );
                  })}
                </>
              ) : objects.nodes.length > 0 ? (
                <>
                  <div
                    className="pointer-events-none absolute inset-x-0 top-[9px] grid"
                    style={{
                      gridTemplateColumns: `repeat(${objects.stageLabels.length}, 282px)`,
                      paddingLeft: 24,
                    }}
                  >
                    {objects.stageLabels.map((label) => (
                        <div
                          key={label}
                          className="flex items-center gap-[7px] pr-[18px] text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"
                        >
                          <span>{label}</span>
                          <span className="h-px flex-1 bg-border" />
                        </div>
                      ))}
                  </div>
                  <svg
                    className="pointer-events-none absolute inset-0 overflow-visible"
                    width={objectBounds.width}
                    height={objectBounds.height}
                    aria-hidden="true"
                  >
                    <defs>
                      <marker
                        id="atlas-object-downstream"
                        markerWidth="7"
                        markerHeight="7"
                        refX="6.2"
                        refY="3.5"
                        orient="auto"
                      >
                        <path d="M0 0 7 3.5 0 7Z" fill={DOWN} />
                      </marker>
                      <marker
                        id="atlas-object-upstream"
                        markerWidth="7"
                        markerHeight="7"
                        refX="6.2"
                        refY="3.5"
                        orient="auto"
                      >
                        <path d="M0 0 7 3.5 0 7Z" fill={UP} />
                      </marker>
                      <marker
                        id="atlas-object-neutral"
                        markerWidth="7"
                        markerHeight="7"
                        refX="6.2"
                        refY="3.5"
                        orient="auto"
                      >
                        <path d="M0 0 7 3.5 0 7Z" fill="var(--color-lineage-neutral)" />
                      </marker>
                    </defs>
                    {objects.edges.map((edge) => {
                      const sourceNode = objectNodeById.get(edge.source);
                      const targetNode = objectNodeById.get(edge.target);
                      if (!sourceNode || !targetNode) return null;
                      const source = objectPosOf(sourceNode);
                      const target = objectPosOf(targetNode);
                      const key = objectEdgeKey(edge);
                      const isUp = objectImpact.upstream.edgeKeys.has(key);
                      const isDown = objectImpact.downstream.edgeKeys.has(key);
                      const active = isUp || isDown;
                      const color = isUp
                        ? UP
                        : isDown
                          ? DOWN
                          : "var(--color-lineage-neutral)";
                      return (
                        <g key={key}>
                          <title>{edge.relation}</title>
                          <path
                            className={active ? "atlas-flow" : undefined}
                            d={curve(source, target, OBJECT_W, OBJECT_H)}
                            fill="none"
                            stroke={color}
                            strokeWidth={active ? 2.6 : edge.structural ? 1.3 : 1.8}
                            strokeOpacity={
                              active ? 0.96 : activeObjectId ? 0.3 : 0.55
                            }
                            strokeDasharray={
                              isUp
                                ? "2 5"
                                : !active && edge.structural
                                  ? "4 5"
                                  : undefined
                            }
                            markerEnd={`url(#atlas-object-${
                              isUp
                                ? "upstream"
                                : isDown
                                  ? "downstream"
                                  : "neutral"
                            })`}
                          />
                        </g>
                      );
                    })}
                  </svg>
                  {activeObjectId && (
                    <section
                      aria-live="polite"
                      aria-label="Selected object lineage relationships"
                      className="sr-only"
                    >
                      <h2>
                        Object lineage relationships for{" "}
                        {objectNodeById.get(activeObjectId)?.label ??
                          activeObjectId}
                      </h2>
                      <ul>
                        {objects.edges
                          .filter((edge) => {
                            const key = objectEdgeKey(edge);
                            return (
                              objectImpact.upstream.edgeKeys.has(key) ||
                              objectImpact.downstream.edgeKeys.has(key)
                            );
                          })
                          .map((edge) => {
                            const key = objectEdgeKey(edge);
                            const direction =
                              objectImpact.upstream.edgeKeys.has(key)
                                ? "Upstream"
                                : "Downstream";
                            const source =
                              objectNodeById.get(edge.source)?.label ??
                              edge.source;
                            const target =
                              objectNodeById.get(edge.target)?.label ??
                              edge.target;
                            return (
                              <li key={key}>
                                {direction}: {source} to {target},{" "}
                                {edge.relation}
                              </li>
                            );
                          })}
                      </ul>
                    </section>
                  )}
                  {objects.nodes.map((node) => {
                    const point = objectPosOf(node);
                    const primaryNode = node.id === activeObjectId;
                    const selectedNode =
                      selectedObjectIds.size === 0
                        ? primaryNode
                        : selectedObjectIds.has(node.id);
                    const isUp = objectImpact.upstream.ids.has(node.id);
                    const isDown = objectImpact.downstream.ids.has(node.id);
                    const dim = !!activeObjectId && !objectConnected.has(node.id);
                    const draggingNode = objectDragId === node.id;
                    const activeTable = node.table === objects.table;
                    const matches = matchesObjectQuery(node, query);
                    const accent = primaryNode
                      ? "var(--color-primary)"
                      : isUp
                        ? UP
                        : isDown
                          ? DOWN
                          : undefined;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        aria-label={`${node.label}, ${node.subtitle}`}
                        title={`${node.label} (${node.subtitle})`}
                        aria-pressed={selectedNode}
                        onClick={(event) => objectNodeClick(event, node)}
                        onPointerDown={(event) => objectNodeDown(event, node)}
                        onPointerMove={objectNodeMove}
                        onPointerUp={objectNodeUp}
                        className={cn(
                          "absolute flex touch-none cursor-grab select-none items-center gap-[10px] rounded-lg border border-border bg-card px-[11px] text-left shadow-fabric-2 transition-[box-shadow,opacity,border-color,transform] hover:-translate-y-[1px] hover:shadow-fabric-8 active:cursor-grabbing",
                          selectedNode && "border-primary/70",
                          !matches && "border-dashed border-border/70 bg-muted/50 shadow-none",
                          matches &&
                            dim &&
                            "border-border/70 bg-card/85 shadow-none",
                        )}
                        style={{
                          left: point.x,
                          top: point.y,
                          width: OBJECT_W,
                          height: OBJECT_H,
                          zIndex: draggingNode ? 7 : primaryNode ? 5 : selectedNode ? 4 : dim ? 1 : 3,
                          transform: draggingNode ? "scale(1.04)" : undefined,
                          borderColor: accent,
                          boxShadow: primaryNode
                            ? "0 0 0 2px var(--color-primary), 0 12px 28px -18px rgba(0,0,0,.8)"
                            : selectedNode
                              ? "0 0 0 1px var(--color-primary)"
                            : undefined,
                        }}
                      >
                        {accent && !primaryNode && (
                          <span
                            className="absolute -left-[6px] top-1/2 h-[11px] w-[11px] -translate-y-1/2 rounded-full ring-2 ring-card"
                            style={{ background: accent }}
                          />
                        )}
                        <span
                          className="flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                          style={{ background: node.color }}
                        >
                          {node.code}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 break-words text-200 font-semibold leading-200">
                            {node.label}
                          </span>
                          <span className="mt-xs line-clamp-1 break-words text-200 leading-200 text-muted-foreground">
                            {node.subtitle}
                          </span>
                        </span>
                        {activeTable &&
                          (node.kind === "source" || node.kind === "table") &&
                          !primaryNode && (
                          <span className="h-[8px] w-[8px] rounded-full bg-primary" />
                        )}
                      </button>
                    );
                  })}
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center p-[24px]">
                  <Card className="max-w-[450px] border-dashed p-[24px] text-center">
                    <Table2 size={36} className="mx-auto text-muted-foreground" />
                    <div className="mt-[10px] text-[15px] font-semibold">
                      No object lineage available
                    </div>
                    <div className="mt-[5px] text-[12px] leading-[1.5] text-muted-foreground">
                      Select an item with synchronized table, column or measure metadata.
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </div>

          {mode === "items" && visibleItems.length > 0 && (
            <div className="pointer-events-none absolute right-[16px] top-[16px] z-20 h-[90px] w-[146px] overflow-hidden rounded-lg border border-border bg-card shadow-fabric-4">
              {visibleItems.map((item) => {
                const point = posOf(item.fabricId);
                return (
                  <span
                    key={item.fabricId}
                    className={cn(
                      "absolute h-[5px] w-[13px] rounded-sm bg-lineage-neutral",
                      item.fabricId === activeId && "bg-primary",
                      impact.upstream.ids.has(item.fabricId) && "bg-lineage-upstream",
                      impact.downstream.ids.has(item.fabricId) && "bg-lineage-downstream",
                    )}
                    style={{
                      left: 7 + (point.x / Math.max(bounds.width, 1)) * 132,
                      top: 7 + (point.y / Math.max(bounds.height, 1)) * 76,
                    }}
                  />
                );
              })}
              <span className="absolute inset-[7px] rounded border border-primary/60 bg-primary/5" />
            </div>
          )}

          <div className="sticky bottom-[14px] left-[14px] z-20 ml-[14px] flex w-fit flex-wrap items-center gap-[12px] rounded-lg border border-border bg-card px-[11px] py-[8px] text-[10px] text-muted-foreground shadow-fabric-4">
            <span className="flex items-center gap-[5px] text-lineage-upstream">
              <span className="w-[18px] border-t-2 border-dashed border-lineage-upstream" /> upstream
            </span>
            <span className="flex items-center gap-[5px] text-lineage-downstream">
              <span className="h-[2px] w-[18px] bg-lineage-downstream" /> downstream
            </span>
            <span className="flex items-center gap-[5px]">
              <HealthDot health="healthy" size={7} /> healthy
            </span>
            <span>
              {mode === "items"
                ? "Ctrl/Cmd+click to multi-select · drag selection"
                : "Ctrl/Cmd+click to multi-select · drag objects"}
            </span>
          </div>

          <div className="sticky bottom-[14px] float-right z-20 mr-[14px] flex w-fit items-center gap-[3px] rounded-lg border border-border bg-card p-[3px] shadow-fabric-4">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ZoomOut size={14} />
            </button>
            <span className="min-w-[42px] text-center font-mono text-[10px] text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((value) => Math.min(1.35, value + 0.1))}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ZoomIn size={14} />
            </button>
            <span className="mx-[2px] h-[21px] w-px bg-border" />
            <button
              type="button"
              aria-label="Fit lineage graph"
              onClick={fit}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>

        <ResizableInspector
          width={inspectorWidth.value}
          onWidthChange={inspectorWidth.setValue}
          error={inspectorWidth.error}
          className="border-t border-border bg-card xl:border-l xl:border-t-0"
        >
          <Tabs.Root
            value={tab}
            onValueChange={(value) => setTab(value as InspectorTab)}
            asChild
          >
        <aside aria-label="Item details inspector" className="flex min-h-0 flex-1 flex-col">
          {selected && (
            <>
              <div className="border-b border-border p-[16px]">
                <div className="flex items-start gap-[12px]">
                  <TypeGlyph type={selected.itemType} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-[17px] font-bold">{selected.displayName}</div>
                    <div className="mt-[2px] text-200 uppercase tracking-wide text-muted-foreground">
                      {typeMeta(selected.itemType).label}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      inspectorWidth.setValue(MAP_INSPECTOR_DEFAULT_WIDTH)
                    }
                    aria-label="Reset inspector width"
                    title="Reset inspector width"
                    className="hidden h-[32px] w-[32px] items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground xl:flex"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    aria-label="Copy deep link"
                    className="flex h-[32px] w-[32px] items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {copied ? <Check size={14} className="text-status-healthy" /> : <Copy size={14} />}
                  </button>
                </div>
                <div className="mt-[12px] flex flex-wrap items-center gap-[7px]">
                  <HealthChip health={selected.health} />
                  <EndorsementChip
                    endorsement={
                      selected.endorsementRaw ?? selected.endorsement
                    }
                  />
                  {(selected.sensitivity || selected.sensitivityLabelId) && (
                    <span className="rounded-md bg-destructive/10 px-[8px] py-[2px] text-[10px] font-semibold text-destructive">
                      {selected.sensitivity ?? "Labeled"}
                    </span>
                  )}
                </div>
              </div>
              <Tabs.List
                className="flex border-b border-border px-[6px]"
                aria-label="Selected item details"
              >
                <InspectorTabButton active={tab === "summary"} value="summary" icon={GitBranch} label="Summary" />
                <InspectorTabButton active={tab === "schema"} value="schema" icon={Table2} label="Schema" />
                <InspectorTabButton active={tab === "access"} value="access" icon={Users} label="Access" />
                <InspectorTabButton active={tab === "runs"} value="runs" icon={Activity} label="Runs" />
              </Tabs.List>

              <Tabs.Content value={tab} asChild>
              <div className="min-h-[300px] flex-1 overflow-auto p-[16px]">
                {tab === "summary" && (
                  <div className="flex flex-col gap-[14px]">
                    {mode === "objects" && activeObject && (
                      <Card className="p-[12px]">
                        <SectionLabel>Selected object</SectionLabel>
                        <div className="mt-[7px] break-words text-[13px] font-semibold">
                          {activeObject.label}
                        </div>
                        <div className="mt-[3px] break-words text-[10px] text-muted-foreground">
                          {activeObject.metadataRef
                            ? metadataObjectKindLabel(
                                activeObject.metadataRef.kind,
                              )
                            : activeObject.subtitle}
                          {activeObject.table
                            ? ` · ${activeObject.table}`
                            : ""}
                        </div>
                        {activeObject.metadataRef && (
                          <div className="mt-[8px] rounded-lg bg-secondary px-[9px] py-[7px] text-[10px] text-muted-foreground">
                            Verified source-to-consumer object lineage from the
                            active snapshot.
                          </div>
                        )}
                      </Card>
                    )}
                    {selected.description && (
                      <p className="text-[12px] leading-[1.5] text-muted-foreground">{selected.description}</p>
                    )}
                    <Card className="p-[12px]">
                      <div className="flex items-center justify-between gap-[10px] text-[12px]">
                        <span className="text-muted-foreground">Documented owner</span>
                        {selected.ownerName || selected.ownerEmail ? (
                          <span className="flex min-w-0 items-center gap-[7px] text-right font-semibold">
                            <Avatar
                              name={selected.ownerName ?? selected.ownerEmail ?? "Owner"}
                              size={23}
                            />
                            <span className="min-w-0">
                              {selected.ownerName && (
                                <span className="block break-words">
                                  {selected.ownerName}
                                </span>
                              )}
                              {selected.ownerEmail && (
                                <span className="block break-all text-200 font-normal text-muted-foreground">
                                  {selected.ownerEmail}
                                </span>
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {selected.ownerMetadataAvailable === false
                              ? "Not collected"
                              : "Unassigned"}
                          </span>
                        )}
                      </div>
                      <div className="mt-[8px] flex items-center justify-between text-[12px]">
                        <span className="text-muted-foreground">Last refresh</span>
                        <span className="font-semibold">{relativeTime(selected.lastRefresh)}</span>
                      </div>
                    </Card>
                    <div>
                      <SectionLabel>Change impact</SectionLabel>
                      <div className="mt-[7px] grid grid-cols-3 gap-[7px]">
                        {[
                          ["Upstream", upstream.length, "text-lineage-upstream"],
                          ["Downstream", downstream.length, "text-lineage-downstream"],
                          ["Tables", schema.length, "text-foreground"],
                        ].map(([label, value, color]) => (
                          <Card key={label} className="p-[9px]">
                            <div className={cn("text-[19px] font-bold", color as string)}>{value}</div>
                            <div className="text-[9.5px] text-muted-foreground">{label}</div>
                          </Card>
                        ))}
                      </div>
                    </div>
                    {[
                      ["Downstream", downstream, impact.downstream.distance],
                      ["Upstream", upstream, impact.upstream.distance],
                    ].map(([label, list, distance]) => (
                      <div key={label as string}>
                        <SectionLabel>{label as string} · {(list as Item[]).length}</SectionLabel>
                        <div className="mt-[7px] flex flex-col gap-[3px]">
                          {(list as Item[]).length === 0 && (
                            <span className="text-[12px] text-muted-foreground">
                              {label === "Upstream" ? "No upstream source — this is a root." : "Nothing depends on this item."}
                            </span>
                          )}
                          {(list as Item[]).map((item) => (
                            <button
                              key={item.fabricId}
                              type="button"
                              onClick={() => switchActiveItem(item.fabricId)}
                              className="atlas-row flex items-center gap-[8px] rounded-lg px-[7px] text-left hover:bg-accent"
                            >
                              <TypeGlyph type={item.itemType} size={23} />
                              <span className="min-w-0 flex-1 break-words text-200 font-semibold">{item.displayName}</span>
                              <span className="text-200 text-muted-foreground">
                                {(distance as Map<string, number>).get(item.fabricId)} hop
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="grid grid-cols-2 gap-[8px]">
                      <Card className="p-[11px]">
                        <div className="text-[21px] font-bold text-status-healthy">
                          {config.filter((entry) => entry.itemFabricId === activeId).length}
                        </div>
                        <div className="text-[10px] text-muted-foreground">config facts</div>
                      </Card>
                      <Card className="p-[11px]">
                        <div className="text-[21px] font-bold">
                          {comments.filter((comment) => comment.itemFabricId === activeId).length}
                        </div>
                        <div className="text-[10px] text-muted-foreground">comments</div>
                      </Card>
                    </div>
                  </div>
                )}

                {tab === "schema" && (
                  <div>
                    <div className="flex items-center justify-between gap-[8px]">
                      <SectionLabel>Deep lineage · {schema.length} tables</SectionLabel>
                      {schema.length > 0 && (
                        <div className="flex flex-wrap items-center justify-end gap-s">
                          <button
                            type="button"
                            onClick={expandAllTables}
                            disabled={Boolean(query.trim())}
                            className="text-200 font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            Expand all
                          </button>
                          <button
                            type="button"
                            onClick={collapseAllTables}
                            disabled={Boolean(query.trim())}
                            className="text-200 font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            Collapse all
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMode("objects");
                              changeObjectTable(schema[0].name);
                            }}
                            className="text-200 font-semibold text-primary hover:underline"
                          >
                            Show on map
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-[8px] flex flex-col gap-[5px]">
                      {schema.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border p-[18px] text-center text-[12px] text-muted-foreground">
                          No synchronized schema metadata for this item.
                        </div>
                      )}
                      {schema.map((table) => {
                        const open =
                          openTables.has(table.name) || Boolean(query.trim());
                        return (
                          <div key={table.name} className="overflow-hidden rounded-lg border border-border">
                            <button
                              type="button"
                              aria-expanded={open}
                              disabled={Boolean(query.trim())}
                              onClick={() => toggleTable(table.name)}
                              className="atlas-row flex w-full items-center gap-[6px] px-[10px] text-left hover:bg-accent"
                            >
                              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              <span className="min-w-0 flex-1 break-all text-200 font-semibold">{table.name}</span>
                              {table.rows != null && <span className="text-200 text-muted-foreground">{table.rows} rows</span>}
                            </button>
                            {open && (
                              <div className="border-t border-border px-[10px] py-[8px]">
                                {table.measures.map((measure) => (
                                  <div key={measure.name} className="flex items-center gap-[7px] py-[2px] text-[11px]">
                                    <span className="h-[6px] w-[6px] rounded-sm bg-object-measure" />
                                    <span>{measure.name}</span>
                                    <span className="ml-auto text-[9px] text-muted-foreground">measure</span>
                                  </div>
                                ))}
                                {table.columns.map((column) => (
                                  <div key={column.name} className="flex items-center gap-[7px] py-[2px] text-[11px]">
                                    <span className="h-[6px] w-[6px] rounded-sm bg-object-column" />
                                    <span className="min-w-0 flex-1 truncate font-mono">{column.name}</span>
                                    <span className="text-[9px] text-muted-foreground">{column.dataType}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tab === "access" && (
                  <div>
                    <SectionLabel>Effective access · {effectiveAccess.length}</SectionLabel>
                    <div className="mt-[8px] text-[10px] leading-[1.4] text-muted-foreground">
                      Workspace and item grants are additive. Direct shares
                      never reduce inherited access. Owner permission is an
                      access role and is separate from documented ownership.
                    </div>
                    <div className="mt-[10px] flex flex-col gap-[7px]">
                      {effectiveAccess.map((grant) => {
                        const principal = principals.find((entry) => entry.displayName === grant.principalRef);
                        return (
                          <div key={grant.principalRef} className="atlas-row flex items-center gap-[9px] rounded-lg border border-border px-[10px]">
                            <PrincipalAvatar name={grant.principalRef} kind={principal?.kind ?? "user"} size={27} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-semibold">{grant.principalRef}</div>
                              <div className="text-200 text-muted-foreground">
                                {grant.inherited
                                  ? "Inherited · workspace"
                                  : grant.mixed
                                    ? "Mixed · workspace + item"
                                    : "Direct share"}
                                {grant.roleName ? ` · ${grant.roleName}` : ""}
                              </div>
                            </div>
                            <span className="rounded-md bg-primary/10 px-[7px] py-[2px] text-200 font-semibold capitalize text-primary">
                              {grant.accessLevel === "owner"
                                ? "Owner permission"
                                : `${grant.accessLevel} access`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tab === "runs" && (
                  <div>
                    <SectionLabel>Recent runs · {selectedJobs.length}</SectionLabel>
                    <div className="mt-[9px] flex flex-col gap-[7px]">
                      {selectedJobs.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border p-[18px] text-center text-[12px] text-muted-foreground">
                          No recent job history synchronized for this item.
                        </div>
                      )}
                      {selectedJobs.map((job, index) => (
                        <Card key={`${job.startedAt}:${index}`} className="p-[10px]">
                          <div className="flex items-center gap-[7px]">
                            <HealthDot health={job.status === "completed" ? "healthy" : job.status === "failed" ? "failing" : job.status === "running" ? "stale" : "unknown"} />
                            <span className="text-[12px] font-semibold">{job.jobType}</span>
                            <span className="ml-auto text-[10px] capitalize text-muted-foreground">{job.status}</span>
                          </div>
                          <div className="mt-[5px] text-[10px] text-muted-foreground">
                            {relativeTime(job.startedAt)} · {job.durationSec}s
                            {job.message ? ` · ${job.message}` : ""}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </Tabs.Content>

              <div className="flex gap-[8px] border-t border-border p-[12px]">
                <a
                  href={workspaceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-[36px] flex-1 items-center justify-center gap-[7px] rounded-lg bg-primary px-[12px] text-[12px] font-semibold text-primary-foreground hover:brightness-110"
                >
                  Open in Fabric
                  <ExternalLink size={13} />
                </a>
                <button
                  type="button"
                  onClick={() => setImpactReportOpen(true)}
                  className="flex h-[36px] items-center justify-center gap-[7px] rounded-lg border border-border px-[10px] text-[12px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <FileDown size={13} />
                  Impact
                </button>
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  aria-label="Copy deep link"
                  className="flex h-[36px] w-[36px] items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {copied ? <Check size={14} className="text-status-healthy" /> : <Copy size={14} />}
                </button>
              </div>
            </>
          )}
        </aside>
          </Tabs.Root>
        </ResizableInspector>
      </div>
      {metadataReportObject ? (
        <MetadataObjectImpactDialog
          data={data}
          subject={metadataReportObject}
          open={impactReportOpen}
          onClose={() => setImpactReportOpen(false)}
        />
      ) : reportItemId ? (
        <ImpactReportDialog
          data={data}
          itemId={reportItemId}
          object={reportObject}
          open={impactReportOpen}
          onClose={() => setImpactReportOpen(false)}
        />
      ) : null}
    </div>
  );
}
