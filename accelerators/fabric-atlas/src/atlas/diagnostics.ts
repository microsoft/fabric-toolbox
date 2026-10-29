export const ATLAS_DIAGNOSTIC_NAMES = [
  "atlas.hydration",
  "atlas.sync.collect",
  "atlas.sync.persist",
  "atlas.xray.build",
  "atlas.object-lineage.build",
] as const;

export type AtlasDiagnosticName =
  (typeof ATLAS_DIAGNOSTIC_NAMES)[number];

export interface AtlasDiagnosticSummary {
  name: AtlasDiagnosticName;
  count: number;
  latestMs: number;
  averageMs: number;
  maximumMs: number;
}

export function diagnosticStart(): number {
  return typeof performance === "undefined" ? 0 : performance.now();
}

export function recordDiagnostic(
  name: AtlasDiagnosticName,
  startedAt: number,
): void {
  if (typeof performance === "undefined" || startedAt <= 0) return;
  const endedAt = performance.now();
  performance.measure(name, {
    start: startedAt,
    end: endedAt,
  });
}

export async function measureDiagnostic<T>(
  name: AtlasDiagnosticName,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = diagnosticStart();
  try {
    return await operation();
  } finally {
    recordDiagnostic(name, startedAt);
  }
}

export function atlasDiagnosticSummaries(): AtlasDiagnosticSummary[] {
  if (typeof performance === "undefined") return [];
  return ATLAS_DIAGNOSTIC_NAMES.flatMap((name) => {
    const entries = performance.getEntriesByName(name, "measure");
    if (entries.length === 0) return [];
    const durations = entries.map((entry) => entry.duration);
    return [
      {
        name,
        count: entries.length,
        latestMs: durations.at(-1) ?? 0,
        averageMs:
          durations.reduce((total, duration) => total + duration, 0) /
          durations.length,
        maximumMs: Math.max(...durations),
      },
    ];
  });
}

export function clearAtlasDiagnostics(): void {
  if (typeof performance === "undefined") return;
  for (const name of ATLAS_DIAGNOSTIC_NAMES) {
    performance.clearMeasures(name);
  }
}
