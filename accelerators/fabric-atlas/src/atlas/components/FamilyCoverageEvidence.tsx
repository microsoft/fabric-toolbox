import {
  Activity,
  Ban,
  CircleCheck,
  CircleDashed,
  Clock3,
  ExternalLink,
  EyeOff,
  FlaskConical,
  Info,
  Minus,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  COVERAGE_DIMENSIONS,
  COVERAGE_DIMENSION_LABEL,
  COVERAGE_STATE_LABEL,
  ITEM_FAMILY_ADAPTERS,
  type CoverageState,
  type ItemFamilyCapability,
} from "../item-families";
import { relativeTime, type ItemType } from "../model";
import {
  COVERAGE_DIMENSION_ICON,
  COVERAGE_STATE_SHORT_LABEL,
  familySubtitle,
} from "../item-family-display";
import { TypeGlyph, cn } from "../ui";

const STATE_META: Record<CoverageState, { icon: LucideIcon; chip: string; iconClass: string }> = {
  collected: {
    icon: CircleCheck,
    chip: "border-status-healthy/30 bg-status-healthy/10 text-status-healthy",
    iconClass: "",
  },
  partial: {
    icon: CircleDashed,
    chip: "border-status-warning/35 bg-status-warning/10 text-foreground",
    iconClass: "text-status-warning",
  },
  "adapter-only": {
    icon: FlaskConical,
    chip: "border-lineage-upstream/35 bg-lineage-upstream/10 text-lineage-upstream",
    iconClass: "",
  },
  deferred: {
    icon: Clock3,
    chip: "border-status-warning/35 bg-status-warning/10 text-foreground",
    iconClass: "text-status-warning",
  },
  unsupported: {
    icon: Ban,
    chip: "border-border bg-muted text-muted-foreground",
    iconClass: "",
  },
  excluded: {
    icon: EyeOff,
    chip: "border-border bg-muted text-muted-foreground",
    iconClass: "",
  },
  "not-applicable": {
    icon: Minus,
    chip: "border-border bg-transparent text-muted-foreground",
    iconClass: "",
  },
};

/** Status chip with an icon and text so the state never relies on colour alone. */
export function CoverageStateChip({
  state,
  short = false,
  className,
}: {
  state: CoverageState;
  short?: boolean;
  className?: string;
}) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-xs whitespace-nowrap rounded-md border px-s py-xxs text-[length:var(--text-200)] font-semibold",
        meta.chip,
        className,
      )}
    >
      <Icon className={cn("icon-size-100 shrink-0", meta.iconClass)} aria-hidden="true" />
      <span className="truncate">
        {short ? COVERAGE_STATE_SHORT_LABEL[state] : COVERAGE_STATE_LABEL[state]}
      </span>
    </span>
  );
}

/** One labelled evidence row per coverage dimension: label, icon and status chip, then the reason. */
export function FamilyCoverageRows({ capability }: { capability: ItemFamilyCapability }) {
  return (
    <dl className="divide-y divide-border/60">
      {COVERAGE_DIMENSIONS.map((dimension) => {
        const coverage = capability.coverage[dimension];
        const Icon = COVERAGE_DIMENSION_ICON[dimension];
        return (
          <div
            key={dimension}
            className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-x-m gap-y-xxs py-s"
          >
            <dt className="min-w-0 text-200 text-muted-foreground">
              {COVERAGE_DIMENSION_LABEL[dimension]}
            </dt>
            <dd className="flex min-w-0 items-center gap-s">
              <Icon className="icon-size-200 shrink-0 text-muted-foreground" aria-hidden="true" />
              <CoverageStateChip state={coverage.state} />
            </dd>
            <dd className="col-start-2 text-100 leading-200 text-muted-foreground">
              {coverage.detail}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function PaneFact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-start gap-m text-200">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-start gap-s break-words text-foreground">
        <Icon className="icon-size-200 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0">{children}</span>
      </dd>
    </div>
  );
}

/** Adapter and derived-family notes, including whether evidence is published. */
export function FamilyCoverageNotes({
  capability,
  mlvRefreshJobs = 0,
}: {
  capability: ItemFamilyCapability;
  mlvRefreshJobs?: number;
}) {
  if (!capability.adapters.length && mlvRefreshJobs === 0) return null;
  return (
    <div className="flex flex-col gap-s">
      {capability.adapters.map((adapter) => (
        <div
          key={adapter}
          role="note"
          className="flex items-start gap-s rounded-lg border border-lineage-upstream/30 bg-lineage-upstream/5 p-m text-200 leading-200 text-foreground"
        >
          <FlaskConical className="icon-size-200 shrink-0 text-lineage-upstream" aria-hidden="true" />
          <p>
            <span className="font-semibold">{ITEM_FAMILY_ADAPTERS[adapter].label}.</span>{" "}
            {ITEM_FAMILY_ADAPTERS[adapter].detail}
          </p>
        </div>
      ))}
      {mlvRefreshJobs > 0 && (
        <div
          role="note"
          className="flex items-start gap-s rounded-lg border border-border bg-secondary p-m text-200 leading-200 text-foreground"
        >
          <Info className="icon-size-200 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>
            <span className="font-semibold">Materialized lake views.</span> {mlvRefreshJobs} refresh
            job{mlvRefreshJobs === 1 ? "" : "s"} recorded on this Lakehouse. Views are not separate
            Fabric items.
          </p>
        </div>
      )}
    </div>
  );
}

/** Evidence details pane for one item family, mirroring the #42 evidence pane layout. */
export function FamilyCoverageEvidencePane({
  capability,
  itemCount,
  observedAt,
  observedEvidence,
  onClose,
  closeId,
}: {
  capability: ItemFamilyCapability;
  itemCount?: number;
  observedAt?: string;
  observedEvidence?: string;
  onClose?: () => void;
  closeId?: string;
}) {
  const headingId = `family-evidence-${capability.key.replace(/[^A-Za-z0-9]+/g, "-")}`;
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-fabric-2"
    >
      <header className="flex items-center gap-s border-b border-border px-l py-m">
        <h2 id={headingId} className="min-w-0 flex-1 text-400 font-semibold">
          Evidence details
        </h2>
        {onClose && (
          <button
            type="button"
            id={closeId}
            onClick={onClose}
            aria-label="Close evidence details"
            className="flex min-h-[var(--atlas-touch-target)] min-w-[var(--atlas-touch-target)] items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="icon-size-200" aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="flex flex-col gap-m p-l">
        <div className="flex items-center gap-m">
          <TypeGlyph type={capability.key as ItemType} size={36} />
          <div className="min-w-0">
            <h3 className="break-words text-300 font-semibold">{capability.label}</h3>
            <p className="text-200 text-muted-foreground">{familySubtitle(capability, itemCount)}</p>
          </div>
        </div>
        <FamilyCoverageRows capability={capability} />
        <dl className="flex flex-col gap-s border-t border-border pt-m">
          <PaneFact icon={Clock3} label="Last observed">
            {observedAt ? relativeTime(observedAt) : "No validated snapshot"}
          </PaneFact>
          {observedEvidence && (
            <PaneFact icon={Activity} label="Snapshot evidence">
              {observedEvidence}
            </PaneFact>
          )}
          {capability.followUp && (
            <PaneFact icon={Info} label="Follow-up">
              <span className="font-normal text-muted-foreground">{capability.followUp}</span>
            </PaneFact>
          )}
        </dl>
        <FamilyCoverageNotes capability={capability} />
        {capability.definitionUrl && (
          <a
            href={capability.definitionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="atlas-control inline-flex items-center gap-s self-start rounded-lg border border-border bg-card px-m text-300 font-semibold text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="icon-size-200" aria-hidden="true" />
            Open definition documentation
          </a>
        )}
      </div>
    </section>
  );
}
