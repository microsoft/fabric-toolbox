import type { WorkspaceInfo } from "./model";

export function workspaceDetailLabel(workspace: WorkspaceInfo): string {
  const capacity = workspace.capacity?.trim() ?? "";
  const region = workspace.region?.trim() ?? "";
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  return [
    !capacity || isUuid(capacity) ? undefined : capacity,
    !region ||
    isUuid(region) ||
    capacity.toLowerCase().includes(region.toLowerCase())
      ? undefined
      : region,
  ]
    .filter(Boolean)
    .join(" · ");
}
