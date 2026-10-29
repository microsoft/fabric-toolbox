import { useSyncExternalStore } from "react";

const STORAGE_KEY = "atlas.domainFilter";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setDomainFilter(value: string): void {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, value);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable in embedded browsers; the filter still applies for listeners.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Session-wide Fabric domain filter shared by the header and domain views ("" = all domains). */
export function useDomainFilter(): [string, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, read, () => "");
  return [value, setDomainFilter];
}
