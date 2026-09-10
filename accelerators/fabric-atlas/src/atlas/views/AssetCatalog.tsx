import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Boxes,
  Bot,
  Braces,
  ChevronDown,
  ChevronRight,
  Columns3,
  FileDown,
  FilterX,
  Link2,
  Network,
  Search,
  ShieldCheck,
  Sigma,
  Table2,
  Users,
  Waypoints,
  X,
} from "lucide-react";
import { ImpactReportDialog } from "../components/ImpactReportDialog";
import { MetadataObjectImpactDialog } from "../components/MetadataObjectImpactDialog";
import {
  ASSET_OBJECT_KINDS,
  assetObjectKindLabel,
  buildCatalogObjects,
  isAssetObjectKind,
  isMetadataAssetKind,
  metadataObjectImpact,
  metadataObjectKindLabel,
  type AssetObjectKind,
  type CatalogObject,
} from "../catalog-objects";
import {
  buildAccessReviewRows,
  selectAccessByItem,
} from "../governance";
import type { SchemaObjectRef } from "../lineage";
import type { AtlasFocusRequest, AtlasNavigation } from "../navigation";
import {
  buildSchemaDependencies,
  createSchemaLineageIndex,
  schemaObjectKey,
} from "../schema-lineage";
import { useAtlas } from "../store";
import { PrincipalAvatar, SectionLabel, TypeGlyph, cn } from "../ui";
import {
  typeMeta,
  type AccessLevel,
  type ItemType,
} from "../model";

type AssetKind = AssetObjectKind;
type Asset = CatalogObject;

const KIND_META: Record<
  AssetKind,
  {
    label: string;
    icon: typeof Table2;
    tone: string;
    selectedTone: string;
  }
> = {
  table: {
    label: "Table",
    icon: Table2,
    tone: "border-object-source/30 bg-object-source/10 text-object-source",
    selectedTone: "border-object-source/50 bg-object-source/10",
  },
  view: {
    label: "View",
    icon: Table2,
    tone:
      "border-lineage-downstream/30 bg-lineage-downstream/10 text-lineage-downstream",
    selectedTone: "border-lineage-downstream/50 bg-lineage-downstream/10",
  },
  column: {
    label: "Column",
    icon: Columns3,
    tone: "border-object-column/30 bg-object-column/10 text-object-column",
    selectedTone: "border-object-column/50 bg-object-column/10",
  },
  measure: {
    label: "Measure / KPI",
    icon: Sigma,
    tone: "border-object-measure/30 bg-object-measure/10 text-object-measure",
    selectedTone: "border-object-measure/50 bg-object-measure/10",
  },
  kqlTable: {
    label: "KQL table",
    icon: Table2,
    tone: "border-lineage-downstream/30 bg-lineage-downstream/10 text-lineage-downstream",
    selectedTone: "border-lineage-downstream/50 bg-lineage-downstream/10",
  },
  kqlColumn: {
    label: "KQL column",
    icon: Columns3,
    tone: "border-object-column/30 bg-object-column/10 text-object-column",
    selectedTone: "border-object-column/50 bg-object-column/10",
  },
  kqlFunction: {
    label: "KQL function",
    icon: Braces,
    tone: "border-primary/30 bg-primary/10 text-primary",
    selectedTone: "border-primary/50 bg-primary/10",
  },
  kqlFunctionParameter: {
    label: "KQL function parameter",
    icon: Braces,
    tone: "border-object-column/30 bg-object-column/10 text-object-column",
    selectedTone: "border-object-column/50 bg-object-column/10",
  },
  kqlMaterializedView: {
    label: "KQL materialized view",
    icon: Table2,
    tone: "border-lineage-upstream/30 bg-lineage-upstream/10 text-lineage-upstream",
    selectedTone: "border-lineage-upstream/50 bg-lineage-upstream/10",
  },
  sqlTable: {
    label: "SQL table",
    icon: Table2,
    tone: "border-object-source/30 bg-object-source/10 text-object-source",
    selectedTone: "border-object-source/50 bg-object-source/10",
  },
  sqlView: {
    label: "SQL view",
    icon: Table2,
    tone: "border-lineage-downstream/30 bg-lineage-downstream/10 text-lineage-downstream",
    selectedTone: "border-lineage-downstream/50 bg-lineage-downstream/10",
  },
  sqlColumn: {
    label: "SQL column",
    icon: Columns3,
    tone: "border-object-column/30 bg-object-column/10 text-object-column",
    selectedTone: "border-object-column/50 bg-object-column/10",
  },
  ontologyEntity: {
    label: "Ontology entity",
    icon: Network,
    tone: "border-primary/30 bg-primary/10 text-primary",
    selectedTone: "border-primary/50 bg-primary/10",
  },
  ontologyProperty: {
    label: "Ontology property",
    icon: Columns3,
    tone: "border-object-column/30 bg-object-column/10 text-object-column",
    selectedTone: "border-object-column/50 bg-object-column/10",
  },
  ontologyTimeSeriesProperty: {
    label: "Ontology time-series property",
    icon: Columns3,
    tone: "border-lineage-upstream/30 bg-lineage-upstream/10 text-lineage-upstream",
    selectedTone: "border-lineage-upstream/50 bg-lineage-upstream/10",
  },
  ontologyRelationship: {
    label: "Ontology relationship",
    icon: Link2,
    tone: "border-lineage-downstream/30 bg-lineage-downstream/10 text-lineage-downstream",
    selectedTone: "border-lineage-downstream/50 bg-lineage-downstream/10",
  },
  ontologyContextualization: {
    label: "Ontology contextualization",
    icon: Link2,
    tone: "border-status-warning/30 bg-status-warning/10 text-status-warning",
    selectedTone: "border-status-warning/50 bg-status-warning/10",
  },
  graphNode: {
    label: "Graph node type",
    icon: Waypoints,
    tone: "border-primary/30 bg-primary/10 text-primary",
    selectedTone: "border-primary/50 bg-primary/10",
  },
  graphEdge: {
    label: "Graph edge type",
    icon: Link2,
    tone: "border-lineage-downstream/30 bg-lineage-downstream/10 text-lineage-downstream",
    selectedTone: "border-lineage-downstream/50 bg-lineage-downstream/10",
  },
  graphProperty: {
    label: "Graph property",
    icon: Columns3,
    tone: "border-object-column/30 bg-object-column/10 text-object-column",
    selectedTone: "border-object-column/50 bg-object-column/10",
  },
  graphSourceMapping: {
    label: "Graph source mapping",
    icon: Link2,
    tone: "border-object-source/30 bg-object-source/10 text-object-source",
    selectedTone: "border-object-source/50 bg-object-source/10",
  },
  dataAgentSource: {
    label: "Data Agent source",
    icon: Bot,
    tone: "border-primary/30 bg-primary/10 text-primary",
    selectedTone: "border-primary/50 bg-primary/10",
  },
  dataAgentElement: {
    label: "Data Agent selected source element",
    icon: Boxes,
    tone: "border-object-source/30 bg-object-source/10 text-object-source",
    selectedTone: "border-object-source/50 bg-object-source/10",
  },
};

const SCHEMA_CATALOG_ITEM_TYPES = new Set<ItemType>([
  "Lakehouse",
  "Warehouse",
  "Eventhouse",
  "KQLDatabase",
  "SQLEndpoint",
  "SQLDatabase",
  "SemanticModel",
  "Datamart",
  "MirroredDatabase",
  "Ontology",
  "GraphModel",
  "DataAgent",
]);

const ACCESS_META: Record<
  AccessLevel,
  { label: string; className: string }
> = {
  owner: {
    label: "Owner permission",
    className:
      "border-object-measure/30 bg-object-measure/10 text-object-measure",
  },
  edit: {
    label: "Edit",
    className:
      "border-status-healthy/30 bg-status-healthy/10 text-status-healthy",
  },
  view: {
    label: "View",
    className:
      "border-object-column/30 bg-object-column/10 text-object-column",
  },
  none: {
    label: "None",
    className:
      "border-lineage-neutral/30 bg-lineage-neutral/10 text-muted-foreground",
  },
};

function AccessChip({ level }: { level: AccessLevel }) {
  const access = ACCESS_META[level];
  return (
    <span
      className={cn(
        "rounded-md border px-s py-xxs text-[length:var(--text-200)] font-semibold",
        access.className,
      )}
    >
      {access.label}
    </span>
  );
}

function KindGlyph({ kind }: { kind: AssetKind }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "flex size-xxxl shrink-0 items-center justify-center rounded-lg border",
        meta.tone,
      )}
      aria-hidden="true"
    >
      <Icon className="icon-size-200" />
    </span>
  );
}

function MetadataCell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-secondary px-m py-s">
      <div className="text-200 font-semibold text-muted-foreground">
        {label}
      </div>
      <div className="mt-xxs break-words text-300 font-semibold">{value || "Not collected"}</div>
    </div>
  );
}

function safeGroupId(value: string) {
  return `asset-group-${value.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
}

function matchesAsset(
  asset: Asset,
  itemById: ReadonlyMap<string, { displayName: string; itemType: ItemType }>,
  query: string,
  kind: AssetKind | "all",
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  const item = itemById.get(asset.itemFabricId);
  const itemMatches =
    item?.displayName.toLowerCase().includes(normalizedQuery) ||
    typeMeta(item?.itemType ?? asset.itemType)
      .label.toLowerCase()
      .includes(normalizedQuery);
  return (
    (kind === "all" || asset.kind === kind) &&
    (!normalizedQuery ||
      itemMatches ||
      asset.name.toLowerCase().includes(normalizedQuery) ||
      asset.itemName.toLowerCase().includes(normalizedQuery) ||
      (asset.tableName ?? "").toLowerCase().includes(normalizedQuery) ||
      (asset.parentName ?? "").toLowerCase().includes(normalizedQuery) ||
      (asset.source ?? "").toLowerCase().includes(normalizedQuery) ||
      (asset.sourceItemName ?? "").toLowerCase().includes(normalizedQuery) ||
      (asset.description ?? "").toLowerCase().includes(normalizedQuery))
  );
}

export function AssetCatalogView({
  focus,
  onStateChange,
}: {
  focus?: AtlasFocusRequest;
  onStateChange?: (navigation: AtlasNavigation) => void;
} = {}) {
  const { data } = useAtlas();
  const { items, principals } = data;

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.fabricId, item])),
    [items],
  );
  const principalByName = useMemo(
    () =>
      new Map(
        principals.map((principal) => [principal.displayName, principal]),
      ),
    [principals],
  );

  const assets = useMemo<Asset[]>(
    () => buildCatalogObjects(data, { includeConfigTables: true }),
    [data],
  );

  const initialFocusedAsset =
    focus?.objectId || focus?.objectName
      ? assets.find(
          (asset) =>
            (!focus.itemId || asset.itemFabricId === focus.itemId) &&
            (!focus.objectId || asset.objectId === focus.objectId) &&
            (!focus.objectName || asset.name === focus.objectName) &&
            (!focus.tableName ||
              asset.tableName === focus.tableName ||
              asset.parentName === focus.tableName) &&
            (!focus.objectKind || asset.kind === focus.objectKind),
        )
      : undefined;
  const [query, setQuery] = useState(focus?.query ?? "");
  const [kind, setKind] = useState<AssetKind | "all">(
    typeof focus?.filters?.kind === "string" &&
      isAssetObjectKind(focus.filters.kind)
      ? focus.filters.kind
      : "all",
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () =>
      new Set(
        initialFocusedAsset ? [initialFocusedAsset.itemFabricId] : [],
      ),
  );

  const filtered = useMemo(() => {
    return assets.filter((asset) => matchesAsset(asset, itemById, query, kind));
  }, [assets, itemById, query, kind]);

  const inventoryItems = useMemo(() => {
    const itemIdsWithAssets = new Set(
      assets.map((asset) => asset.itemFabricId),
    );
    return items.filter(
      (item) =>
        itemIdsWithAssets.has(item.fabricId) ||
        SCHEMA_CATALOG_ITEM_TYPES.has(item.itemType),
    );
  }, [assets, items]);

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const grouped = new Map<string, Asset[]>();
    if (kind === "all") {
      for (const item of inventoryItems) {
        if (
          !normalizedQuery ||
          item.displayName.toLowerCase().includes(normalizedQuery) ||
          typeMeta(item.itemType).label.toLowerCase().includes(normalizedQuery)
        ) {
          grouped.set(item.fabricId, []);
        }
      }
    }
    for (const asset of filtered) {
      const group = grouped.get(asset.itemFabricId) ?? [];
      group.push(asset);
      grouped.set(asset.itemFabricId, group);
    }
    return inventoryItems.flatMap((item) => {
      const group = grouped.get(item.fabricId);
      return group ? ([[item.fabricId, group]] as const) : [];
    });
  }, [filtered, inventoryItems, kind, query]);

  const [selId, setSelId] = useState(initialFocusedAsset?.id ?? "");
  const [impactOpen, setImpactOpen] = useState(false);
  const requestedAsset = assets.find((asset) => asset.id === selId);
  const selectedAsset =
    requestedAsset &&
    filtered.some((asset) => asset.id === requestedAsset.id)
      ? requestedAsset
      : undefined;

  useEffect(() => {
    onStateChange?.({
      tab: "assets",
      focus: {
        requestId: "assets-view-state",
        itemId: selectedAsset?.itemFabricId,
        tableName: selectedAsset?.tableName ?? selectedAsset?.parentName,
        objectName: selectedAsset?.name,
        objectId: selectedAsset?.objectId,
        objectKind: selectedAsset?.kind,
        query: query.trim() || undefined,
        filters: kind === "all" ? undefined : { kind },
      },
    });
  }, [kind, onStateChange, query, selectedAsset]);

  const accessRows = useMemo(() => buildAccessReviewRows(data), [data]);
  const schemaDependencies = useMemo(
    () => buildSchemaDependencies(data),
    [data],
  );
  const schemaLineage = useMemo(
    () => createSchemaLineageIndex(schemaDependencies),
    [schemaDependencies],
  );
  const access = useMemo(() => {
    if (!selectedAsset) return [];
    return selectAccessByItem(accessRows, selectedAsset.itemFabricId).map(
      (row) => ({
        name: row.principalRef,
        level: row.effectiveAccess,
        inherited: row.origin === "workspace",
        mixed: row.origin === "mixed",
        roleName: row.effectiveGrants
          .map((grant) => grant.roleName)
          .filter(Boolean)
          .join(", "),
      }),
    );
  }, [accessRows, selectedAsset]);

  const counts = Object.fromEntries([
    ["all", assets.length],
    ...ASSET_OBJECT_KINDS.map((assetKind) => [
      assetKind,
      assets.filter((asset) => asset.kind === assetKind).length,
    ]),
  ]) as Record<AssetKind | "all", number>;
  const kinds: { key: AssetKind | "all"; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "table", label: "Tables", count: counts.table },
    { key: "view", label: "Views", count: counts.view },
    { key: "column", label: "Columns", count: counts.column },
    { key: "measure", label: "Measures / KPIs", count: counts.measure },
  ];
  const additionalKinds = ASSET_OBJECT_KINDS.filter(
    (assetKind) =>
      !["table", "view", "column", "measure"].includes(assetKind) &&
      counts[assetKind] > 0,
  );

  const selectedItem = selectedAsset
    ? itemById.get(selectedAsset.itemFabricId)
    : undefined;
  const selectedObject = selectedAsset
    ? (["table", "view", "column", "measure"].includes(selectedAsset.kind)
      ? ({
        itemId: selectedAsset.itemFabricId,
        kind: selectedAsset.kind as SchemaObjectRef["kind"],
        name: selectedAsset.name,
        tableName: selectedAsset.tableName,
      } satisfies SchemaObjectRef)
      : undefined)
    : undefined;
  const selectedDependencies = selectedObject
    ? {
        upstream:
          schemaLineage.dependenciesByFrom.get(
            schemaObjectKey(selectedObject),
          ) ?? [],
        downstream:
          schemaLineage.consumersByTo.get(schemaObjectKey(selectedObject)) ??
          [],
      }
    : { upstream: [], downstream: [] };
  const selectedMetadataImpact = selectedAsset?.metadataRef
    ? metadataObjectImpact(data.objectEdges, selectedAsset.metadataRef)
    : undefined;
  const hasActiveFilters = Boolean(query.trim() || kind !== "all");

  const resetFilters = () => {
    setQuery("");
    setKind("all");
  };
  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    if (
      requestedAsset &&
      !matchesAsset(requestedAsset, itemById, nextQuery, kind)
    ) {
      setSelId("");
    }
  };
  const changeKind = (nextKind: AssetKind | "all") => {
    setKind(nextKind);
    if (
      requestedAsset &&
      !matchesAsset(requestedAsset, itemById, query, nextKind)
    ) {
      setSelId("");
    }
  };

  return (
    <div className="atlas-content-frame flex h-full flex-col gap-l p-xxl">
      <header className="overflow-hidden rounded-xl border border-border bg-card shadow-fabric-2">
        <div className="atlas-page-header flex flex-col lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <SectionLabel>Schema inventory</SectionLabel>
            <div className="mt-xs flex flex-wrap items-baseline gap-s">
              <h1 className="text-600 font-bold leading-600">Asset Catalog</h1>
              <span className="text-300 text-muted-foreground">
                Physical, semantic, ontology, graph, KQL and agent objects
              </span>
            </div>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-secondary">
            <div className="px-l py-s text-center">
              <dt className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                Assets
              </dt>
              <dd className="font-numeric text-400 font-bold">{assets.length}</dd>
            </div>
            <div className="px-l py-s text-center">
              <dt className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                Items
              </dt>
              <dd className="font-numeric text-400 font-bold">
                {inventoryItems.length}
              </dd>
            </div>
            <div className="px-l py-s text-center">
              <dt className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                Showing
              </dt>
              <dd className="font-numeric text-400 font-bold">
                {filtered.length}
              </dd>
            </div>
          </dl>
        </div>

        <div className="atlas-toolbar flex flex-col border-t border-border bg-secondary px-l py-s xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="asset-search" className="sr-only">
              Search assets
            </label>
            <Search className="icon-size-200 pointer-events-none absolute left-m top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id="asset-search"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
              placeholder="Search object, source or parent item"
              className="h-9 w-full rounded-lg border border-input bg-card pl-xxxl pr-xxxl text-300 text-foreground placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => changeQuery("")}
                aria-label="Clear asset search"
                className="absolute right-s top-1/2 -translate-y-1/2 rounded-md p-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="icon-size-100" />
              </button>
            )}
          </div>

          <div
            className="flex flex-wrap gap-xs"
            role="group"
            aria-label="Filter assets by kind"
          >
            {kinds.map(({ key, label, count }) => (
              <button
                type="button"
                key={key}
                aria-pressed={kind === key}
                onClick={() => changeKind(key)}
                className={cn(
                  "inline-flex h-9 items-center gap-s rounded-lg border px-m text-[length:var(--text-200)] font-semibold transition-colors",
                  kind === key
                    ? "border-primary/35 bg-primary/10 text-brand-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {label}
                <span
                  className={cn(
                    "rounded-md px-xs py-xxs font-numeric text-100",
                    kind === key ? "bg-card text-brand-foreground" : "bg-muted",
                  )}
                >
                  {count}
                </span>
              </button>
            ))}
            {additionalKinds.length > 0 && (
              <select
                aria-label="Filter by discovered object kind"
                value={
                  kind !== "all" &&
                  !["table", "view", "column", "measure"].includes(kind)
                    ? kind
                    : ""
                }
                onChange={(event) => {
                  const next = event.target.value;
                  changeKind(isAssetObjectKind(next) ? next : "all");
                }}
                className="h-9 max-w-64 rounded-lg border border-input bg-card px-m text-200 font-semibold text-muted-foreground"
              >
                <option value="">More object kinds</option>
                {additionalKinds.map((assetKind) => (
                  <option key={assetKind} value={assetKind}>
                    {assetObjectKindLabel(assetKind)} ({counts[assetKind]})
                  </option>
                ))}
              </select>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-9 items-center justify-center gap-xs rounded-lg px-m text-200 font-semibold text-primary hover:bg-primary/10"
            >
              <FilterX className="icon-size-100" />
              Reset
            </button>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-l xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-fabric-2">
          <div className="atlas-toolbar atlas-row flex flex-wrap items-center border-b border-border bg-card px-l">
            <div>
              <h2 className="text-300 font-semibold">Items and assets</h2>
              <p className="text-200 text-muted-foreground">
                {groups.length} {groups.length === 1 ? "item" : "items"} ·{" "}
                {filtered.length} {filtered.length === 1 ? "asset" : "assets"}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-xs">
              <button
                type="button"
                onClick={() =>
                  setExpandedGroups(
                    new Set(groups.map(([itemId]) => itemId)),
                  )
                }
                disabled={groups.length === 0 || Boolean(query.trim())}
                className="inline-flex items-center gap-xs rounded-md px-s py-xs text-200 font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <ChevronDown className="icon-size-100" />
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setExpandedGroups(new Set())}
                disabled={
                  expandedGroups.size === 0 || Boolean(query.trim())
                }
                className="inline-flex items-center gap-xs rounded-md px-s py-xs text-200 font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <ChevronRight className="icon-size-100" />
                Collapse all
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-secondary/30 p-s">
            {groups.length === 0 && (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-xl py-xxxl text-center">
                <Search className="icon-size-500 text-muted-foreground" />
                <h3 className="mt-m text-400 font-semibold">
                  No matching assets
                </h3>
                <p className="mt-xs text-300 text-muted-foreground">
                  Try another search or asset kind. Schema assets appear after a
                  workspace sync.
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-l rounded-lg bg-primary px-l py-s text-300 font-semibold text-primary-foreground hover:bg-primary-hover"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            <div className="space-y-s">
              {groups.map(([itemId, groupAssets]) => {
                const item = itemById.get(itemId);
                const open =
                  Boolean(query.trim()) || expandedGroups.has(itemId);
                const controlsId = safeGroupId(itemId);
                return (
                  <article
                    key={itemId}
                    className="atlas-windowed-group overflow-hidden rounded-xl border border-border bg-card"
                  >
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={controlsId}
                      disabled={Boolean(query.trim())}
                      onClick={() =>
                        setExpandedGroups((previous) => {
                          const next = new Set(previous);
                          if (next.has(itemId)) next.delete(itemId);
                          else next.add(itemId);
                          return next;
                        })
                      }
                      className="atlas-row flex w-full items-center gap-m px-l text-left transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-100"
                    >
                      <span className="flex size-xxl shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
                        {open ? (
                          <ChevronDown className="icon-size-200" />
                        ) : (
                          <ChevronRight className="icon-size-200" />
                        )}
                      </span>
                      {item && <TypeGlyph type={item.itemType} size={32} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-300 font-semibold">
                          {item?.displayName ?? "Unknown item"}
                        </span>
                        <span className="block text-200 text-muted-foreground">
                          {item ? typeMeta(item.itemType).label : "Item"}
                        </span>
                      </span>
                      <span className="rounded-md border border-border bg-secondary px-s py-xs font-numeric text-200 font-semibold text-muted-foreground">
                        {groupAssets.length}
                      </span>
                    </button>

                    {open && (
                      <div
                        id={controlsId}
                        className="border-t border-border bg-secondary/30 p-s"
                      >
                        <div className="space-y-xs">
                          {groupAssets.length === 0 ? (
                            <div className="flex items-start gap-m rounded-lg border border-dashed border-border bg-card p-m">
                              <Boxes className="icon-size-300 shrink-0 text-muted-foreground" />
                              <div>
                                <div className="text-300 font-semibold">
                                  Item synchronized
                                </div>
                                <p className="mt-xs text-200 text-muted-foreground">
                                  No discoverable objects were exposed for this
                                  item in the latest sync.
                                </p>
                              </div>
                            </div>
                          ) : groupAssets.map((asset) => {
                            const meta = KIND_META[asset.kind];
                            const active = selectedAsset?.id === asset.id;
                            return (
                              <button
                                type="button"
                                key={asset.id}
                                aria-pressed={active}
                                onClick={() => setSelId(asset.id)}
                                className={cn(
                                  "flex w-full items-center gap-m rounded-lg border px-m py-s text-left transition-colors",
                                  active
                                    ? meta.selectedTone
                                    : "border-transparent bg-card hover:border-border hover:bg-accent",
                                )}
                              >
                                <KindGlyph kind={asset.kind} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-300 font-semibold">
                                    {asset.name}
                                  </span>
                                  <span className="block truncate text-200 text-muted-foreground">
                                    {meta.label}
                                    {asset.parentName
                                      ? ` · ${asset.parentName}`
                                      : ""}
                                  </span>
                                </span>
                                {asset.dataType && (
                                  <span className="shrink-0 rounded-md border border-border bg-secondary px-s py-xxs text-200 text-muted-foreground">
                                    {asset.dataType}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <AnimatePresence mode="wait">
          {selectedAsset ? (
            <motion.aside
              key={selectedAsset.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="min-h-0"
              aria-label={`${selectedAsset.name} inspector`}
            >
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-fabric-2">
                <div className="border-b border-border bg-secondary px-l py-l">
                  <div className="flex items-start gap-m">
                    <KindGlyph kind={selectedAsset.kind} />
                    <div className="min-w-0 flex-1">
                      <SectionLabel>
                        {KIND_META[selectedAsset.kind].label}
                      </SectionLabel>
                      <h2 className="mt-xxs break-words text-500 font-bold leading-500">
                        {selectedAsset.name}
                      </h2>
                    </div>
                    {(selectedObject || selectedAsset.metadataRef) && (
                      <button
                        type="button"
                        onClick={() => setImpactOpen(true)}
                        className="inline-flex items-center gap-s rounded-lg border border-border bg-card px-m py-s text-200 font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <FileDown className="icon-size-100" aria-hidden="true" />
                        Impact
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelId("")}
                      aria-label="Clear selected asset"
                      className="rounded-lg border border-transparent p-s text-muted-foreground hover:border-border hover:bg-card hover:text-foreground"
                    >
                      <X className="icon-size-200" />
                    </button>
                  </div>
                </div>

                <div className="border-b border-border p-l">
                  <div className="mb-m flex items-center gap-s">
                    <Boxes className="icon-size-200 text-muted-foreground" />
                    <SectionLabel>Asset context</SectionLabel>
                  </div>
                  <div className="grid grid-cols-1 gap-s sm:grid-cols-2">
                    <MetadataCell
                      label="Asset kind"
                      value={KIND_META[selectedAsset.kind].label}
                    />
                    <MetadataCell
                      label="Object / data type"
                      value={selectedAsset.dataType ?? "Not applicable"}
                    />
                    <MetadataCell
                      label="Parent object"
                      value={selectedAsset.parentName ?? "Root object"}
                    />
                    <MetadataCell
                      label="Parent item"
                      value={selectedAsset.itemName}
                    />
                    <MetadataCell
                      label="Source"
                      value={selectedAsset.source ?? "Source not recorded"}
                    />
                    <MetadataCell
                      label="Source item"
                      value={
                        selectedAsset.sourceItemName ??
                        selectedAsset.sourceItemId ??
                        "Not recorded"
                      }
                    />
                    <MetadataCell
                      label="Visibility"
                      value={
                        isMetadataAssetKind(selectedAsset.kind)
                          ? "Not applicable"
                          : selectedAsset.isHidden == null
                            ? "Not collected"
                            : selectedAsset.isHidden
                              ? "Hidden"
                              : "Visible"
                      }
                    />
                  </div>

                  {selectedAsset.description && (
                    <p className="mt-s rounded-lg border border-border bg-secondary px-m py-s text-200 leading-300 text-muted-foreground">
                      {selectedAsset.description}
                    </p>
                  )}

                  {selectedAsset.expression && (
                    <div className="mt-s overflow-x-auto rounded-lg border border-border bg-muted p-m">
                      <div className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                        Expression
                      </div>
                      <code className="mt-xs block whitespace-pre-wrap font-mono text-200 text-foreground">
                        {selectedAsset.expression}
                      </code>
                    </div>
                  )}

                  {(selectedDependencies.upstream.length > 0 ||
                    selectedDependencies.downstream.length > 0) && (
                    <div className="mt-s grid gap-s sm:grid-cols-2">
                      {[
                        {
                          title: "Depends on",
                          values: selectedDependencies.upstream.map(
                            (dependency) => ({
                              object: dependency.to,
                              confidence: dependency.confidence,
                            }),
                          ),
                        },
                        {
                          title: "Used by",
                          values: selectedDependencies.downstream.map(
                            (dependency) => ({
                              object: dependency.from,
                              confidence: dependency.confidence,
                            }),
                          ),
                        },
                      ].map(({ title, values }) => (
                        <section
                          key={title}
                          className="rounded-lg border border-border bg-secondary/55 p-m"
                        >
                          <h3 className="text-200 font-semibold">{title}</h3>
                          <div className="mt-s space-y-xs">
                            {values.length === 0 ? (
                              <p className="text-200 text-muted-foreground">
                                None
                              </p>
                            ) : (
                              values.map(({ object, confidence }) => (
                                <div
                                  key={`${schemaObjectKey(object)}:${confidence}`}
                                  className="flex items-center justify-between gap-s rounded-md bg-card px-s py-xs"
                                >
                                  <span className="min-w-0 truncate text-200 font-medium">
                                    {itemById.get(object.itemId)?.displayName ??
                                      object.itemId}{" "}
                                    ·{" "}
                                    {object.tableName
                                      ? `${object.tableName}.${object.name}`
                                      : object.name}
                                  </span>
                                  <span
                                    className={cn(
                                      "shrink-0 rounded-full px-s py-xxs text-100 font-semibold",
                                      confidence === "verified"
                                        ? "bg-status-healthy/10 text-status-healthy"
                                        : "bg-status-warning/10 text-status-warning",
                                    )}
                                  >
                                    {confidence === "verified"
                                      ? "DAX"
                                      : "Inferred"}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}

                  {selectedMetadataImpact &&
                    (selectedMetadataImpact.upstream.length > 0 ||
                      selectedMetadataImpact.downstream.length > 0) && (
                      <div className="mt-s grid gap-s sm:grid-cols-2">
                        {[
                          {
                            title: "Verified sources",
                            values: selectedMetadataImpact.upstream,
                          },
                          {
                            title: "Verified consumers",
                            values: selectedMetadataImpact.downstream,
                          },
                        ].map(({ title, values }) => (
                          <section
                            key={title}
                            className="rounded-lg border border-border bg-secondary/55 p-m"
                          >
                            <h3 className="text-200 font-semibold">{title}</h3>
                            <div className="mt-s space-y-xs">
                              {values.map((object) => (
                                <div
                                  key={`${object.itemId}:${object.kind}:${object.id}`}
                                  className="rounded-md bg-card px-s py-xs"
                                >
                                  <div className="truncate text-200 font-medium">
                                    {object.name}
                                  </div>
                                  <div className="truncate text-100 text-muted-foreground">
                                    {metadataObjectKindLabel(object.kind)} ·{" "}
                                    {itemById.get(object.itemId)?.displayName ??
                                      object.itemId}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}

                  <div className="mt-s flex items-center gap-m rounded-lg border border-border bg-secondary px-m py-m">
                    {selectedItem && (
                      <TypeGlyph type={selectedItem.itemType} size={34} />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-300 font-semibold">
                        {selectedAsset.itemName}
                      </div>
                      <div className="text-200 text-muted-foreground">
                        {typeMeta(selectedAsset.itemType).label}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-l">
                  <div className="flex items-start gap-s">
                    <ShieldCheck className="icon-size-200 mt-xxs text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <SectionLabel>Effective access</SectionLabel>
                      <p className="mt-xs text-200 text-muted-foreground">
                        Workspace and item grants are additive. A direct share
                        never reduces inherited access.
                      </p>
                    </div>
                    <span className="rounded-md border border-border bg-secondary px-s py-xs font-numeric text-200 font-semibold text-muted-foreground">
                      {access.length}
                    </span>
                  </div>

                  <div className="mt-m space-y-s">
                    {access.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border bg-secondary/40 px-l py-xl text-center">
                        <Users className="icon-size-400 mx-auto text-muted-foreground" />
                        <div className="mt-s text-300 font-semibold">
                          No access records
                        </div>
                        <div className="mt-xs text-200 text-muted-foreground">
                          Sync the parent item to populate effective access.
                        </div>
                      </div>
                    )}
                    {access.map((grant) => {
                      const principal = principalByName.get(grant.name);
                      return (
                        <div
                          key={grant.name}
                          className="rounded-lg border border-border px-m py-m"
                        >
                          <div className="flex items-center gap-s">
                            <PrincipalAvatar
                              name={grant.name}
                              kind={principal?.kind ?? "user"}
                              size={30}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-xs">
                                <span className="truncate text-300 font-semibold">
                                  {grant.name}
                                </span>
                                {principal?.external && (
                                  <span className="rounded-md border border-status-warning/30 bg-status-warning/10 px-xs py-xxs text-100 font-semibold text-status-warning">
                                    External
                                  </span>
                                )}
                              </div>
                              <div className="mt-xxs text-200 text-muted-foreground">
                                {grant.roleName ??
                                  (grant.inherited
                                    ? "Workspace permission"
                                    : grant.mixed
                                      ? "Workspace and item permissions"
                                      : "Item permission")}
                              </div>
                            </div>
                            <AccessChip level={grant.level} />
                          </div>
                          <div className="mt-s flex items-center justify-between border-t border-border pt-s">
                            <span className="text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                              Access source
                            </span>
                            <span
                              className={cn(
                                "rounded-md border px-s py-xxs text-[length:var(--text-200)] font-semibold",
                                grant.inherited
                                  ? "border-lineage-upstream/30 bg-lineage-upstream/10 text-lineage-upstream"
                                  : grant.mixed
                                    ? "border-status-warning/30 bg-status-warning/10 text-status-warning"
                                    : "border-primary/30 bg-primary/10 text-primary",
                              )}
                            >
                              {grant.inherited
                                ? "Inherited · workspace"
                                : grant.mixed
                                  ? "Mixed · workspace + item"
                                  : "Direct · item share"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.aside>
          ) : (
            <motion.aside
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border bg-card px-xl py-xxxl"
            >
              <div className="text-center">
                <Boxes className="icon-size-600 mx-auto text-muted-foreground" />
                <h2 className="mt-m text-400 font-semibold">
                  Inspect an asset
                </h2>
                <p className="mt-xs text-300 text-muted-foreground">
                  Expand an item group, then select an object to review its
                  context, provenance and effective access.
                </p>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      {selectedAsset?.metadataRef ? (
        <MetadataObjectImpactDialog
          data={data}
          subject={selectedAsset.metadataRef}
          open={impactOpen}
          onClose={() => setImpactOpen(false)}
        />
      ) : selectedAsset && selectedObject ? (
        <ImpactReportDialog
          data={data}
          itemId={selectedAsset.itemFabricId}
          object={selectedObject}
          open={impactOpen}
          onClose={() => setImpactOpen(false)}
        />
      ) : null}
    </div>
  );
}
