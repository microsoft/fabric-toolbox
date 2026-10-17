import { useMemo } from "react";
import type { PillarScore, PosturePillar } from "../posture";
import { scoreBand } from "./score-style";
import {
  postureRadarData,
  radarPolygonPoints,
  radarSvgPoint,
} from "./posture-radar";
import { cn } from "../ui";

function scoreColor(score: number | null): string {
  if (score == null) return "var(--color-muted-foreground)";
  return `var(--color-score-${scoreBand(score)})`;
}

export function PostureRadar({
  pillars,
  selectedPillar,
  targetsAvailable,
  onSelect,
}: {
  pillars: readonly PillarScore[];
  selectedPillar: PosturePillar;
  targetsAvailable: boolean;
  onSelect: (pillar: PosturePillar) => void;
}) {
  const data = useMemo(
    () => postureRadarData(pillars, targetsAvailable),
    [pillars, targetsAvailable],
  );

  return (
    <figure aria-label="Governance posture radar" className="min-w-0">
      <div className="atlas-posture-chart relative">
        <svg
          viewBox="0 0 360 360"
          className="h-full w-full"
          role="img"
          aria-label="Six governance posture pillars on a zero to one hundred scale"
        >
          {data.rings.map((ring) => (
            <polygon
              key={ring.level}
              points={radarPolygonPoints(ring.points)}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="1"
            />
          ))}
          {data.axes.map((axis) => {
            const end = radarSvgPoint(axis);
            return (
              <line
                key={axis.pillar}
                x1="180"
                y1="180"
                x2={end.x}
                y2={end.y}
                stroke="var(--color-border)"
                strokeWidth="1"
              />
            );
          })}
          {data.targets.length > 0 && (
            <polygon
              points={radarPolygonPoints(data.targets)}
              fill="none"
              stroke="var(--color-muted-foreground)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
          )}
          {data.outline.length > 0 && (
            <polygon
              points={radarPolygonPoints(data.outline)}
              fill="var(--color-primary)"
              fillOpacity="0.08"
              stroke="none"
            />
          )}
          {data.segments
            .filter((point) => point.vertex === 0)
            .map((start) => {
              const end = data.segments.find(
                (point) =>
                  point.segment === start.segment &&
                  point.vertex === 1,
              );
              if (!end) {
                return null;
              }
              const source = radarSvgPoint(start);
              const target = radarSvgPoint(end);
              return (
                <line
                  key={start.segment}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke="var(--color-primary)"
                  strokeWidth="2"
                />
              );
            })}
          {data.points.map((point) => {
            const svg = radarSvgPoint(point);
            const selected = point.pillar === selectedPillar;
            return (
              <g key={point.pillar}>
                <circle
                  cx={svg.x}
                  cy={svg.y}
                  r={selected ? 7 : 5}
                  fill={scoreColor(point.score)}
                  stroke={
                    selected
                      ? "var(--color-primary)"
                      : "var(--color-card)"
                  }
                  strokeWidth={selected ? 3 : 2}
                >
                  <title>
                    {point.label}: {point.scoreText}. Target:{" "}
                    {point.targetText}.
                  </title>
                </circle>
              </g>
            );
          })}
          {[0, 25, 50, 75, 100].map((level) => (
            <text
              key={level}
              x="186"
              y={180 - level * 1.16}
              fill="var(--color-muted-foreground)"
              fontSize="9"
            >
              {level}
            </text>
          ))}
        </svg>
        {data.labels.map((label) => {
          const point = radarSvgPoint(label);
          const selected = label.pillar === selectedPillar;
          return (
            <button
              key={label.pillar}
              type="button"
              aria-pressed={selected}
              aria-label={`${label.label}: ${label.scoreText}. Target: ${label.targetText}`}
              onClick={() => onSelect(label.pillar)}
              className={cn(
                "absolute min-h-[var(--atlas-touch-target)] min-w-[var(--atlas-touch-target)] -translate-x-1/2 -translate-y-1/2 rounded-lg px-s py-xs text-200 font-semibold leading-200 focus-visible:outline-2 focus-visible:outline-ring",
                selected
                  ? "bg-primary text-primary-foreground shadow-fabric-2"
                  : "bg-card/90 text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              style={{
                left: `${(point.x / 360) * 100}%`,
                top: `${(point.y / 360) * 100}%`,
              }}
            >
              <span className="block">{label.label}</span>
              <span className="block font-numeric">
                {label.score == null ? "N/A" : `${label.score}%`}
              </span>
            </button>
          );
        })}
      </div>
      <figcaption className="flex flex-wrap items-center justify-center gap-x-l gap-y-s px-m pb-m text-200 text-muted-foreground">
        <span className="inline-flex items-center gap-s">
          <span
            aria-hidden="true"
            className="w-xl border-t-2 border-brand-foreground"
          />
          Current score
        </span>
        {targetsAvailable && (
          <span className="inline-flex items-center gap-s">
            <span
              aria-hidden="true"
              className="w-xl border-t-2 border-dashed border-muted-foreground"
            />
            Target
          </span>
        )}
        <span>0-100 · N/A is anchored at 0</span>
      </figcaption>
    </figure>
  );
}
