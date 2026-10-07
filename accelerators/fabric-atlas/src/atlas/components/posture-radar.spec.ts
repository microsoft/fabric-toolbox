// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderVisualToSvg } from "@microsoft/fabric-visuals/headless";
import { lightThemeColors } from "@microsoft/fabric-visuals-core";
import { POSTURE_PILLARS, type PillarScore } from "../posture";
import { posturePillarFromInteraction, postureRadarData, postureRadarSpec } from "./posture-radar";

const pillars: PillarScore[] = POSTURE_PILLARS.map((pillar, index) => ({
  pillar, score: [0, 25, 50, 75, 90, 100][index], target: 70, metrics: [], contributingFindings: 0,
}));
const palette = { low: "#e7aaaa", mid: "#ead092", high: "#b4dcb9" };

describe("posture radar geometry and spec", () => {
  it("plots every real pillar in fixed order with the score as its radial distance", () => {
    const data = postureRadarData([...pillars].reverse());
    expect(data.points.map((point) => point.pillar)).toEqual(POSTURE_PILLARS);
    data.points.forEach((point, index) => {
      expect(Math.hypot(point.x!, point.y!)).toBeCloseTo(pillars[index].score!);
    });
    expect(data.targets).toHaveLength(6);
    expect(data.targets.every((point) => Math.abs(Math.hypot(point.x, point.y) - 70) < 0.001)).toBe(true);
    expect([...new Set(data.rings.map((point) => point.level))]).toEqual([25, 50, 75, 100]);
    expect(data.outline).toHaveLength(6);
  });

  it("leaves unknown scores as gaps, including the polygon, without turning zero into N/A", () => {
    const input = pillars.map((pillar) => pillar.pillar === "sensitivity" ? { ...pillar, score: null } : pillar);
    const data = postureRadarData(input);
    expect(data.points[0]).toMatchObject({ score: 0, x: 0, y: 0, scoreText: "0%" });
    expect(data.points[2]).toMatchObject({ score: null, x: null, y: null, scoreText: "N/A (not assessed)" });
    expect(data.outline).toEqual([]);
    expect(data.segments.some((point) => point.pillar === "sensitivity")).toBe(false);
    expect(data.segments).toHaveLength(8);
    expect(data.labels[2].labelText).toBe("Sensitivity\nN/A");
    expect(postureRadarData(pillars, false).targets).toEqual([]);
    expect(postureRadarData([], false).points).toHaveLength(6);
    expect(postureRadarData([], false).points.every((point) => point.score === null)).toBe(true);
  });

  it("keeps numeric domains fixed and preserves a square radar on rectangular containers", () => {
    const spec = postureRadarSpec(pillars, "ownership", lightThemeColors, palette);
    expect(spec.encoding.x.scale.domain).toEqual([-150, 150]);
    expect(spec.encoding.y.scale.domain).toEqual([-150, 150]);
    expect(spec.encoding.x.scale.range[0].expr).toContain("min(width, height)");
    expect(spec.encoding.y.scale.range[0].expr).toContain("min(width, height)");
    const points = spec.layer.find((layer) => layer.mark.type === "point")!;
    expect(points.encoding.color?.scale).toEqual({ domain: [0, 50, 100], range: Object.values(palette) });
    expect(points.encoding.tooltip).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "scoreText" }), expect.objectContaining({ field: "targetText" }),
    ]));
  });

  it("renders a real six-spoke chart through Fabric Visuals without a browser", async () => {
    const spec = postureRadarSpec(pillars, "lineage", lightThemeColors, palette);
    const result = await renderVisualToSvg({ ...spec, width: 480, height: 360 }, {
      capabilities: {
        disableNiceAxisBounds: true, disablePointRangeInset: true,
        disableLineChartCrosshairTooltip: true, disableSelfHighlight: true,
        disableTextTruncation: true,
      },
    });
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(result.renderedMarkCountsByType.symbol).toBe(6);
    expect(result.svg).toContain("Documentation");
    expect(result.svg).toContain("stroke-dasharray=\"5,4\"");
    expect(result.svg).not.toMatch(/NaN|Infinity/);
  });

  it("accepts only explicit pillar selection predicates and retains details on clear", () => {
    expect(posturePillarFromInteraction([{
      action: "select", selections: [{ predicates: [
        { type: "set", name: "score", values: [50] },
        { type: "set", name: "pillar", values: ["lineage"] },
      ] }],
    }])).toBe("lineage");
    expect(posturePillarFromInteraction([{ action: "clear" }])).toBeUndefined();
    expect(posturePillarFromInteraction([{
      action: "select", selections: [{ predicates: [{ type: "set", name: "pillar", values: ["invented"] }] }],
    }])).toBeUndefined();
    expect(posturePillarFromInteraction([{
      action: "select", selections: [{ predicates: [{ type: "range", name: "pillar", min: 0, max: 100 }] }],
    }])).toBeUndefined();
  });
});
