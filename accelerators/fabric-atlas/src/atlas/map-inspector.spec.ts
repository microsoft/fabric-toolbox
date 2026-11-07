import { describe, expect, it } from "vitest";
import {
  MAP_INSPECTOR_MAX_WIDTH,
  MAP_INSPECTOR_MIN_WIDTH,
  clampMapInspectorWidth,
  isMapInspectorWidth,
  mapInspectorMaxWidth,
} from "./map-inspector";

describe("map inspector sizing", () => {
  it("validates only supported persisted widths", () => {
    expect(isMapInspectorWidth(MAP_INSPECTOR_MIN_WIDTH)).toBe(true);
    expect(isMapInspectorWidth(MAP_INSPECTOR_MAX_WIDTH)).toBe(true);
    expect(isMapInspectorWidth(MAP_INSPECTOR_MIN_WIDTH - 1)).toBe(false);
    expect(isMapInspectorWidth(MAP_INSPECTOR_MAX_WIDTH + 1)).toBe(false);
    expect(isMapInspectorWidth("360")).toBe(false);
  });

  it("preserves useful graph space when the viewport narrows", () => {
    expect(mapInspectorMaxWidth(1600)).toBe(MAP_INSPECTOR_MAX_WIDTH);
    expect(mapInspectorMaxWidth(1100)).toBe(620);
    expect(mapInspectorMaxWidth(600)).toBe(MAP_INSPECTOR_MIN_WIDTH);
    expect(clampMapInspectorWidth(700, 1100)).toBe(620);
    expect(clampMapInspectorWidth(200, 1600)).toBe(MAP_INSPECTOR_MIN_WIDTH);
  });
});
