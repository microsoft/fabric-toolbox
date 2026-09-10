import { useEffect, useId, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileSearch,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useAtlas } from "../store";
import type { AtlasFocusRequest } from "../navigation";
import { Card, EndorsementChip, HealthChip, SectionLabel, TypeGlyph, cn } from "../ui";
import { typeMeta, type ConfigKV, type Item } from "../model";

type ItemFilter = "all" | "configured" | "empty";

export function ConfigView({
  embedded = false,
  focus,
  onSelectedItemChange,
}: {
  embedded?: boolean;
  focus?: AtlasFocusRequest;
  onSelectedItemChange?: (itemId: string) => void;
} = {}) {
  const { data } = useAtlas();
  const { items, config } = data;
  const sectionIdPrefix = useId();

  const configByItem = useMemo(() => {
    const map = new Map<string, ConfigKV[]>();
    config.forEach((entry) => {
      const itemConfig = map.get(entry.itemFabricId) ?? [];
      itemConfig.push(entry);
      map.set(entry.itemFabricId, itemConfig);
    });
    return map;
  }, [config]);

  const firstWithConfig = items.find((item) => configByItem.has(item.fabricId)) ?? items[0];
  const [selectedId, setSelectedId] = useState<string>(
    focus?.itemId ?? firstWithConfig?.fabricId ?? "",
  );

  useEffect(() => {
    if (selectedId) onSelectedItemChange?.(selectedId);
  }, [onSelectedItemChange, selectedId]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [itemSearch, setItemSearch] = useState("");
  const [itemFilter, setItemFilter] = useState<ItemFilter>("all");

  const selected: Item | undefined = items.find((item) => item.fabricId === selectedId);
  const entries = useMemo(
    () => configByItem.get(selectedId) ?? [],
    [configByItem, selectedId],
  );

  const sections = useMemo(() => {
    const map = new Map<string, ConfigKV[]>();
    entries.forEach((entry) => {
      const sectionEntries = map.get(entry.section) ?? [];
      sectionEntries.push(entry);
      map.set(entry.section, sectionEntries);
    });
    return [...map.entries()];
  }, [entries]);

  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLocaleLowerCase();
    return items.filter((item) => {
      const count = configByItem.get(item.fabricId)?.length ?? 0;
      const matchesFilter =
        itemFilter === "all" ||
        (itemFilter === "configured" && count > 0) ||
        (itemFilter === "empty" && count === 0);
      const matchesSearch =
        !query ||
        item.displayName.toLocaleLowerCase().includes(query) ||
        typeMeta(item.itemType).label.toLocaleLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [configByItem, itemFilter, itemSearch, items]);

  const toggleSection = (section: string) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const allExpanded =
    sections.length > 0 && sections.every(([section]) => expandedSections.has(section));

  const toggleAllSections = () => {
    setExpandedSections(
      allExpanded ? new Set() : new Set(sections.map(([section]) => section)),
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col",
        embedded ? "gap-l" : "atlas-content-frame gap-xl p-xl lg:p-xxl",
      )}
    >
      {!embedded && <header className="border-l border-primary pl-l">
        <SectionLabel>Inventory / configuration</SectionLabel>
        <div className="mt-s flex flex-col gap-s lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-heading text-600 leading-600 font-bold">
              Configuration explorer
            </h1>
            <p className="mt-xs text-300 leading-300 text-muted-foreground">
              Inspect settings, schedules, schema metadata and bindings without losing
              item context.
            </p>
          </div>
          <div className="flex items-center gap-s text-200 leading-200 text-muted-foreground">
            <SlidersHorizontal className="icon-size-200" aria-hidden="true" />
            {config.length} values across {configByItem.size} configured items
          </div>
        </div>
      </header>}

      <div className="grid items-start gap-l lg:grid-cols-3">
        <aside aria-label="Configuration items" className="lg:sticky lg:top-l">
          <Card className="overflow-hidden">
            <div className="atlas-toolbar border-b border-border p-l">
              <div className="flex items-center justify-between gap-s">
                <div>
                  <h2 className="text-400 leading-400 font-semibold">Items</h2>
                  <p className="mt-xs text-200 leading-200 text-muted-foreground">
                    {filteredItems.length} of {items.length} visible
                  </p>
                </div>
                <span className="rounded-full bg-muted px-s py-xs font-numeric text-200 font-semibold text-muted-foreground">
                  {config.length}
                </span>
              </div>

              <label className="mt-m block">
                <span className="sr-only">Search configuration items</span>
                <span className="flex items-center gap-s rounded-lg border border-input bg-background px-m py-s focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                  <Search
                    className="icon-size-200 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={itemSearch}
                    onChange={(event) => setItemSearch(event.target.value)}
                    placeholder="Search items or types"
                    className="min-w-0 flex-1 bg-transparent text-300 leading-300 text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  {itemSearch && (
                    <button
                      type="button"
                      onClick={() => setItemSearch("")}
                      aria-label="Clear item search"
                      className="rounded-md p-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="icon-size-100" aria-hidden="true" />
                    </button>
                  )}
                </span>
              </label>

              <label className="mt-s block">
                <span className="sr-only">Filter configuration items</span>
                <select
                  value={itemFilter}
                  onChange={(event) => setItemFilter(event.target.value as ItemFilter)}
                  className="w-full rounded-lg border border-input bg-background px-m py-s text-300 leading-300 text-foreground"
                >
                  <option value="all">All items</option>
                  <option value="configured">With configuration</option>
                  <option value="empty">Without configuration</option>
                </select>
              </label>
            </div>

            <div className="divide-y divide-border/60">
              {filteredItems.map((item) => {
                const count = configByItem.get(item.fabricId)?.length ?? 0;
                const isSelected = selectedId === item.fabricId;
                return (
                  <button
                    key={item.fabricId}
                    type="button"
                    onClick={() => {
                      setSelectedId(item.fabricId);
                      setExpandedSections(new Set());
                    }}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      "atlas-row flex w-full items-center gap-m border-l px-l text-left transition-colors",
                      isSelected
                        ? "border-l-primary bg-accent text-accent-foreground"
                        : "border-l-transparent hover:bg-accent/60",
                    )}
                  >
                    <TypeGlyph type={item.itemType} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-300 leading-300 font-semibold">
                        {item.displayName}
                      </span>
                      <span className="mt-xs block truncate text-200 leading-200 text-muted-foreground">
                        {typeMeta(item.itemType).label}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-s py-xs font-numeric text-[length:var(--text-200)] font-semibold",
                        count
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                      aria-label={`${count} configuration values`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}

              {filteredItems.length === 0 && (
                <div className="flex flex-col items-center px-l py-xxl text-center">
                  <FileSearch
                    className="icon-size-500 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="mt-m text-300 leading-300 font-semibold">
                    No matching items
                  </p>
                  <p className="mt-xs text-200 leading-200 text-muted-foreground">
                    Adjust the search or configuration filter.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </aside>

        <section
          aria-label="Selected item configuration"
          className="min-w-0 lg:col-span-2"
        >
          <Card className="overflow-hidden">
            {selected ? (
              <>
                <div className="border-b border-border p-l">
                  <div className="flex flex-col gap-m sm:flex-row sm:items-start">
                    <TypeGlyph type={selected.itemType} />
                    <div className="min-w-0 flex-1">
                      <SectionLabel>Selected item</SectionLabel>
                      <h2 className="mt-xs break-words text-500 leading-500 font-bold">
                        {selected.displayName}
                      </h2>
                      <p className="mt-xs text-300 leading-300 text-muted-foreground">
                        {typeMeta(selected.itemType).label}
                        {selected.ownerName ? ` · Documented owner: ${selected.ownerName}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-s">
                      <HealthChip health={selected.health} />
                      <EndorsementChip
                        endorsement={
                          selected.endorsementRaw ?? selected.endorsement
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-l flex flex-wrap items-center justify-between gap-s border-t border-border/60 pt-m">
                    <div className="text-200 leading-200 text-muted-foreground">
                      <span className="font-numeric font-semibold text-foreground">
                        {entries.length}
                      </span>{" "}
                      values in{" "}
                      <span className="font-numeric font-semibold text-foreground">
                        {sections.length}
                      </span>{" "}
                      sections
                    </div>
                    {sections.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAllSections}
                        className="inline-flex items-center gap-s rounded-lg border border-border bg-secondary px-m py-s text-200 font-semibold text-secondary-foreground transition-colors hover:bg-accent"
                      >
                        {allExpanded ? (
                          <ChevronsDownUp className="icon-size-200" aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown className="icon-size-200" aria-hidden="true" />
                        )}
                        {allExpanded ? "Collapse all" : "Expand all"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-l">
                  {sections.length === 0 ? (
                    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-xl py-xxxl text-center">
                      <FileSearch
                        className="icon-size-500 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <h3 className="mt-l text-400 leading-400 font-semibold">
                        No retrievable configuration
                      </h3>
                      <p className="mt-s text-300 leading-300 text-muted-foreground">
                        Synchronize the workspace first. If it is already synchronized,
                        this item type may be restricted or not exposed by the Fabric APIs.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-s">
                      {sections.map(([section, values], index) => {
                        const isOpen = expandedSections.has(section);
                        const regionId = `${sectionIdPrefix}-${index}`;
                        return (
                          <section
                            key={section}
                            className="overflow-hidden rounded-xl border border-border"
                          >
                            <button
                              type="button"
                              onClick={() => toggleSection(section)}
                              aria-expanded={isOpen}
                              aria-controls={regionId}
                              className="atlas-row flex w-full items-center gap-s bg-secondary px-l text-left transition-colors hover:bg-accent"
                            >
                              {isOpen ? (
                                <ChevronDown
                                  className="icon-size-200 shrink-0 text-primary"
                                  aria-hidden="true"
                                />
                              ) : (
                                <ChevronRight
                                  className="icon-size-200 shrink-0 text-muted-foreground"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="min-w-0 flex-1 text-300 leading-300 font-semibold">
                                {section}
                              </span>
                              <span className="rounded-full bg-muted px-s py-xs font-numeric text-200 font-semibold text-muted-foreground">
                                {values.length}
                              </span>
                            </button>

                            {isOpen && (
                              <dl id={regionId} className="divide-y divide-border/60">
                                {values.map((entry, entryIndex) => (
                                  <div
                                    key={`${entry.label}-${entryIndex}`}
                                    className="atlas-row grid gap-s px-l md:grid-cols-3"
                                  >
                                    <dt className="text-300 leading-300 font-semibold text-muted-foreground">
                                      {entry.label}
                                    </dt>
                                    <dd className="break-all font-monospace text-300 leading-300 text-foreground md:col-span-2">
                                      {entry.value || "—"}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center px-xl py-xxxl text-center">
                <FileSearch
                  className="icon-size-500 text-muted-foreground"
                  aria-hidden="true"
                />
                <h2 className="mt-l text-400 leading-400 font-semibold">
                  No item selected
                </h2>
                <p className="mt-s text-300 leading-300 text-muted-foreground">
                  Choose an item from the inventory to inspect its configuration.
                </p>
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
