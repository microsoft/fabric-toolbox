import type { Health } from "./model";

export function summarizeHealth(items: readonly { health: Health }[]) {
  const counts: Record<Health, number> = {
    healthy: 0,
    stale: 0,
    failing: 0,
    unknown: 0,
  };
  for (const item of items) counts[item.health] += 1;
  const assessed = items.length - counts.unknown;
  return {
    ...counts,
    total: items.length,
    assessed,
    healthPercentage: assessed ? Math.round((counts.healthy / assessed) * 100) : null,
    coveragePercentage: items.length ? Math.round((assessed / items.length) * 100) : null,
  };
}
