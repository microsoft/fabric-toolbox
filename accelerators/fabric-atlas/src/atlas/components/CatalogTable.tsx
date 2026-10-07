import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import {
  groupCatalogItems,
  sortCatalogItems,
  type CatalogSortDirection,
  type CatalogSortKey,
} from "../catalog-table";
import { relativeTime, typeMeta, type Item, type ItemType } from "../model";
import { HealthChip, TypeGlyph, cn } from "../ui";

const COLUMNS: Array<{ key: CatalogSortKey; label: string }> = [
  { key: "name", label: "Item" },
  { key: "health", label: "Health" },
  { key: "owner", label: "Documented owner" },
  { key: "refresh", label: "Last refresh" },
];

export function CatalogTable({
  items,
  expanded,
  searching,
  selectedId,
  onToggle,
  onSelect,
}: {
  items: Item[];
  expanded: ReadonlySet<string>;
  searching: boolean;
  selectedId: string | null;
  onToggle: (type: ItemType) => void;
  onSelect: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<CatalogSortKey>("name");
  const [direction, setDirection] = useState<CatalogSortDirection>("asc");
  const groups = useMemo(
    () => groupCatalogItems(sortCatalogItems(items, sortKey, direction)),
    [items, sortKey, direction],
  );
  const sort = (key: CatalogSortKey) => {
    setDirection((previous) =>
      key === sortKey ? (previous === "asc" ? "desc" : "asc") : key === "refresh" ? "desc" : "asc",
    );
    setSortKey(key);
  };

  return (
    <div role="region" aria-label="Catalog table" tabIndex={0} className="max-w-full overflow-auto rounded-xl border border-border bg-card">
      <table className="atlas-catalog-table">
        <caption className="sr-only">
          Catalog items grouped by type. Sorting applies within each group.
        </caption>
        <thead>
          <tr>
            {COLUMNS.map(({ key, label }) => (
              <th key={key} scope="col" aria-sort={sortKey === key ? (direction === "asc" ? "ascending" : "descending") : "none"}>
                <button
                  type="button"
                  onClick={() => sort(key)}
                  aria-label={`Sort by ${label.toLowerCase()}`}
                  className="atlas-control inline-flex items-center gap-xs rounded-md text-left hover:text-brand-foreground"
                >
                  {label}
                  {sortKey === key && (
                    direction === "asc"
                      ? <ArrowUp className="icon-size-100" aria-hidden="true" />
                      : <ArrowDown className="icon-size-100" aria-hidden="true" />
                  )}
                </button>
              </th>
            ))}
            <th scope="col">Tags</th>
          </tr>
        </thead>
        {groups.map(([type, group], index) => {
          const open = searching || expanded.has(type);
          const regionId = `catalog-table-items-${index}`;
          return (
            <Fragment key={type}>
              <tbody>
                <tr className="bg-secondary/60">
                  <th scope="rowgroup" colSpan={5}>
                    <button
                      type="button"
                      disabled={searching}
                      onClick={() => onToggle(type)}
                      aria-expanded={open}
                      aria-controls={regionId}
                      className="atlas-control inline-flex w-full items-center gap-s rounded-md text-left disabled:cursor-default"
                    >
                      {open ? <ChevronDown className="icon-size-200" aria-hidden="true" /> : <ChevronRight className="icon-size-200" aria-hidden="true" />}
                      <TypeGlyph type={type} size={24} />
                      <span>{typeMeta(type).label}</span>
                      <span className="ml-auto font-numeric text-200 text-muted-foreground">{group.length}</span>
                    </button>
                  </th>
                </tr>
              </tbody>
              <tbody id={regionId} hidden={!open}>
                {group.map((item) => (
                  <tr key={item.fabricId} className={cn(selectedId === item.fabricId && "bg-primary/10")}>
                    <th scope="row" className="font-medium">
                      <button type="button" aria-haspopup="dialog" aria-label={`Open details for ${item.displayName}`} onClick={() => onSelect(item.fabricId)} className="atlas-control rounded-md text-left font-semibold text-brand-foreground hover:underline">
                        {item.displayName}
                      </button>
                    </th>
                    <td><HealthChip health={item.health} /></td>
                    <td className="text-200">
                      {item.ownerName || item.ownerEmail || (
                        <span className="text-muted-foreground">
                          {item.ownerMetadataAvailable === false ? "Not collected" : "Unassigned"}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-200 text-muted-foreground">
                      {item.lastRefresh ? relativeTime(item.lastRefresh) : "Not available"}
                    </td>
                    <td className="text-200 text-muted-foreground">{item.tags.join(", ") || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </Fragment>
          );
        })}
      </table>
    </div>
  );
}
