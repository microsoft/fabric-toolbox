import { urlForNavigation } from "./routing";

/** Governance Center Change Center URL for one snapshot comparison. */
export function changeCenterUrl(
  location: Pick<Location, "pathname" | "search">,
  baselineSnapshotId: string,
  currentSnapshotId: string,
  search?: string,
): string {
  return urlForNavigation(location, {
    tab: "governance",
    focus: {
      requestId: crypto.randomUUID(),
      governanceSection: "changes",
      filters: {
        section: "changes",
        currentSnapshotId,
        previousSnapshotId: baselineSnapshotId,
        ...(search ? { changeSearch: search } : {}),
      },
    },
  });
}

/** Navigates in-app; App listens for `popstate` and restores the focus. */
export function openChangeCenter(url: string): void {
  window.history.pushState(null, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
