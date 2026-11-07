import {
  Activity,
  ChevronDown,
  CircleDashed,
  CircleX,
  FileWarning,
  GitBranch,
  PackageX,
  ShieldAlert,
  ShieldOff,
  TriangleAlert,
  Unlink,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { RadarSignalGroup, RadarSignalId } from "../radar-signals";
import { cn } from "../ui";

const SIGNAL_ICON: Record<RadarSignalId, LucideIcon> = {
  "external-grant-added": TriangleAlert,
  "broad-grant-added": UsersRound,
  "sensitivity-downgraded": ShieldOff,
  "lineage-broken": Unlink,
  "consumed-item-removed": PackageX,
  "job-failure": CircleX,
  "finding-access": ShieldAlert,
  "finding-metadata": FileWarning,
  "finding-lineage": GitBranch,
  "finding-operations": Activity,
  other: CircleDashed,
};

function toneClass(severity: RadarSignalGroup["severity"]): string {
  if (severity === "critical") return "bg-signal-danger-background text-signal-danger-foreground";
  if (severity === "high") return "bg-signal-warning-background text-signal-warning-foreground";
  return "bg-primary/10 text-brand-foreground";
}

/** Divider classes per breakpoint so every tile sets each border exactly once. */
function dividerClass(index: number): string {
  return cn(
    index > 0 ? "border-t" : "border-t-0",
    index >= 2 ? "sm:border-t" : "sm:border-t-0",
    index % 2 === 1 ? "sm:border-l" : "sm:border-l-0",
    index >= 3 ? "lg:border-t" : "lg:border-t-0",
    index % 3 !== 0 ? "lg:border-l" : "lg:border-l-0",
  );
}

/**
 * Governance Radar signal row: one tile per signal with its real entry count.
 * Each tile discloses the entries of its signal in the shared detail region.
 */
export function RadarSignalTiles({
  groups,
  openId,
  controlsId,
  onToggle,
}: {
  groups: RadarSignalGroup[];
  openId?: RadarSignalId;
  controlsId: string;
  onToggle: (id: RadarSignalId) => void;
}) {
  return (
    <ul
      aria-label="Radar signals"
      className="grid px-s py-s sm:grid-cols-2 lg:grid-cols-3"
    >
      {groups.map((group, index) => {
        const Icon = SIGNAL_ICON[group.id];
        const open = group.id === openId;
        return (
          <li
            key={group.id}
            className={cn("min-w-0 border-border p-xs", dividerClass(index))}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-controls={controlsId}
              onClick={() => onToggle(group.id)}
              className="group flex h-full min-h-[var(--atlas-touch-target)] w-full items-center gap-m rounded-lg px-m py-s text-left transition-colors hover:bg-accent aria-expanded:bg-primary/5 motion-reduce:transition-none"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex icon-size-600 shrink-0 items-center justify-center rounded-lg",
                  toneClass(group.severity),
                )}
              >
                <Icon className="icon-size-300" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-300 font-semibold leading-300">
                  {group.title}
                </span>
                <span className="block text-200 leading-200 text-muted-foreground">
                  {group.summary}
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="icon-size-200 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
