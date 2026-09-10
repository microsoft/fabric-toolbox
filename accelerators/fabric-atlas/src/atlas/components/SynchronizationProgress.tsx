import { useEffect, useState } from "react";
import { Check, Clock3, RefreshCw } from "lucide-react";
import {
  formatSyncElapsed,
  SYNC_PHASES,
  syncPhaseIndex,
} from "../synchronization-progress";
import { cn } from "../ui";

function useSyncElapsed(active: boolean): number {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(
      () => setElapsedSeconds((value) => value + 1),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [active]);

  return elapsedSeconds;
}

export function SynchronizationProgress({
  progress,
  stage,
  active,
  variant = "hero",
}: {
  progress: number;
  stage: string;
  active: boolean;
  variant?: "hero" | "banner";
}) {
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  const phaseIndex = syncPhaseIndex(normalizedProgress);
  const elapsed = formatSyncElapsed(useSyncElapsed(active));
  const compact = variant === "banner";

  return (
    <section
      aria-label="Workspace synchronization status"
      className={cn(
        compact
          ? "border-b border-border bg-secondary/85 px-m py-s sm:px-l lg:px-xl"
          : "rounded-xl border border-border bg-secondary p-l",
      )}
    >
      <div className="flex items-center justify-between gap-m">
        <div className="min-w-0">
          <div className="flex items-center gap-s">
            <RefreshCw
              className={cn(
                "icon-size-200 shrink-0 text-primary",
                active && "animate-spin",
              )}
              aria-hidden="true"
            />
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="truncate text-300 font-semibold"
            >
              {stage}
            </span>
          </div>
          <div className="mt-xxs text-200 text-muted-foreground">
            Phase {phaseIndex + 1} of {SYNC_PHASES.length} ·{" "}
            {SYNC_PHASES[phaseIndex].label}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-xs font-numeric text-200 text-muted-foreground">
          <Clock3 className="icon-size-100" aria-hidden="true" />
          <span>{elapsed}</span>
          <span className="sr-only">elapsed</span>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label="Workspace synchronization progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedProgress}
        aria-valuetext={`${stage}. Phase ${phaseIndex + 1} of ${SYNC_PHASES.length}. ${elapsed} elapsed.`}
        className="relative mt-m h-s overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${normalizedProgress}%` }}
        />
        {active && normalizedProgress < 100 && (
          <span
            className="absolute inset-y-0 right-0 animate-pulse bg-primary/10"
            style={{ left: `${normalizedProgress}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      <ol
        aria-label="Synchronization phases"
        className={cn(
          "mt-m grid grid-cols-5 gap-xs",
          compact && "hidden sm:grid",
        )}
      >
        {SYNC_PHASES.map((phase, index) => {
          const complete =
            normalizedProgress >= 100 || index < phaseIndex;
          const current = active && index === phaseIndex;
          return (
            <li
              key={phase.label}
              aria-current={current ? "step" : undefined}
              className="min-w-0 text-center"
            >
              <span
                className={cn(
                  "mx-auto flex h-7 w-7 items-center justify-center rounded-full border font-numeric text-100 font-semibold",
                  complete
                    ? "border-status-healthy bg-status-healthy/10 text-status-healthy"
                    : current
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground",
                )}
              >
                {complete ? (
                  <Check className="icon-size-100" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={cn(
                  "mt-xs block truncate text-100",
                  current ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {phase.label}
              </span>
            </li>
          );
        })}
      </ol>

      {!compact && active && phaseIndex === 1 && (
        <p className="mt-m text-200 leading-300 text-muted-foreground">
          Atlas is processing the workspace by item type. Completed slices are
          retained until every type is ready for one atomic snapshot.
        </p>
      )}
    </section>
  );
}
