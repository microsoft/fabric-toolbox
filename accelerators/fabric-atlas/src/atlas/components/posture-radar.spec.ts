// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POSTURE_PILLARS, type PillarScore } from "../posture";
import {
  postureRadarData,
  radarPolygonPoints,
  radarSvgPoint,
} from "./posture-radar";

const pillars: PillarScore[] = POSTURE_PILLARS.map((pillar, index) => ({
  pillar,
  score: [0, 25, 50, 75, 90, 100][index],
  target: 70,
  metrics: [],
  contributingFindings: 0,
}));

describe("posture radar geometry", () => {
  it("plots every real pillar in fixed order with the score as its radial distance", () => {
    const data = postureRadarData([...pillars].reverse());
    expect(data.points.map((point) => point.pillar)).toEqual(POSTURE_PILLARS);
    data.points.forEach((point, index) => {
      expect(Math.hypot(point.x!, point.y!)).toBeCloseTo(
        pillars[index].score!,
      );
    });
    expect(data.targets).toHaveLength(6);
    expect(
      data.targets.every(
        (point) =>
          Math.abs(Math.hypot(point.x, point.y) - 70) < 0.001,
      ),
    ).toBe(true);
    expect(data.rings.map((ring) => ring.level)).toEqual([
      25, 50, 75, 100,
    ]);
    expect(data.outline).toHaveLength(6);
  });

  it("anchors unknown scores at the centre while keeping the polygon closed", () => {
    const input = pillars.map((pillar) =>
      pillar.pillar === "sensitivity"
        ? { ...pillar, score: null }
        : pillar,
    );
    const data = postureRadarData(input);
    expect(data.points[0]).toMatchObject({
      score: 0,
      x: 0,
      y: 0,
      scoreText: "0%",
    });
    expect(data.points[2]).toMatchObject({
      score: null,
      x: 0,
      y: 0,
      scoreText: "N/A (not assessed)",
    });
    expect(data.outline).toHaveLength(6);
    expect(
      data.segments.some((point) => point.pillar === "sensitivity"),
    ).toBe(true);
    expect(data.segments).toHaveLength(12);
    expect(data.labels[2].labelText).toBe("Sensitivity\nN/A");
    expect(postureRadarData(pillars, false).targets).toEqual([]);
  });

  it("produces finite square SVG coordinates and polygon points", () => {
    const data = postureRadarData(pillars);
    const svg = data.points.map((point) =>
      radarSvgPoint(point as { x: number; y: number }),
    );
    expect(svg).toHaveLength(6);
    expect(
      svg.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      ),
    ).toBe(true);
    expect(radarPolygonPoints(data.outline)).not.toMatch(/NaN|Infinity/);
    expect(radarPolygonPoints(data.outline).split(" ")).toHaveLength(6);
  });
});
