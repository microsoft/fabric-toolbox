import {
  POSTURE_PILLARS,
  type PillarScore,
  type PosturePillar,
} from "../posture";

export const POSTURE_LABELS: Record<PosturePillar, string> = {
  documentation: "Documentation",
  ownership: "Ownership",
  sensitivity: "Sensitivity",
  access: "Access",
  lineage: "Lineage",
  operations: "Operations",
};

function coordinate(index: number, radius: number) {
  const angle = (index * Math.PI * 2) / POSTURE_PILLARS.length;
  const x = Math.sin(angle) * radius;
  const y = Math.cos(angle) * radius;
  return {
    x: Math.abs(x) < Number.EPSILON ? 0 : x,
    y: Math.abs(y) < Number.EPSILON ? 0 : y,
  };
}

function finiteScore(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : null;
}

export function postureRadarData(
  pillars: readonly PillarScore[],
  targetsAvailable = true,
) {
  const points = POSTURE_PILLARS.map((pillar, order) => {
    const source = pillars.find((entry) => entry.pillar === pillar);
    const score = finiteScore(source?.score);
    const target = targetsAvailable ? finiteScore(source?.target) : null;
    const plottedScore = score ?? 0;
    return {
      pillar,
      order,
      label: POSTURE_LABELS[pillar],
      score,
      target,
      scoreText: score == null ? "N/A (not assessed)" : `${score}%`,
      targetText: target == null ? "Unavailable" : `${target}%`,
      ...coordinate(order, plottedScore),
    };
  });
  const segments = points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length];
    return [
      { ...point, segment: index, vertex: 0 },
      { ...next, segment: index, vertex: 1 },
    ];
  });
  return {
    points,
    segments,
    outline: points,
    targets: points.every((point) => point.target != null)
      ? points.map((point) => ({
          ...point,
          ...coordinate(point.order, point.target!),
        }))
      : [],
    axes: points.map((point) => ({
      ...point,
      ...coordinate(point.order, 100),
    })),
    labels: points.map((point) => ({
      ...point,
      ...coordinate(point.order, 126),
      labelText:
        point.score == null ? `${point.label}\nN/A` : point.label,
    })),
    rings: [25, 50, 75, 100].map((level) => ({
      level,
      points: POSTURE_PILLARS.map((_, order) =>
        coordinate(order, level),
      ),
    })),
  };
}

export function radarSvgPoint(
  point: { x: number; y: number },
  centre = 180,
  scale = 1.16,
): { x: number; y: number } {
  return {
    x: centre + point.x * scale,
    y: centre - point.y * scale,
  };
}

export function radarPolygonPoints(
  points: readonly { x: number; y: number }[],
): string {
  return points
    .map((point) => {
      const svg = radarSvgPoint(point);
      return `${svg.x},${svg.y}`;
    })
    .join(" ");
}
