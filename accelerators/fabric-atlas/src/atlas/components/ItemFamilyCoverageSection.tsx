import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CircleCheck,
  ExternalLink,
  FlaskConical,
  Layers3,
  ListChecks,
  Search,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  COVERAGE_DIMENSIONS,
  COVERAGE_DIMENSION_LABEL,
  COVERAGE_STATE_LABEL,
  inventoryGapList,
  observedItemFamilies,
  type InventoryGap,
  type ObservedItemFamily,
} from "../item-families";
import type { AtlasData, ItemType } from "../model";
import { Card, TypeGlyph, cn } from "../ui";
import { useDesktopEvidence } from "../use-desktop-evidence";
import {
  CoverageStateChip,
  FamilyCoverageEvidencePane,
} from "./FamilyCoverageEvidence";
import { familySubtitle } from "../item-family-display";

const GAP_STATES = new Set(["adapter-only", "deferred", "unsupported"]);

function StatCard({
  icon: Icon,
  value,
  label,
  detail,
  tone,
}: {
  icon: typeof Layers3;
  value: number;
  label: string;
  detail: string;
  tone: string;
}) {
  return (
    <Card className="flex items-center gap-m p-l">
      <span className={cn("flex icon-size-600 shrink-0 items-center justify-center rounded-lg", tone)}>
        <Icon className="icon-size-300" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="font-numeric text-500 font-bold leading-500">{value}</div>
        <div className="text-300 font-semibold">{label}</div>
        <div className="text-200 text-muted-foreground">{detail}</div>
      </div>
    </Card>
  );
}

function rowLabel(entry: ObservedItemFamily): string {
  const states = COVERAGE_DIMENSIONS.map(
    (dimension) =>
      `${COVERAGE_DIMENSION_LABEL[dimension]} ${COVERAGE_STATE_LABEL[entry.capability.coverage[dimension].state]}`,
  ).join(". ");
  const count = entry.itemCount
    ? `${entry.itemCount} item${entry.itemCount === 1 ? "" : "s"}`
    : entry.evidence ?? "Derived family";
  return `${entry.capability.label}. ${count}. ${states}.`;
}

function FamilyTable({
  rows,
  selectedKey,
  onSelect,
}: {
  rows: ObservedItemFamily[];
  selectedKey?: string;
  onSelect: (key: string) => void;
}) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [focusIndex, setFocusIndex] = useState(0);
  if (!rows.length) {
    return (
      <p className="px-l py-xxl text-center text-300 text-muted-foreground">
        No item family matches this search.
      </p>
    );
  }
  const activeIndex = Math.min(focusIndex, rows.length - 1);
  const focusRow = (index: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    setFocusIndex(next);
    refs.current.get(rows[next].capability.key)?.focus();
  };
  return (
    <div role="listbox" aria-label="Item family coverage">
      <div
        aria-hidden="true"
        className="atlas-row hidden grid-cols-[minmax(0,2.4fr)_minmax(3rem,0.5fr)_repeat(5,minmax(0,1fr))] items-center gap-m border-b border-border bg-secondary/70 px-l text-200 font-semibold text-muted-foreground xl:grid"
      >
        <span>Item family</span>
        <span>Items</span>
        {COVERAGE_DIMENSIONS.map((dimension) => (
          <span key={dimension}>{COVERAGE_DIMENSION_LABEL[dimension]}</span>
        ))}
      </div>
      <div className="divide-y divide-border">
        {rows.map((entry, index) => {
          const { capability } = entry;
          const selected = capability.key === selectedKey;
          return (
            <div
              key={capability.key}
              ref={(element) => {
                if (element) refs.current.set(capability.key, element);
                else refs.current.delete(capability.key);
              }}
              role="option"
              tabIndex={index === activeIndex ? 0 : -1}
              aria-selected={selected}
              aria-label={rowLabel(entry)}
              onFocus={() => setFocusIndex(index)}
              onClick={() => {
                setFocusIndex(index);
                onSelect(capability.key);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusRow(index + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusRow(index - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  focusRow(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  focusRow(rows.length - 1);
                } else if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(capability.key);
                }
              }}
              className={cn(
                "atlas-row grid cursor-pointer grid-cols-2 gap-m px-l transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-3 xl:grid-cols-[minmax(0,2.4fr)_minmax(3rem,0.5fr)_repeat(5,minmax(0,1fr))] xl:items-center",
                selected && "bg-primary/10",
              )}
            >
              <div className="col-span-2 flex min-w-0 items-center gap-s sm:col-span-3 xl:col-span-1">
                <TypeGlyph type={capability.key as ItemType} size={24} />
                <span className="min-w-0 truncate text-300" title={familySubtitle(capability)}>
                  {capability.label}
                </span>
                {capability.maturity === "preview" && (
                  <span className="shrink-0 rounded-md border border-lineage-upstream/30 px-xs text-100 font-semibold text-lineage-upstream">
                    Preview
                  </span>
                )}
              </div>
              <div className="min-w-0 text-300">
                <span className="mb-xxs block text-200 font-semibold text-muted-foreground xl:hidden">
                  Items
                </span>
                <span className="font-numeric">{entry.itemCount || "—"}</span>
              </div>
              {COVERAGE_DIMENSIONS.map((dimension) => (
                <div key={dimension} className="min-w-0">
                  <span className="mb-xxs block text-200 font-semibold text-muted-foreground xl:hidden">
                    {COVERAGE_DIMENSION_LABEL[dimension]}
                  </span>
                  <CoverageStateChip state={capability.coverage[dimension].state} short />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GapCard({ gap }: { gap: InventoryGap }) {
  return (
    <li className="flex gap-m bg-card p-m">
      <TypeGlyph type={gap.key as ItemType} size={24} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-s">
          <h4 className="text-300 font-semibold">{gap.label}</h4>
          {gap.observedItems > 0 && (
            <span className="font-numeric text-200 text-muted-foreground">
              {gap.observedItems} observed
            </span>
          )}
        </div>
        {gap.followUp && (
          <p className="mt-xxs text-200 leading-200 text-muted-foreground">{gap.followUp}</p>
        )}
        <ul className="mt-s flex flex-wrap gap-xs" aria-label={`${gap.label} coverage gaps`}>
          {gap.gaps.map((entry) => (
            <li key={entry.dimension} className="inline-flex items-center gap-xs text-200">
              <span className="text-muted-foreground">{COVERAGE_DIMENSION_LABEL[entry.dimension]}</span>
              <CoverageStateChip state={entry.state} short />
            </li>
          ))}
        </ul>
        {gap.definitionUrl && (
          <a
            href={gap.definitionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-xs inline-flex min-h-[var(--atlas-touch-target)] items-center gap-xs text-200 font-semibold text-brand-foreground underline-offset-2 hover:underline sm:min-h-0"
          >
            <ExternalLink className="icon-size-100" aria-hidden="true" />
            Definition documentation
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * Coverage tab inventory of the item families present in the active snapshot,
 * with the evidence details pane and the API-backed gap list.
 */
export function ItemFamilyCoverageSection({
  data,
}: {
  data: Pick<AtlasData, "items" | "jobs" | "workspace">;
}) {
  const desktop = useDesktopEvidence();
  const observed = useMemo(
    () => observedItemFamilies({ items: data.items, jobs: data.jobs }),
    [data.items, data.jobs],
  );
  const gaps = useMemo(() => inventoryGapList(observed), [observed]);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [showOtherGaps, setShowOtherGaps] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);

  const normalized = query.trim().toLowerCase();
  const rows = normalized
    ? observed.filter((entry) =>
        `${entry.capability.label} ${entry.capability.key}`.toLowerCase().includes(normalized),
      )
    : observed;
  const selected =
    observed.find((entry) => entry.capability.key === selectedKey) ??
    (desktop ? observed[0] : undefined);
  const paneVisible = Boolean(selected) && (desktop || evidenceOpen);

  const counts = { collected: 0, pending: 0, unsupported: 0 };
  for (const entry of observed) {
    for (const dimension of COVERAGE_DIMENSIONS) {
      const state = entry.capability.coverage[dimension].state;
      if (state === "collected") counts.collected += 1;
      else if (state === "adapter-only" || state === "deferred") counts.pending += 1;
      else if (state === "unsupported") counts.unsupported += 1;
    }
  }
  const observedGaps = gaps.filter((gap) => gap.observedItems > 0);
  const otherGaps = gaps.filter((gap) => gap.observedItems === 0);
  const hasGaps = observed.some((entry) =>
    COVERAGE_DIMENSIONS.some((dimension) => GAP_STATES.has(entry.capability.coverage[dimension].state)),
  );
  const totalItems = data.items.length;

  const pane = selected && (
    <FamilyCoverageEvidencePane
      capability={selected.capability}
      itemCount={selected.itemCount}
      observedAt={data.workspace.syncedAt}
      observedEvidence={selected.evidence}
      onClose={desktop ? undefined : () => setEvidenceOpen(false)}
      closeId="family-evidence-close"
    />
  );

  return (
    <section aria-labelledby="item-family-coverage-heading" className="flex flex-col gap-l">
      {hasGaps && (
        <div
          role="note"
          className="flex items-start gap-s rounded-lg border border-status-warning/35 bg-status-warning/10 px-m py-s text-200 leading-200 text-foreground"
        >
          <AlertTriangle className="icon-size-200 shrink-0 text-status-warning" aria-hidden="true" />
          <p>
            Coverage is partial. Adapter-only, deferred and unsupported dimensions are not treated
            as collected.
          </p>
        </div>
      )}

      <div className="grid gap-m sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Layers3}
          value={observed.length}
          label="Item families"
          detail={`${totalItems} item${totalItems === 1 ? "" : "s"} in this snapshot`}
          tone="bg-primary/10 text-brand-foreground"
        />
        <StatCard
          icon={CircleCheck}
          value={counts.collected}
          label="Dimensions collected"
          detail="In published snapshots"
          tone="bg-status-healthy/10 text-status-healthy"
        />
        <StatCard
          icon={FlaskConical}
          value={counts.pending}
          label="Adapter only or deferred"
          detail="Not in published snapshots"
          tone="bg-lineage-upstream/10 text-lineage-upstream"
        />
        <StatCard
          icon={Ban}
          value={counts.unsupported}
          label="Unsupported"
          detail="No verified public contract"
          tone="bg-muted text-muted-foreground"
        />
      </div>

      <div
        className={cn(
          "grid items-start gap-l",
          paneVisible && desktop && "xl:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]",
        )}
      >
        <div className="flex min-w-0 flex-col gap-l">
          <Card className="min-w-0 overflow-hidden">
            <div className="atlas-row flex flex-wrap items-center justify-between gap-m border-b border-border px-l">
              <h2 id="item-family-coverage-heading" className="text-400 font-semibold">
                Item family coverage
              </h2>
              <label className="relative w-full sm:w-80">
                <span className="sr-only">Search item families</span>
                <Search
                  className="pointer-events-none absolute left-m top-1/2 icon-size-200 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search families or item types"
                  className="atlas-control w-full rounded-md border border-input bg-card pl-xxxl pr-m text-300 text-foreground placeholder:text-muted-foreground"
                />
              </label>
              <p className="sr-only" aria-live="polite">
                {rows.length} of {observed.length} item families shown
              </p>
            </div>
            {observed.length === 0 ? (
              <p className="px-l py-xxl text-center text-300 text-muted-foreground">
                No validated snapshot items yet. Coverage appears after the first synchronization.
              </p>
            ) : (
              <FamilyTable
                rows={rows}
                selectedKey={selected?.capability.key}
                onSelect={(key) => {
                  returnFocus.current =
                    document.activeElement instanceof HTMLElement ? document.activeElement : null;
                  setSelectedKey(key);
                  setEvidenceOpen(true);
                }}
              />
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="atlas-row flex flex-wrap items-center justify-between gap-m border-b border-border px-l">
              <div className="flex min-w-0 items-center gap-m">
                <span className="flex icon-size-500 shrink-0 items-center justify-center rounded-full bg-primary/10 text-brand-foreground">
                  <ListChecks className="icon-size-200" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-400 font-semibold">Inventory gaps</h2>
                  <p className="text-200 text-muted-foreground">
                    {observedGaps.length} bounded follow-up{observedGaps.length === 1 ? "" : "s"} for
                    families in this snapshot
                  </p>
                </div>
              </div>
              {otherGaps.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showOtherGaps}
                  aria-controls="item-family-other-gaps"
                  onClick={() => setShowOtherGaps((value) => !value)}
                  className="atlas-control inline-flex items-center gap-xs rounded-md px-s text-200 font-semibold text-brand-foreground hover:bg-accent"
                >
                  {showOtherGaps ? "Hide" : "Show"} families not in this snapshot ({otherGaps.length})
                  <ArrowRight
                    className={cn("icon-size-100 transition-transform", showOtherGaps && "rotate-90")}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
            {observedGaps.length > 0 ? (
              <ul
                className="grid gap-px bg-border lg:grid-cols-2"
                aria-label="Gaps in observed families"
              >
                {observedGaps.map((gap) => (
                  <GapCard key={gap.key} gap={gap} />
                ))}
              </ul>
            ) : (
              <p className="p-l text-200 text-muted-foreground">
                Observed families have no unsupported, deferred or adapter-only dimension.
              </p>
            )}
            {showOtherGaps && (
              <ul
                id="item-family-other-gaps"
                className="grid gap-px border-t border-border bg-border lg:grid-cols-2"
                aria-label="Gaps in families not in this snapshot"
              >
                {otherGaps.map((gap) => (
                  <GapCard key={gap.key} gap={gap} />
                ))}
              </ul>
            )}
          </Card>
        </div>

        {paneVisible && desktop && (
          <aside aria-label="Selected family evidence" className="min-w-0 xl:sticky xl:top-l">
            {pane}
          </aside>
        )}
      </div>

      {paneVisible && !desktop && (
        <Dialog.Root open onOpenChange={(open) => { if (!open) setEvidenceOpen(false); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[var(--atlas-evidence-overlay-z)] bg-background/80" />
            <Dialog.Content
              className="fixed inset-y-0 right-0 z-[var(--atlas-evidence-panel-z)] w-full max-w-[var(--atlas-drawer-width)] overflow-y-auto overscroll-contain bg-background p-s shadow-fabric-16"
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                document.getElementById("family-evidence-close")?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                returnFocus.current?.focus();
              }}
            >
              <Dialog.Title className="sr-only">Item family evidence</Dialog.Title>
              <Dialog.Description className="sr-only">
                Coverage state and source for each dimension of the selected item family.
              </Dialog.Description>
              {pane}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </section>
  );
}