import { describe, expect, it } from "vitest";
import { LINEAGE_ARROW_TIP, LINEAGE_EDGE_CLEARANCE, lineageCurve } from "./map-geometry";

describe("lineage arrow clearance", () => {
  it.each([0.25, 0.5, 0.8, 1, 1.5, 2])("keeps the arrow tip outside item and object cards at zoom %s", (zoom) => {
    for (const width of [220, 224]) {
      for (const [source, target, side] of [
        [{ x: 0, y: 0 }, { x: 330, y: 100 }, "left"],
        [{ x: 330, y: 0 }, { x: 0, y: 100 }, "right"],
        [{ x: 0, y: 0 }, { x: 0, y: 150 }, "top"],
        [{ x: 0, y: 150 }, { x: 0, y: 0 }, "bottom"],
      ] as const) {
        const { path, end, label } = lineageCurve(source, target, width, 76, zoom);
        const clearance = side === "left" ? target.x - end.x
          : side === "right" ? end.x - target.x - width
            : side === "top" ? target.y - end.y : end.y - target.y - 76;
        expect(clearance * zoom).toBeCloseTo(LINEAGE_EDGE_CLEARANCE * Math.max(1, zoom));
        expect(path.endsWith(`${end.x},${end.y}`)).toBe(true);
        expect(Number.isFinite(label.x)).toBe(true);
        expect(Number.isFinite(label.y)).toBe(true);
        expect(LINEAGE_ARROW_TIP).toBe(7);
      }
    }
  });
});
