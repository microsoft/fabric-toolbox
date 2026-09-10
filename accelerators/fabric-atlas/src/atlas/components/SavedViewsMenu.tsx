import {
  Bookmark,
  ChevronDown,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  SavedView,
  SavedViewFilters,
  SavedViewSection,
} from "../saved-views";
import { cn } from "../ui";

export function SavedViewsMenu({
  views,
  loading,
  error,
  activeSection,
  currentFilters,
  onCreate,
  onApply,
  onDelete,
}: {
  views: SavedView[];
  loading: boolean;
  error?: string;
  activeSection: SavedViewSection;
  currentFilters: SavedViewFilters;
  onCreate: (input: {
    name: string;
    section: SavedViewSection;
    filters: SavedViewFilters;
  }) => Promise<void>;
  onApply: (view: SavedView) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [operationError, setOperationError] = useState<string>();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setOperationError(undefined);
    try {
      await onCreate({
        name,
        section: activeSection,
        filters: currentFilters,
      });
      setName("");
      setCreating(false);
    } catch (error) {
      setOperationError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-[34px] items-center gap-s rounded-lg border border-border bg-card px-m text-200 font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Bookmark className="icon-size-100" aria-hidden="true" />
        <span className="hidden sm:inline">Saved views</span>
        {views.length > 0 && (
          <span className="rounded-full bg-primary/10 px-xs font-numeric text-100 text-brand-foreground">
            {views.length}
          </span>
        )}
        <ChevronDown className="icon-size-100" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-s w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-fabric-8"
        >
          <div className="flex items-center justify-between gap-m border-b border-border px-m py-s">
            <div>
              <div className="text-300 font-semibold">Saved views</div>
              <div className="text-200 text-muted-foreground">
                Personal shortcuts for this workspace
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close saved views"
              className="rounded-md p-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="icon-size-100" />
            </button>
          </div>

          {(operationError || error) && (
            <div className="border-b border-destructive/30 bg-destructive/10 px-m py-s text-200 text-destructive">
              {operationError ?? error}
            </div>
          )}

          {creating ? (
            <div className="border-b border-border bg-secondary p-m">
              <label
                htmlFor="saved-view-name"
                className="text-200 font-semibold"
              >
                View name
              </label>
              <div className="mt-s flex gap-s">
                <input
                  id="saved-view-name"
                  autoFocus
                  value={name}
                  maxLength={100}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void save();
                    if (event.key === "Escape") setCreating(false);
                  }}
                  placeholder="Example: External access"
                  className="min-w-0 flex-1 rounded-lg border border-input bg-card px-m py-s text-300"
                />
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!name.trim() || saving}
                  className="rounded-lg bg-primary px-m py-s text-200 font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="icon-size-100 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-s border-b border-border px-m py-s text-left text-200 font-semibold text-brand-foreground hover:bg-primary/10"
            >
              <Plus className="icon-size-100" aria-hidden="true" />
              Save current filters
            </button>
          )}

          <div className="max-h-80 overflow-y-auto p-s">
            {loading ? (
              <div className="flex items-center justify-center gap-s px-m py-xl text-200 text-muted-foreground">
                <Loader2 className="icon-size-100 animate-spin" />
                Loading saved views
              </div>
            ) : views.length === 0 ? (
              <div className="px-m py-xl text-center text-200 text-muted-foreground">
                Save a filtered view to reopen it from any page.
              </div>
            ) : (
              views.map((view) => (
                <div
                  key={view.id}
                  className={cn(
                    "group flex items-center gap-s rounded-lg",
                    view.section === activeSection && "bg-primary/5",
                  )}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onApply(view);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 px-m py-s text-left hover:bg-accent"
                  >
                    <span className="block truncate text-300 font-semibold">
                      {view.name}
                    </span>
                    <span className="block text-100 uppercase tracking-wide text-muted-foreground">
                      {view.section}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOperationError(undefined);
                      void onDelete(view.id).catch((deleteError) => {
                        setOperationError(
                          deleteError instanceof Error
                            ? deleteError.message
                            : String(deleteError),
                        );
                      });
                    }}
                    aria-label={`Delete ${view.name}`}
                    className="mr-s rounded-md p-s text-muted-foreground opacity-70 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="icon-size-100" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
