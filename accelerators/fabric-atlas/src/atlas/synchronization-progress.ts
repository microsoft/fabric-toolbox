// Browser synchronization milestones grouped into the run states shared with
// the planned durable model: discovering, collecting, validating, publishing.
export const SYNC_PHASES = [
  {
    label: "Discover",
    activeLabel: "Discovering",
    threshold: 0,
    detail: "Authorize access and read the workspace topology",
  },
  {
    label: "Collect",
    activeLabel: "Collecting",
    threshold: 20,
    detail: "Collect item metadata by item type",
  },
  {
    label: "Validate",
    activeLabel: "Validating",
    threshold: 60,
    detail: "Validate the payload and build the governance catalog",
  },
  {
    label: "Publish",
    activeLabel: "Publishing",
    threshold: 70,
    detail: "Write the snapshot, then publish its manifest last",
  },
] as const;

/** Stage reported while an abort is propagating to the running request. */
export const CANCELLING_STAGE = "Cancelling synchronization";

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
