import {
  Activity,
  Boxes,
  Building2,
  FileText,
  FolderTree,
  MessageSquare,
  Search,
  Settings2,
  Sigma,
  Table2,
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
  searchIndex,
  type SearchIndexEntry,
  type SearchResult,
  type SearchTargetKind,
} from "../search";
import { cn } from "../ui";

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

export function CommandPalette({
  index,
  open,
  onClose,
  onSelect,
}: {
  index: SearchIndexEntry[];
  open: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
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

  const resolvedActiveIndex = Math.min(
    activeIndex,
    Math.max(results.length - 1, 0),
  );

  const close = () => {
    setQuery("");
    setActiveIndex(0);
    onClose();
  };

  const choose = (result: SearchResult) => {
    onSelect(result);
    close();
  };

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
                  Math.min(value + 1, Math.max(results.length - 1, 0)),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((value) => Math.max(value - 1, 0));
              } else if (
                !searchPending &&
                event.key === "Enter" &&
                results[resolvedActiveIndex]
              ) {
                event.preventDefault();
                choose(results[resolvedActiveIndex]);
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
                aria-expanded={Boolean(debouncedQuery.trim() && results.length)}
                aria-controls="atlas-global-search-results"
                aria-activedescendant={
                  results[resolvedActiveIndex]
                    ? `atlas-search-result-${resolvedActiveIndex}`
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

            <div
              id="atlas-global-search-results"
              role="listbox"
              aria-label="Search results"
              className="min-h-0 flex-1 overflow-y-auto p-s"
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
                results.map((result, indexValue) => {
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
                      className={cn(
                        "flex w-full items-center gap-m rounded-xl px-m py-s text-left transition-colors",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground hover:bg-accent",
                      )}
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
                          "shrink-0 rounded-md border px-s py-xxs text-100 font-semibold uppercase tracking-wide",
                          active
                            ? "border-primary-foreground/25 text-primary-foreground/80"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {KIND_LABEL[result.kind]}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-m border-t border-border bg-secondary px-l py-s text-200 text-muted-foreground">
              <span>{results.length ? `${results.length} results` : "Workspace index"}</span>
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
