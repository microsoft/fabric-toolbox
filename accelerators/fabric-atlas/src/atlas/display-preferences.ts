import { useCallback, useEffect, useState } from "react";

export type DisplayDensity = "comfortable" | "compact";
export type CatalogLayout = "cards" | "table";
export type DisplayPreferenceName = "density" | "catalog-layout" | "map-inspector-width";

export const isDisplayDensity = (value: unknown): value is DisplayDensity =>
  value === "comfortable" || value === "compact";

export const isCatalogLayout = (value: unknown): value is CatalogLayout =>
  value === "cards" || value === "table";

export function displayPreferenceKey(
  userId: string,
  workspaceId: string,
  name: DisplayPreferenceName,
): string {
  return ["atlas.display.v1", userId, workspaceId, name]
    .map(encodeURIComponent)
    .join(":");
}

interface PreferenceState<T> {
  key: string;
  value: T;
  error?: string;
}

function readPreference<T>(
  key: string,
  initialValue: T,
  validate: (value: unknown) => value is T,
): PreferenceState<T> {
  if (typeof window === "undefined") return { key, value: initialValue };
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return { key, value: initialValue };
    const value: unknown = JSON.parse(raw);
    if (!validate(value)) throw new Error("Invalid display preference");
    return { key, value };
  } catch (error) {
    console.warn("[atlas] unable to read display preference", error);
    return {
      key,
      value: initialValue,
      error: "The saved display setting could not be loaded. The default is shown.",
    };
  }
}

export function useDisplayPreference<T>(
  userId: string,
  workspaceId: string,
  name: DisplayPreferenceName,
  initialValue: T,
  validate: (value: unknown) => value is T,
) {
  const key = displayPreferenceKey(userId, workspaceId, name);
  const [state, setState] = useState<PreferenceState<T>>(() =>
    readPreference(key, initialValue, validate),
  );
  const current =
    state.key === key ? state : readPreference(key, initialValue, validate);
  if (state.key !== key) setState(current);

  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        setState(readPreference(key, initialValue, validate));
      }
    };
    window.addEventListener("storage", receive);
    return () => window.removeEventListener("storage", receive);
  }, [key, initialValue, validate]);

  const setValue = useCallback(
    (value: T) => {
      if (!validate(value)) throw new Error("Invalid display preference");
      let error: string | undefined;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (cause) {
        console.warn("[atlas] unable to save display preference", cause);
        error = "This display setting applies now but could not be saved for your next visit.";
      }
      setState({ key, value, error });
    },
    [key, validate],
  );

  return { value: current.value, setValue, error: current.error };
}
