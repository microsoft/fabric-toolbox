import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  EyeOff,
  Globe,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useAtlas } from "../store";
import { Card, TypeGlyph, cn } from "../ui";
import { typeMeta, type Item } from "../model";

interface Label {
  name: string;
  rank: number;
  icon: typeof Lock;
  blurb: string;
  iconClassName: string;
  badgeClassName: string;
  borderClassName: string;
}

const LABELS: Label[] = [
  {
    name: "Highly Confidential",
    rank: 4,
    icon: Lock,
    blurb: "Most sensitive · restrict sharing",
    iconClassName: "bg-status-failing/10 text-status-failing",
    badgeClassName:
      "border-status-failing/30 bg-status-failing/10 text-status-failing",
    borderClassName: "border-status-failing/30",
  },
  {
    name: "Confidential",
    rank: 3,
    icon: ShieldAlert,
    blurb: "Business-sensitive · review access",
    iconClassName: "bg-status-warning/10 text-status-warning",
    badgeClassName:
      "border-status-warning/30 bg-status-warning/10 text-status-warning",
    borderClassName: "border-status-warning/30",
  },
  {
    name: "General",
    rank: 2,
    icon: ShieldCheck,
    blurb: "Protected for internal use",
    iconClassName: "bg-primary/10 text-brand-foreground",
    badgeClassName: "border-primary/25 bg-primary/10 text-brand-foreground",
    borderClassName: "border-primary/25",
  },
  {
    name: "Public",
    rank: 1,
    icon: Globe,
    blurb: "Approved for broad sharing",
    iconClassName: "bg-status-healthy/10 text-status-healthy",
    badgeClassName:
      "border-status-healthy/30 bg-status-healthy/10 text-status-healthy",
    borderClassName: "border-status-healthy/30",
  },
];

const UNLABELED: Label = {
  name: "Unlabeled",
  rank: 0,
  icon: EyeOff,
  blurb: "No sensitivity label applied",
  iconClassName: "bg-lineage-neutral/10 text-muted-foreground",
  badgeClassName:
    "border-lineage-neutral/30 bg-lineage-neutral/10 text-muted-foreground",
  borderClassName: "border-lineage-neutral/30",
};

const LABELED: Label = {
  name: "Labeled",
  rank: 2,
  icon: ShieldCheck,
  blurb: "Label ID collected · display name unavailable",
  iconClassName: "bg-primary/10 text-brand-foreground",
  badgeClassName: "border-primary/25 bg-primary/10 text-brand-foreground",
  borderClassName: "border-primary/25",
};

const NOT_COLLECTED: Label = {
  name: "Not collected",
  rank: -1,
  icon: EyeOff,
  blurb: "The metadata source did not expose label status",
  iconClassName: "bg-muted text-muted-foreground",
  badgeClassName: "border-border bg-muted text-muted-foreground",
  borderClassName: "border-border",
};

function labelFor(item: Item, legacyAvailable: boolean): Label {
  const available =
    item.sensitivityMetadataAvailable ?? legacyAvailable;
  if (!available) return NOT_COLLECTED;
  const sensitivity = item.sensitivity?.trim();
  if (sensitivity) {
    return (
      LABELS.find(
        (label) =>
          label.name.toLowerCase() === sensitivity.toLowerCase(),
      ) ?? LABELED
    );
  }
  return item.sensitivityLabelId ? LABELED : UNLABELED;
}

export function SensitivityView({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const { data } = useAtlas();
  const { items } = data;
  const explicitAvailability = items.some(
    (item) => item.sensitivityMetadataAvailable !== undefined,
  );
  const legacyAvailable =
    !explicitAvailability &&
    items.some((item) => item.sensitivity || item.sensitivityLabelId);

  const byLabel = useMemo(() => {
    const grouped = new Map<string, Item[]>();
    for (const item of items) {
      const label = labelFor(item, legacyAvailable).name;
      const labelItems = grouped.get(label) ?? [];
      labelItems.push(item);
      grouped.set(label, labelItems);
    }
    return grouped;
  }, [items, legacyAvailable]);

  const order = [...LABELS, LABELED, UNLABELED, NOT_COLLECTED];
  const confidential = items.filter(
    (item) => labelFor(item, legacyAvailable).rank >= 3,
  );
  const availableItems = items.filter(
    (item) => labelFor(item, legacyAvailable) !== NOT_COLLECTED,
  );
  const unlabeledCount = byLabel.get(UNLABELED.name)?.length ?? 0;
  const labeledCount = availableItems.length - unlabeledCount;
  const coverage = availableItems.length
    ? Math.round((labeledCount / availableItems.length) * 100)
    : null;
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(
    new Set(),
  );

  const summary = [
    {
      label: "Label coverage",
      value: coverage == null ? "N/A" : `${coverage}%`,
      detail:
        coverage == null
          ? "Label metadata was not collected"
          : `${labeledCount} of ${availableItems.length} eligible items`,
      icon: ShieldCheck,
      className:
        coverage === 100
          ? "bg-status-healthy/10 text-status-healthy"
          : "bg-primary/10 text-brand-foreground",
    },
    {
      label: "Confidential",
      value: confidential.length,
      detail: "Requires closer control",
      icon: ShieldAlert,
      className:
        confidential.length > 0
          ? "bg-status-warning/10 text-status-warning"
          : "bg-status-healthy/10 text-status-healthy",
    },
    {
      label: "Unlabeled",
      value: unlabeledCount,
      detail: unlabeledCount ? "Coverage gap" : "No coverage gaps",
      icon: EyeOff,
      className:
        unlabeledCount > 0
          ? "bg-status-failing/10 text-status-failing"
          : "bg-status-healthy/10 text-status-healthy",
    },
  ];

  return (
    <div
      className={cn(
        "flex flex-col gap-l",
        embedded ? "" : "atlas-content-frame p-l sm:p-xxl",
      )}
    >
      {!embedded && <Card className="overflow-hidden">
        <div className="border-b border-border bg-secondary/60 p-l">
          <div className="mb-xs text-200 font-semibold uppercase tracking-wider text-brand-foreground">
            Information protection
          </div>
          <h1 className="text-600 font-bold leading-600">
            Sensitivity posture
          </h1>
          <p className="mt-xs text-300 leading-300 text-muted-foreground">
            Label coverage, confidential assets and gaps across the workspace.
          </p>
        </div>

        <div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {summary.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="flex items-center gap-m p-l">
                <span
                  className={cn(
                    "flex icon-size-600 shrink-0 items-center justify-center rounded-xl",
                    metric.className,
                  )}
                >
                  <Icon className="icon-size-300" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="font-numeric text-500 font-bold leading-500 tabular-nums">
                    {metric.value}
                  </div>
                  <div className="text-300 font-semibold">{metric.label}</div>
                  <div className="text-200 text-muted-foreground">
                    {metric.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>}

      <section aria-labelledby="label-summary-title">
        <div className="mb-m flex flex-wrap items-end justify-between gap-s">
          <div>
            <h2 id="label-summary-title" className="text-400 font-semibold">
              Label distribution
            </h2>
            <p className="text-200 text-muted-foreground">
              Workspace items grouped by protection level
            </p>
          </div>
          <span className="rounded-full border border-border bg-card px-s py-xs text-200 font-medium text-muted-foreground">
            {items.length} total items
          </span>
        </div>

        <div         className="grid grid-cols-1 gap-m sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {order.map((label) => {
            const count = byLabel.get(label.name)?.length ?? 0;
            const share = items.length
              ? Math.round((count / items.length) * 100)
              : 0;
            const Icon = label.icon;

            return (
              <Card
                key={label.name}
                className={cn(
                  "flex min-h-full flex-col gap-m border-t-2 p-m",
                  label.borderClassName,
                )}
              >
                <div className="flex items-start justify-between gap-s">
                  <span
                    className={cn(
                      "flex icon-size-600 items-center justify-center rounded-xl",
                      label.iconClassName,
                    )}
                  >
                    <Icon className="icon-size-300" aria-hidden="true" />
                  </span>
                  <span className="text-200 font-medium text-muted-foreground">
                    {share}% of catalog
                  </span>
                </div>
                <div>
                  <div className="font-numeric text-hero-700 font-bold leading-hero-700 tabular-nums">
                    {count}
                  </div>
                  <h3 className="text-300 font-semibold leading-300">
                    {label.name}
                  </h3>
                </div>
                <p className="mt-auto text-200 leading-200 text-muted-foreground">
                  {label.blurb}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      {confidential.length > 0 && (
        <motion.section
          aria-labelledby="confidential-spotlight-title"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <Card className="overflow-hidden border-status-failing/30">
            <div className="flex flex-wrap items-center gap-m border-b border-status-failing/20 bg-status-failing/10 px-l py-m">
              <span className="flex icon-size-600 items-center justify-center rounded-xl bg-status-failing/10 text-status-failing">
                <ShieldAlert className="icon-size-300" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  id="confidential-spotlight-title"
                  className="text-400 font-semibold text-status-failing"
                >
                  Confidential spotlight
                </h2>
                <p className="text-200 text-muted-foreground">
                  Validate access and sharing for the workspace’s most
                  sensitive assets.
                </p>
              </div>
              <span className="rounded-full border border-status-failing/30 bg-card px-m py-xs text-200 font-semibold text-status-failing">
                {confidential.length} item
                {confidential.length === 1 ? "" : "s"} to review
              </span>
            </div>

            <div className="grid gap-s p-m md:grid-cols-2">
              {confidential.map((item) => {
                const label = labelFor(item, legacyAvailable);
                return (
                  <article
                    key={item.fabricId}
                    className="flex items-center gap-m rounded-xl border border-border bg-card p-m"
                  >
                    <TypeGlyph type={item.itemType} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-300 font-semibold">
                        {item.displayName}
                      </div>
                      <div className="flex flex-wrap gap-x-s text-200 text-muted-foreground">
                        <span>{typeMeta(item.itemType).label}</span>
                        {item.ownerName && (
                          <span className="truncate">
                            · Owner: {item.ownerName}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-md border px-s py-xxs text-[length:var(--text-200)] font-semibold",
                        label.badgeClassName,
                      )}
                    >
                      {label.name}
                    </span>
                  </article>
                );
              })}
            </div>
          </Card>
        </motion.section>
      )}

      <section aria-labelledby="label-details-title">
        <div className="mb-m">
          <h2 id="label-details-title" className="text-400 font-semibold">
            Label details
          </h2>
          <p className="text-200 text-muted-foreground">
            Expand a label to inspect its items and ownership.
          </p>
        </div>

        {items.length === 0 ? (
          <Card className="p-xxxl text-center">
            <ShieldCheck className="mx-auto icon-size-700 text-muted-foreground" />
            <div className="mt-l text-300 font-semibold">
              No catalog items available
            </div>
            <div className="mt-xs text-200 text-muted-foreground">
              Sensitivity details will appear after items are discovered.
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-m">
            {order.map((label) => {
              const list = byLabel.get(label.name) ?? [];
              if (list.length === 0) return null;

              const Icon = label.icon;
              const open = expandedLabels.has(label.name);
              const sectionId = `sensitivity-${label.name
                .toLowerCase()
                .replaceAll(" ", "-")}`;

              return (
                <Card key={label.name} className="overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={sectionId}
                    onClick={() =>
                      setExpandedLabels((previous) => {
                        const next = new Set(previous);
                        if (next.has(label.name)) next.delete(label.name);
                        else next.add(label.name);
                        return next;
                      })
                    }
                    className={cn(
                      "flex w-full items-center gap-m border-l-2 px-l py-m text-left transition-colors hover:bg-accent/50",
                      label.borderClassName,
                      open && "bg-accent/30",
                    )}
                  >
                    <span
                      className={cn(
                        "flex icon-size-600 shrink-0 items-center justify-center rounded-xl",
                        label.iconClassName,
                      )}
                    >
                      <Icon className="icon-size-300" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-300 font-semibold">
                        {label.name}
                      </span>
                      <span className="block text-200 text-muted-foreground">
                        {label.blurb}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-m py-xs text-[length:var(--text-200)] font-semibold tabular-nums",
                        label.badgeClassName,
                      )}
                    >
                      {list.length}
                    </span>
                    {open ? (
                      <ChevronDown
                        className="icon-size-300 text-brand-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight
                        className="icon-size-300 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </button>

                  {open && (
                    <div
                      id={sectionId}
                      className="divide-y divide-border/60 border-t border-border"
                    >
                      {list.map((item) => (
                        <div
                          key={item.fabricId}
                          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-m px-l py-m hover:bg-accent/30"
                        >
                          <TypeGlyph type={item.itemType} size={30} />
                          <div className="min-w-0">
                            <div className="truncate text-300 font-semibold">
                              {item.displayName}
                            </div>
                            <div className="text-200 text-muted-foreground">
                              {typeMeta(item.itemType).label}
                            </div>
                          </div>
                          <div className="hidden min-w-0 text-right sm:block">
                            <div className="text-200 font-medium">
                              {item.ownerName ??
                                (item.ownerMetadataAvailable === false
                                  ? "Owner not collected"
                                  : "No owner assigned")}
                            </div>
                            <div className="text-100 uppercase tracking-wide text-muted-foreground">
                              Owner
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
