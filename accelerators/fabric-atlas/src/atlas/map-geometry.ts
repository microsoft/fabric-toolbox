export interface GraphPoint { x: number; y: number }

export const LINEAGE_ARROW_TIP = 7;
export const LINEAGE_EDGE_CLEARANCE = 4;

export function lineageCurve(
  source: GraphPoint, target: GraphPoint, width: number, height: number, zoom = 1,
): { path: string; end: GraphPoint; label: GraphPoint } {
  const gap = LINEAGE_EDGE_CLEARANCE / Math.min(1, Math.max(zoom, 0.1));
  const horizontal = target.x >= source.x + width || target.x + width <= source.x;
  const forward = horizontal ? target.x > source.x : target.y >= source.y;
  const sign = forward ? 1 : -1;
  const start = horizontal
    ? { x: source.x + (forward ? width : 0), y: source.y + height / 2 }
    : { x: source.x + width / 2, y: source.y + (forward ? height : 0) };
  const end = horizontal
    ? { x: target.x + (forward ? 0 : width) - sign * gap, y: target.y + height / 2 }
    : { x: target.x + width / 2, y: target.y + (forward ? 0 : height) - sign * gap };
  const bend = Math.max(42, Math.abs(horizontal ? end.x - start.x : end.y - start.y) * 0.32);
  const first = horizontal ? { x: start.x + sign * bend, y: start.y } : { x: start.x, y: start.y + sign * bend };
  const last = horizontal ? { x: end.x - sign * bend, y: end.y } : { x: end.x, y: end.y - sign * bend };
  const label = {
    x: (start.x + 3 * first.x + 3 * last.x + end.x) / 8,
    y: (start.y + 3 * first.y + 3 * last.y + end.y) / 8,
  };
  return {
    path: `M${start.x},${start.y} C${first.x},${first.y} ${last.x},${last.y} ${end.x},${end.y}`,
    end,
    label,
  };
}
