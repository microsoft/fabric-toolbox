import type { VisualizationSpec } from "@microsoft/fabric-visuals";
import type { InteractionEvent, VisualTheme } from "@microsoft/fabric-visuals-core";
import { POSTURE_PILLARS, type PillarScore, type PosturePillar } from "../posture";

export const POSTURE_LABELS: Record<PosturePillar, string> = {
  documentation: "Documentation",
  ownership: "Ownership",
  sensitivity: "Sensitivity",
  access: "Access",
  lineage: "Lineage",
  operations: "Operations",
};

export interface RadarPalette {
  low: string;
  mid: string;
  high: string;
}

function coordinate(index: number, radius: number) {
  const angle = index * Math.PI * 2 / POSTURE_PILLARS.length;
  return { x: Math.sin(angle) * radius, y: Math.cos(angle) * radius };
}

function finiteScore(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

export function postureRadarData(pillars: readonly PillarScore[], targetsAvailable = true) {
  const points = POSTURE_PILLARS.map((pillar, order) => {
    const source = pillars.find((entry) => entry.pillar === pillar);
    const score = finiteScore(source?.score);
    const target = targetsAvailable ? finiteScore(source?.target) : null;
    return {
      pillar, order, label: POSTURE_LABELS[pillar], score, target,
      scoreText: score == null ? "N/A (not assessed)" : `${score}%`,
      targetText: target == null ? "Unavailable" : `${target}%`,
      ...(score == null ? { x: null, y: null } : coordinate(order, score)),
    };
  });
  const segments = points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length];
    if (point.score == null || next.score == null) return [];
    return [
      { ...point, segment: index, vertex: 0 },
      { ...next, segment: index, vertex: 1 },
    ];
  });
  return {
    points,
    segments,
    outline: points.every((point) => point.score != null) ? points : [],
    targets: points.every((point) => point.target != null)
      ? points.map((point) => ({ ...point, ...coordinate(point.order, point.target!) }))
      : [],
    axes: points.map((point) => ({ ...point, ...coordinate(point.order, 100) })),
    labels: points.map((point) => ({
      ...point,
      ...coordinate(point.order, 126),
      labelText: point.score == null ? `${point.label}\nN/A` : point.label,
    })),
    rings: [25, 50, 75, 100].flatMap((level) =>
      POSTURE_PILLARS.map((_, order) => ({ level, order, ...coordinate(order, level) }))),
    ticks: [0, 25, 50, 75, 100].map((level) => ({ level, x: 0, y: level })),
  };
}

export function posturePillarFromInteraction(events: readonly InteractionEvent[]): PosturePillar | undefined {
  for (const event of [...events].reverse()) {
    if (event.action === "clear") return undefined;
    for (const selection of event.selections) {
      for (const predicate of selection.predicates) {
        if (predicate.type !== "set" || predicate.name !== "pillar") continue;
        const pillar = POSTURE_PILLARS.find((value) => predicate.values.includes(value));
        if (pillar) return pillar;
      }
    }
  }
  return undefined;
}

export function postureRadarSpec(
  pillars: readonly PillarScore[],
  selected: PosturePillar,
  theme: VisualTheme,
  palette: RadarPalette,
  targetsAvailable = true,
) {
  const data = postureRadarData(pillars, targetsAvailable);
  const tooltip = [
    { field: "label", type: "nominal", title: "Pillar" },
    { field: "scoreText", type: "nominal", title: "Current score" },
    { field: "targetText", type: "nominal", title: "Target" },
  ] as const;
  const encoding = {
    x: {
      field: "x", type: "quantitative" as const, axis: null,
      scale: {
        domain: [-150, 150], nice: false, zero: false,
        range: [{ expr: "width / 2 - min(width, height) / 2" }, { expr: "width / 2 + min(width, height) / 2" }],
      },
    },
    y: {
      field: "y", type: "quantitative" as const, axis: null,
      scale: {
        domain: [-150, 150], nice: false, zero: false,
        range: [{ expr: "height / 2 + min(width, height) / 2" }, { expr: "height / 2 - min(width, height) / 2" }],
      },
    },
  };
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    description: "Six governance posture pillars, current score and target on a fixed 0-100 radial scale. Missing scores are gaps, never zero.",
    width: "container",
    height: "container",
    padding: 0,
    autosize: { type: "fit", contains: "padding" },
    encoding,
    layer: [
      {
        data: { values: data.rings },
        mark: { type: "line", interpolate: "linear-closed", stroke: theme.stroke, strokeWidth: 1 },
        encoding: { detail: { field: "level" }, order: { field: "order" } },
      },
      {
        data: { values: data.axes },
        mark: { type: "rule", stroke: theme.stroke, strokeWidth: 1 },
        encoding: { x2: { datum: 0 }, y2: { datum: 0 } },
      },
      {
        data: { values: data.outline },
        mark: { type: "line", interpolate: "linear-closed", fill: theme.brandBackground, fillOpacity: 0.08, strokeOpacity: 0 },
        encoding: { order: { field: "order" } },
      },
      {
        data: { values: data.targets },
        mark: { type: "line", interpolate: "linear-closed", stroke: theme.foregroundSecondary, strokeWidth: 1.5, strokeDash: [5, 4] },
        encoding: { order: { field: "order" }, tooltip: [...tooltip] },
      },
      {
        data: { values: data.segments },
        mark: { type: "line", stroke: theme.brandForeground, strokeWidth: 2 },
        encoding: { detail: { field: "segment" }, order: { field: "vertex" }, tooltip: [...tooltip] },
      },
      {
        data: { values: data.points.filter((point) => point.score != null) },
        mark: { type: "point", filled: true, stroke: theme.foregroundSecondary, strokeWidth: 1.5, cursor: "pointer" },
        encoding: {
          color: { field: "score", type: "quantitative", scale: { domain: [0, 50, 100], range: [palette.low, palette.mid, palette.high] }, legend: null },
          size: { condition: { test: `datum.pillar === '${selected}'`, value: 180 }, value: 85 },
          tooltip: [...tooltip],
        },
      },
      {
        data: { values: data.ticks },
        mark: { type: "text", align: "left", dx: 6, dy: -3, color: theme.foregroundSecondary },
        encoding: { text: { field: "level" } },
      },
      {
        data: { values: data.labels },
        mark: { type: "text", lineBreak: "\n", cursor: "pointer" },
        encoding: {
          text: { field: "labelText" },
          color: { condition: { test: `datum.pillar === '${selected}'`, value: theme.brandForeground }, value: theme.foregroundSecondary },
          tooltip: [...tooltip],
        },
      },
    ],
    config: { view: { stroke: null } },
  } satisfies VisualizationSpec;
}
