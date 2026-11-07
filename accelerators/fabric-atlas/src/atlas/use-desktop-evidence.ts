import { useSyncExternalStore } from "react";

function desktopMedia() {
  const breakpoint = getComputedStyle(document.documentElement)
    .getPropertyValue("--atlas-evidence-breakpoint").trim();
  return window.matchMedia(breakpoint ? `(min-width: ${breakpoint})` : "not all");
}

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const media = desktopMedia();
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function snapshot() {
  return typeof window.matchMedia !== "function" || desktopMedia().matches;
}

export function useDesktopEvidence(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
