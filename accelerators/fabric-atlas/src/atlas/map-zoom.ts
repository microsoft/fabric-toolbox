/** Graph scale used on first render and restored by Reset. */
export const DEFAULT_MAP_ZOOM = 0.8;
export const MIN_MAP_ZOOM = 0.55;
export const MAX_MAP_ZOOM = 1.35;
const ZOOM_STEP = 0.1;

/** Steps the graph scale by 10%, rounded so repeated steps stay on whole percents. */
export function stepMapZoom(value: number, direction: 1 | -1): number {
  const next = Math.round((value + direction * ZOOM_STEP) * 100) / 100;
  return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, next));
}
