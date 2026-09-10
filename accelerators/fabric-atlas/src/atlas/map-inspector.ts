export const MAP_INSPECTOR_DEFAULT_WIDTH = 360;
export const MAP_INSPECTOR_MIN_WIDTH = 320;
export const MAP_INSPECTOR_MAX_WIDTH = 760;
export const MAP_INSPECTOR_KEYBOARD_STEP = 16;

const MAP_MIN_CANVAS_WIDTH = 480;

export const isMapInspectorWidth = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= MAP_INSPECTOR_MIN_WIDTH &&
  value <= MAP_INSPECTOR_MAX_WIDTH;

export function mapInspectorMaxWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return MAP_INSPECTOR_MAX_WIDTH;
  return Math.min(
    MAP_INSPECTOR_MAX_WIDTH,
    Math.max(MAP_INSPECTOR_MIN_WIDTH, Math.floor(viewportWidth - MAP_MIN_CANVAS_WIDTH)),
  );
}

export function clampMapInspectorWidth(
  width: number,
  viewportWidth: number,
): number {
  return Math.min(
    mapInspectorMaxWidth(viewportWidth),
    Math.max(MAP_INSPECTOR_MIN_WIDTH, Math.round(width)),
  );
}
