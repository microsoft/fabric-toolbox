import {
  Activity,
  Boxes,
  Building2,
  ExternalLink,
  FileText,
  FolderTree,
  MessageSquare,
  Search,
  Settings2,
  Sigma,
  Table2,
  Telescope,
  UserRound,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import {
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  applyCatalogSearchEnvelope,
  catalogEntryTypeLabel,
  catalogSearchCoverageText,
  catalogSnapshotLookup,
  describeCatalogSearch,
  failedCatalogSearchEnvelope,
  idleCatalogSearchView,
  isCatalogSearchQuery,
  normalizeCatalogQuery,
  resolveCatalogEntry,
  type CatalogSearchAvailability,
  type CatalogSearchEntry,
  type CatalogSearchEnvelope,
  type CatalogSearchRequest,
  type CatalogSearchView,
} from "../catalog-search";
import {
  searchIndex,
  type SearchIndexEntry,
  type SearchResult,
  type SearchTargetKind,
} from "../search";
import { cn } from "../ui";
import { PreviewApiNotice } from "./PreviewApiNotice";

const KIND_ICON: Record<SearchTargetKind, ComponentType<{ className?: string }>> =
  {
    workspace: Building2,
    item: FolderTree,
    table: Table2,
    view: Table2,
    column: Boxes,
    measure: Sigma,
    principal: UserRound,
    comment: MessageSquare,
    config: Settings2,
    job: Activity,
  };

const KIND_LABEL: Record<SearchTargetKind, string> = {
  workspace: "Workspace",
  item: "Item",
  table: "Table",
  view: "View",
  column: "Column",
  measure: "Measure",
  principal: "Principal",
  comment: "Note",
  config: "Configuration",
  job: "Job",
};

/** Optional OneLake Catalog Search (Preview) source; omitted when the flag is off. */
export interface CommandPaletteCatalogSearch {
  availability: Exclude<CatalogSearchAvailability, "disabled">;
  search: (request: CatalogSearchRequest) => Promise<CatalogSearchEnvelope>;
  /** Opens an entry outside the snapshot; defaults to a new browser tab. */
  openExternal?: (url: string) => void;
}

function openInNewTab(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

const optionClass = (active: boolean) =>
  cn(
    "flex w-full items-center gap-m rounded-xl px-m py-s text-left transition-colors",
    active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
  );

const groupHeadingClass =
  "flex items-center gap-xs px-m pb-xs pt-s text-100 font-semibold uppercase tracking-wide text-muted-foreground";

export function CommandPalette({
  index,
  open,
  onClose,
  onSelect,
  catalogSearch,
}: {
  index: SearchIndexEntry[];
  open: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  catalogSearch?: CommandPaletteCatalogSearch;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [catalogView, setCatalogView] = useState<CatalogSearchView>(() =>
    idleCatalogSearchView(),
  );
  const catalogRequestRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement>(null);
  const debouncedQuery = useDebouncedValue(query);
  const searchPending = query !== debouncedQuery;
  const results = useMemo(
    () =>
      searchPending
        ? []
        : searchIndex(index, debouncedQuery, { limit: 14 }),
    [debouncedQuery, index, searchPending],
  );
  const snapshotLookup = useMemo(() => catalogSnapshotLookup(index), [index]);
  const catalogQuery = normalizeCatalogQuery(debouncedQuery);
  const catalogVisible = !!catalogSearch && !!catalogQuery && !searchPending;
  // Entries belong to the query that produced them and disappear when it changes.
  const activeCatalog =
    catalogVisible && catalogView.query === catalogQuery
      ? catalogView
      : idleCatalogSearchView(catalogQuery);
  const catalogEntries = activeCatalog.entries;
  const catalogResolutions = catalogEntries.map((entry) =>
    resolveCatalogEntry(entry, snapshotLookup),
  );
  const optionCount = results.length + catalogEntries.length;

  const resolvedActiveIndex = Math.min(
    activeIndex,
    Math.max(optionCount - 1, 0),
  );

  const close = () => {
    catalogRequestRef.current += 1;
    setCatalogView(idleCatalogSearchView());
    setQuery("");
    setActiveIndex(0);
    onClose();
  };

  const choose = (result: SearchResult) => {
    onSelect(result);
    close();
  };

  const chooseCatalog = (entryIndex: number) => {
    const resolution = catalogResolutions[entryIndex];
    if (!resolution) return;
    if (resolution.kind === "snapshot") {
      choose(resolution.result);
    } else {
      (catalogSearch?.openExternal ?? openInNewTab)(resolution.url);
    }
  };

  const chooseOption = (optionIndex: number) => {
    if (optionIndex < results.length) choose(results[optionIndex]);
    else chooseCatalog(optionIndex - results.length);
  };

  const runCatalogSearch = async (append: boolean) => {
    if (!catalogSearch || catalogSearch.availability !== "available") return;
    const searchText = catalogQuery;
    const continuationToken = append ? activeCatalog.continuationToken : null;
    if (append ? !continuationToken : !isCatalogSearchQuery(searchText)) return;
    const previous = append ? activeCatalog : idleCatalogSearchView(searchText);
    const requestId = (catalogRequestRef.current += 1);
    setCatalogView({ ...previous, phase: "loading" });
    let envelope: CatalogSearchEnvelope;
    try {
      envelope = await catalogSearch.search(
        continuationToken
          ? { kind: "continue", continuationToken }
          : { kind: "search", search: searchText },
      );
    } catch {
      envelope = failedCatalogSearchEnvelope(
        "unavailable",
        new Date().toISOString(),
      );
    }
    if (requestId !== catalogRequestRef.current) return;
    setCatalogView(applyCatalogSearchEnvelope(previous, envelope, append));
  };

  const catalogDescription = catalogSearch
    ? describeCatalogSearch({
        availability: catalogSearch.availability,
        view: activeCatalog,
        validQuery: isCatalogSearchQuery(catalogQuery),
        inSnapshot: catalogResolutions.filter(
          (resolution) => resolution.kind === "snapshot",
        ).length,
      })
    : undefined;
  let catalogAction:
    | { label: string; append: boolean; disabled?: boolean; busy?: boolean }
    | undefined;
  if (catalogSearch?.availability === "available") {
    if (activeCatalog.phase === "idle") {
      catalogAction = {
        label: "Search catalog",
        append: false,
        disabled: !isCatalogSearchQuery(catalogQuery),
      };
    } else if (activeCatalog.phase === "loading") {
      // aria-disabled keeps keyboard focus on the action while the search runs.
      catalogAction = { label: "Searching…", append: false, busy: true };
    } else if (activeCatalog.continuationToken) {
      catalogAction = {
        label: activeCatalog.failureCode ? "Retry" : "Load more",
        append: true,
      };
    } else if (activeCatalog.failureCode && activeCatalog.retryable) {
      catalogAction = { label: "Retry", append: false };
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      {open && (
        <Dialog.Portal>
          <Dialog.Overlay asChild>
            <motion.div
              className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            />
          </Dialog.Overlay>
          <div className="pointer-events-none fixed inset-0 z-[101] flex items-start justify-center p-m pt-[8vh] sm:p-xl sm:pt-[12vh]">
            <Dialog.Content
              asChild
              aria-describedby={undefined}
              onOpenAutoFocus={(event) => {
                returnFocusRef.current =
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
                event.preventDefault();
                inputRef.current?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                returnFocusRef.current?.focus();
                returnFocusRef.current = null;
              }}
            >
          <motion.section
            className="pointer-events-auto flex max-h-[78vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-fabric-16"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.16 }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((value) =>
                  Math.min(value + 1, Math.max(optionCount - 1, 0)),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((value) => Math.max(value - 1, 0));
              } else if (
                !searchPending &&
                event.key === "Enter" &&
                // Buttons such as the catalog action keep their own Enter behavior.
                event.target === inputRef.current &&
                resolvedActiveIndex < optionCount
              ) {
                event.preventDefault();
                chooseOption(resolvedActiveIndex);
              }
            }}
          >
            <Dialog.Title className="sr-only">
              Search Fabric Atlas
            </Dialog.Title>
            <div className="flex items-center gap-m border-b border-border px-l py-m">
              <Search
                className="icon-size-300 shrink-0 text-brand-foreground"
                aria-hidden="true"
              />
              <label htmlFor="atlas-global-search" className="sr-only">
                Search workspace metadata
              </label>
              <input
                ref={inputRef}
                id="atlas-global-search"
                role="combobox"
                aria-expanded={Boolean(debouncedQuery.trim() && optionCount)}
                aria-controls="atlas-global-search-results"
                aria-activedescendant={
                  resolvedActiveIndex < results.length
                    ? `atlas-search-result-${resolvedActiveIndex}`
                    : resolvedActiveIndex < optionCount
                      ? `atlas-catalog-result-${resolvedActiveIndex - results.length}`
                      : undefined
                }
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Search items, tables, measures, people, jobs and notes"
                className="min-w-0 flex-1 border-0 bg-transparent text-400 text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="rounded-lg p-s text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="icon-size-200" />
                </button>
              )}
              <kbd className="hidden rounded-md border border-border bg-muted px-s py-xs font-mono text-100 text-muted-foreground sm:inline">
                Esc
              </kbd>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close search"
                  className="rounded-lg p-s text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="icon-size-200" />
                </button>
              </Dialog.Close>
            </div>

            {catalogVisible && catalogSearch && catalogDescription && (
              <section
                aria-labelledby="atlas-catalog-search-title"
                className="flex flex-wrap items-center gap-x-m gap-y-s border-b border-border bg-secondary px-l py-s"
              >
                <span className="flex icon-size-500 shrink-0 items-center justify-center rounded-lg bg-lineage-upstream/10 text-lineage-upstream">
                  <Telescope className="icon-size-200" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <h2
                    id="atlas-catalog-search-title"
                    className="flex flex-wrap items-center gap-xs text-200 font-semibold text-foreground"
                  >
                    OneLake catalog
                    <span className="rounded-md border border-lineage-upstream/30 bg-lineage-upstream/10 px-xs text-100 font-semibold uppercase tracking-wide text-lineage-upstream">
                      Preview
                    </span>
                  </h2>
                  <p
                    role="status"
                    aria-live="polite"
                    aria-label="OneLake catalog status"
                    className={cn(
                      "text-200 leading-200",
                      catalogDescription.tone === "warning"
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {catalogDescription.title && (
                      <strong className="font-semibold">
                        {catalogDescription.title}.{" "}
                      </strong>
                    )}
                    {catalogDescription.detail}
                  </p>
                </div>
                {catalogAction && (
                  <button
                    type="button"
                    disabled={catalogAction.disabled}
                    aria-disabled={catalogAction.busy || undefined}
                    onClick={() => {
                      if (!catalogAction.busy) void runCatalogSearch(catalogAction.append);
                    }}
                    className="inline-flex min-h-[var(--atlas-touch-target)] shrink-0 items-center justify-center gap-s rounded-md border border-input bg-card px-m text-200 font-semibold text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-progress aria-disabled:opacity-60 sm:min-h-[var(--atlas-control-height)]"
                  >
                    <Telescope className="icon-size-200" aria-hidden="true" />
                    {catalogAction.label}
                  </button>
                )}
              </section>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-s">
            <div
              id="atlas-global-search-results"
              role="listbox"
              aria-label="Search results"
            >
              {!debouncedQuery.trim() ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-xl py-xxxl text-center">
                  <span className="flex icon-size-700 items-center justify-center rounded-xl bg-primary/10 text-brand-foreground">
                    <Search className="icon-size-400" aria-hidden="true" />
                  </span>
                  <h2 className="mt-l text-400 font-semibold">
                    Search the whole workspace
                  </h2>
                  <p className="atlas-search-empty-copy mt-s text-300 leading-300 text-muted-foreground">
                    Find Fabric items, schema objects, access principals, jobs,
                    configuration and team notes from one place.
                  </p>
                </div>
              ) : searchPending ? (
                <div
                  role="status"
                  className="flex min-h-48 items-center justify-center px-xl py-xxxl text-300 text-muted-foreground"
                >
                  Searching workspace metadata…
                </div>
              ) : results.length === 0 ? (
                <div className="flex min-h-48 flex-col items-center justify-center px-xl py-xxxl text-center">
                  <FileText
                    className="icon-size-500 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h2 className="mt-m text-400 font-semibold">
                    No matching metadata
                  </h2>
                  <p className="mt-xs text-300 text-muted-foreground">
                    Try a shorter name, item type, owner, table or principal.
                  </p>
                </div>
              ) : (
                <div
                  role={catalogEntries.length ? "group" : undefined}
                  aria-labelledby={
                    catalogEntries.length ? "atlas-snapshot-results-heading" : undefined
                  }
                >
                {catalogEntries.length > 0 && (
                  <div
                    id="atlas-snapshot-results-heading"
                    aria-hidden="true"
                    className={groupHeadingClass}
                  >
                    <FolderTree className="icon-size-100" aria-hidden="true" />
                    Atlas snapshot
                  </div>
                )}
                {results.map((result, indexValue) => {
                  const Icon = KIND_ICON[result.kind];
                  const active = resolvedActiveIndex === indexValue;
                  return (
                    <button
                      id={`atlas-search-result-${indexValue}`}
                      key={result.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(indexValue)}
                      onClick={() => choose(result)}
                      className={optionClass(active)}
                    >
                      <span
                        className={cn(
                          "flex icon-size-600 shrink-0 items-center justify-center rounded-xl",
                          active
                            ? "bg-primary-foreground/15"
                            : "bg-primary/10 text-brand-foreground",
                        )}
                      >
                        <Icon className="icon-size-200" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-300 font-semibold">
                          {result.title}
                        </span>
                        <span
                          className={cn(
                            "block truncate text-200",
                            active
                              ? "text-primary-foreground/75"
                              : "text-muted-foreground",
                          )}
                        >
                          {result.subtitle ?? KIND_LABEL[result.kind]}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-md border px-s py-xxs text-200 font-semibold uppercase tracking-wide",
                          active
                            ? "border-primary-foreground/25 text-primary-foreground/80"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {KIND_LABEL[result.kind]}
                      </span>
                    </button>
                  );
                })}
                </div>
              )}
              {catalogEntries.length > 0 && (
                <div
                  role="group"
                  aria-labelledby="atlas-catalog-results-heading"
                  className="mt-s border-t border-border pt-xs"
                >
                  <div
                    id="atlas-catalog-results-heading"
                    aria-hidden="true"
                    className={groupHeadingClass}
                  >
                    <Telescope className="icon-size-100" aria-hidden="true" />
                    OneLake catalog · Preview
                  </div>
                  {catalogEntries.map((entry: CatalogSearchEntry, entryIndex) => {
                    const optionIndex = results.length + entryIndex;
                    const active = resolvedActiveIndex === optionIndex;
                    const inSnapshot =
                      catalogResolutions[entryIndex]?.kind === "snapshot";
                    const Icon =
                      entry.catalogEntryType === "Workspace" ? Building2 : Telescope;
                    const location =
                      entry.catalogEntryType !== "Workspace" &&
                      entry.workspaceDisplayName
                        ? ` · ${entry.workspaceDisplayName}`
                        : "";
                    return (
                      <button
                        id={`atlas-catalog-result-${entryIndex}`}
                        key={entry.key}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setActiveIndex(optionIndex)}
                        onClick={() => chooseCatalog(entryIndex)}
                        className={optionClass(active)}
                      >
                        <span
                          className={cn(
                            "flex icon-size-600 shrink-0 items-center justify-center rounded-xl",
                            active
                              ? "bg-primary-foreground/15"
                              : "bg-lineage-upstream/10 text-lineage-upstream",
                          )}
                        >
                          <Icon className="icon-size-200" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-300 font-semibold">
                            {entry.displayName}
                          </span>
                          <span
                            className={cn(
                              "block truncate text-200",
                              active
                                ? "text-primary-foreground/75"
                                : "text-muted-foreground",
                            )}
                          >
                            {catalogEntryTypeLabel(entry.type)}
                            {location}
                          </span>
                          <span className="sr-only">
                            {inSnapshot
                              ? ", OneLake catalog result in the Atlas snapshot"
                              : ", OneLake catalog result outside the snapshot, opens the workspace in Fabric"}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "inline-flex shrink-0 items-center gap-xxs rounded-md border px-s py-xxs text-200 font-semibold uppercase tracking-wide",
                            active
                              ? "border-primary-foreground/25 text-primary-foreground/80"
                              : "border-lineage-upstream/30 text-lineage-upstream",
                          )}
                        >
                          {inSnapshot ? "In snapshot" : "Catalog"}
                          {!inSnapshot && (
                            <ExternalLink className="icon-size-100" aria-hidden="true" />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {catalogVisible &&
              catalogSearch?.availability === "available" &&
              activeCatalog.phase !== "idle" && (
                <div className="mt-s grid gap-s px-xs pb-xs">
                  {activeCatalog.phase === "ready" && (
                    <p className="text-200 leading-200 text-muted-foreground">
                      {catalogSearchCoverageText(activeCatalog)}
                    </p>
                  )}
                  <PreviewApiNotice featureIds={["catalog-search"]} />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-m border-t border-border bg-secondary px-l py-s text-200 text-muted-foreground">
              <span>
                {catalogEntries.length
                  ? `${results.length} snapshot · ${catalogEntries.length} catalog`
                  : results.length
                    ? `${results.length} results`
                    : "Workspace index"}
              </span>
              <span className="hidden items-center gap-s sm:flex">
                <kbd className="rounded border border-border bg-card px-xs">↑↓</kbd>
                Navigate
                <kbd className="rounded border border-border bg-card px-xs">Enter</kbd>
                Open
              </span>
            </div>
          </motion.section>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
