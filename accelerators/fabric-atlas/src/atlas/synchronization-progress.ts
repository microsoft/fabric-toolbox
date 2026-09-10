export const SYNC_PHASES = [
  { label: "Connect", threshold: 0 },
  { label: "Discover", threshold: 8 },
  { label: "Map", threshold: 62 },
  { label: "Persist", threshold: 70 },
  { label: "Finalize", threshold: 97 },
] as const;

export function syncPhaseIndex(progress: number): number {
  const normalized = Math.min(100, Math.max(0, progress));
  let phaseIndex = 0;
  for (let index = 1; index < SYNC_PHASES.length; index += 1) {
    if (normalized < SYNC_PHASES[index].threshold) break;
    phaseIndex = index;
  }
  return phaseIndex;
}

export function formatSyncElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}
