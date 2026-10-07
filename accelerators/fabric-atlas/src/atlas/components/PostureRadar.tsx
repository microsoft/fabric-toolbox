import { useMemo, useState } from "react";
import { VegaVisual, useCssTheme } from "@microsoft/fabric-visuals";
import type { PillarScore, PosturePillar } from "../posture";
import { posturePillarFromInteraction, postureRadarSpec } from "./posture-radar";

export function PostureRadar({
  pillars, selectedPillar, targetsAvailable, onSelect,
}: {
  pillars: readonly PillarScore[];
  selectedPillar: PosturePillar;
  targetsAvailable: boolean;
  onSelect: (pillar: PosturePillar) => void;
}) {
  const theme = useCssTheme();
  const [error, setError] = useState(false);
  const spec = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => theme.isHighContrast
      ? theme.foreground
      : css.getPropertyValue(`--color-score-${name}`).trim() || theme.foregroundSecondary;
    return postureRadarSpec(pillars, selectedPillar, theme, {
      low: color("low"), mid: color("mid"), high: color("high"),
    }, targetsAvailable);
  }, [pillars, selectedPillar, targetsAvailable, theme]);

  return (
    <figure aria-label="Governance posture radar" className="min-w-0">
      <div className="atlas-posture-chart">
        <VegaVisual
          spec={spec}
          theme={theme}
          chromeless
          className="h-full w-full"
          capabilities={{
            disableNiceAxisBounds: true,
            disablePointRangeInset: true,
            disableLineChartCrosshairTooltip: true,
            disableSelfHighlight: true,
            disableTextTruncation: true,
          }}
          onInteraction={(events) => {
            const pillar = posturePillarFromInteraction(events);
            if (pillar) onSelect(pillar);
          }}
          onEvent={(event) => {
            if (event.detail.type === "error") setError(true);
            if (event.detail.type === "render") setError(false);
          }}
        />
      </div>
      {error && <p role="alert" className="px-m text-200 text-signal-danger-foreground">
        The posture chart could not be rendered. The six pillar scores and selection controls remain available.
      </p>}
      <figcaption className="flex flex-wrap items-center justify-center gap-x-l gap-y-s px-m pb-m text-200 text-muted-foreground">
        <span className="inline-flex items-center gap-s"><span aria-hidden="true" className="w-xl border-t-2 border-brand-foreground" />Current score</span>
        {targetsAvailable && <span className="inline-flex items-center gap-s"><span aria-hidden="true" className="w-xl border-t-2 border-dashed border-muted-foreground" />Target</span>}
        <span>0-100 · N/A leaves a gap</span>
      </figcaption>
    </figure>
  );
}
