import { useMemo, useState, type ReactNode } from "react";
import { Database, Search } from "lucide-react";
import { Card, cn } from "../ui";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/button-styles";
import { useExternalLineage } from "../external-lineage-store";
import {
  EXACT_PATH,
  LINKABLE_TYPES,
  externalCounts,
  type ExternalDatasetRecord,
  type LinkState,
} from "../external-lineage";
import type { Item } from "../model";
import { useAtlas } from "../store";
import { ExternalPill, Note } from "./ExternalLineageParts";

type Filter = "all" | LinkState;
const STATE_ORDER: Record<LinkState, number> = { linked: 0, to_link: 1, external: 2 };
const KEEP_EXTERNAL = "__external__";

interface Candidate {
  key: string;
  item: Item;
  objectName?: string;
  label: string;
  detail: string;
}

function StateBadge({ state }: { state: LinkState }) {
  const style =
    state === "linked"
      ? "bg-signal-success-background text-signal-success-foreground"
      : state === "to_link"
        ? "bg-signal-warning-background text-signal-warning-foreground"
        : "bg-signal-info-background text-signal-info-foreground";
  const label = state === "linked" ? "Linked" : state === "to_link" ? "To link" : "External";
  return <span className={cn("whitespace-nowrap rounded-full px-s py-[1px] text-100 font-semibold", style)}>{label}</span>;
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-sm border border-border bg-secondary px-xs py-[1px] text-100 text-foreground">
      {children}
    </span>
  );
}

function who(email?: string) {
  return email ? email.split("@")[0] : "someone";
}

export function ExternalLinkTab() {
  const { data } = useAtlas();
  const { externalLineage, busy, setDatasetLink } = useExternalLineage();
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const counts = useMemo(() => externalCounts(externalLineage), [externalLineage]);
  const workspaceName = data.workspace.displayName;
  const itemsById = useMemo(() => new Map(data.items.map((i) => [i.fabricId, i])), [data.items]);

  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = [];
    // Data stores first, then every other item (Eventstream, Notebook, Report…) so any item can be picked.
    const ordered = [...data.items].sort(
      (a, b) =>
        Number(!LINKABLE_TYPES.has(a.itemType)) - Number(!LINKABLE_TYPES.has(b.itemType)) ||
        a.displayName.localeCompare(b.displayName),
    );
    for (const item of ordered) {
      out.push({ key: item.fabricId, item, label: item.displayName, detail: `${workspaceName} · ${item.itemType}` });
      for (const table of data.schema?.[item.fabricId] ?? []) {
        out.push({
          key: `${item.fabricId}::${table.name}`,
          item,
          objectName: table.name,
          label: `${item.displayName}.${table.name}`,
          detail: `${workspaceName} · ${item.itemType} table`,
        });
      }
    }
    return out;
  }, [data.items, data.schema, workspaceName]);

  const rows = useMemo(
    () =>
      externalLineage.datasets
        .filter((d) => filter === "all" || d.state === filter)
        .sort(
          (a, b) =>
            STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
            a.namespace.localeCompare(b.namespace) ||
            a.name.localeCompare(b.name),
        ),
    [externalLineage.datasets, filter],
  );

  // undefined = nothing chosen yet (default to the first dataset to link); "" = panel closed.
  const selected =
    selectedId === undefined
      ? externalLineage.datasets.find((d) => d.state === "to_link")
      : externalLineage.datasets.find((d) => d.id === selectedId);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.total },
    { id: "linked", label: "Linked", count: counts.linked },
    { id: "to_link", label: "To link", count: counts.toLink },
    { id: "external", label: "External", count: counts.external },
  ];

  function fabricCell(d: ExternalDatasetRecord) {
    if (d.state === "external") return <ExternalPill>External · {d.platform}</ExternalPill>;
    if (d.state !== "linked") return <span className="text-200 text-muted-foreground">—</span>;
    const item = d.fabricItemId ? itemsById.get(d.fabricItemId) : undefined;
    const name = item?.displayName ?? d.fabricItemId ?? "Unknown item";
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-xs text-200 font-medium">
          <Database className="size-4 shrink-0 text-brand-foreground" aria-hidden="true" />
          <span className="truncate">{d.fabricObjectName ? `${name}.${d.fabricObjectName}` : name}</span>
        </div>
        <div className="text-100 text-muted-foreground">
          {workspaceName} · {item?.itemType ?? "Fabric item"}
        </div>
      </div>
    );
  }

  function howCell(d: ExternalDatasetRecord) {
    if (d.state === "external") return <span className="text-200 text-muted-foreground">Stays outside Fabric</span>;
    if (d.state !== "linked") return <span className="text-200 text-muted-foreground">—</span>;
    return <Chip>{d.linkedBy === EXACT_PATH ? "Exact OneLake path" : `Picked by ${who(d.linkedBy)}`}</Chip>;
  }

  return (
    <div className="flex flex-col gap-l">
      <div
        role="radiogroup"
        aria-label="Filter datasets"
        className="inline-flex self-start rounded-md border border-border bg-card p-[2px]"
      >
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-sm px-m py-xs text-200 font-medium transition-colors",
              filter === f.id ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:bg-accent",
            )}
          >
            {f.label} {f.count}
          </button>
        ))}
      </div>

      <div className="grid gap-l xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-border text-100 uppercase text-muted-foreground">
              <tr>
                <th className="px-m py-s font-semibold">OpenLineage dataset (namespace · name)</th>
                <th className="px-m py-s font-semibold">Fabric item</th>
                <th className="px-m py-s font-semibold">How</th>
                <th className="px-m py-s font-semibold">State</th>
                <th className="px-m py-s font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-m py-l text-center text-200 text-muted-foreground">
                    No dataset in this filter. Import an OpenLineage file first.
                  </td>
                </tr>
              )}
              {rows.map((d) => (
                <tr key={d.id} className={cn(selected?.id === d.id && "bg-primary/5")}>
                  <td className="max-w-[340px] px-m py-s">
                    <div className="truncate font-mono text-100 text-muted-foreground" title={d.namespace}>
                      {d.namespace}
                    </div>
                    <div className="truncate text-200 font-semibold" title={d.name}>
                      {d.name}
                    </div>
                  </td>
                  <td className="px-m py-s">{fabricCell(d)}</td>
                  <td className="px-m py-s">{howCell(d)}</td>
                  <td className="px-m py-s">
                    <StateBadge state={d.state} />
                  </td>
                  <td className="px-m py-s text-right">
                    {d.state === "linked" && d.linkedBy !== EXACT_PATH && (
                      <button
                        type="button"
                        className={SECONDARY_BUTTON}
                        disabled={busy}
                        aria-label={`Unlink ${d.name}`}
                        onClick={() => void setDatasetLink(d.id, { state: "to_link" })}
                      >
                        Unlink
                      </button>
                    )}
                    {d.state !== "linked" && (
                      <button
                        type="button"
                        className={SECONDARY_BUTTON}
                        disabled={busy}
                        aria-label={`Link ${d.name}`}
                        onClick={() => setSelectedId(d.id)}
                      >
                        Link
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {selected && selected.state !== "linked" ? (
          <LinkPanel
            key={selected.id}
            dataset={selected}
            candidates={candidates}
            busy={busy}
            onCancel={() => setSelectedId("")}
            onSave={async (choice) => {
              if (choice === KEEP_EXTERNAL) {
                await setDatasetLink(selected.id, { state: "external" });
              } else {
                const c = candidates.find((x) => x.key === choice);
                if (!c) return;
                await setDatasetLink(selected.id, {
                  state: "linked",
                  fabricItemId: c.item.fabricId,
                  fabricObjectName: c.objectName,
                });
              }
              setSelectedId("");
            }}
          />
        ) : (
          <Card className="self-start p-m">
            <Note>Pick a dataset marked “To link” to choose its Fabric item. Exact OneLake paths are linked on import.</Note>
          </Card>
        )}
      </div>
    </div>
  );
}


function LinkPanel({
  dataset,
  candidates,
  busy,
  onCancel,
  onSave,
}: {
  dataset: ExternalDatasetRecord;
  candidates: Candidate[];
  busy: boolean;
  onCancel: () => void;
  onSave: (choice: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [choice, setChoice] = useState<string>(dataset.state === "external" ? KEEP_EXTERNAL : "");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? candidates.filter((c) => c.label.toLowerCase().includes(q) || c.detail.toLowerCase().includes(q))
      : candidates;
    return list.slice(0, 8);
  }, [candidates, query]);

  const option = (key: string, label: ReactNode, detail?: string) => (
    <label
      key={key}
      className={cn(
        "flex cursor-pointer items-start gap-s rounded-md border p-s",
        choice === key ? "border-2 border-primary" : "border-border",
      )}
    >
      <input
        type="radio"
        name="external-link-choice"
        value={key}
        checked={choice === key}
        onChange={() => setChoice(key)}
        className="mt-[3px] accent-[var(--primary)]"
      />
      <div className="min-w-0">
        <div className="truncate text-200 font-semibold">{label}</div>
        {detail && <div className="text-100 text-muted-foreground">{detail}</div>}
      </div>
    </label>
  );

  return (
    <Card className="self-start">
      <section aria-label={`Link ${dataset.name}`}>
        <div className="border-b border-border px-m py-s">
          <h3 className="truncate text-300 font-semibold">Link {dataset.name}</h3>
        </div>
        <div className="flex flex-col gap-s p-m">
          <label className="text-100 font-semibold text-muted-foreground" htmlFor="external-link-search">
            Fabric item
          </label>
          <div className="flex items-center gap-xs rounded-md border border-input bg-background px-s py-xs">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="external-link-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items and tables"
              className="min-w-0 flex-1 bg-transparent text-200 outline-none"
            />
          </div>
          {matches.length === 0 && (
            <p className="text-200 text-muted-foreground">No Fabric item or table matches “{query}”.</p>
          )}
          {matches.map((c) => option(c.key, c.label, c.detail))}
          {option(KEEP_EXTERNAL, <span className="font-normal">Not in Fabric — keep external</span>)}
          <Note>Atlas never guesses on names. The link is kept when the file is re-imported.</Note>
          <div className="flex justify-end gap-s">
            <button type="button" className={SECONDARY_BUTTON} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy || !choice}
              onClick={() => void onSave(choice)}
            >
              Link
            </button>
          </div>
        </div>
      </section>
    </Card>
  );
}
