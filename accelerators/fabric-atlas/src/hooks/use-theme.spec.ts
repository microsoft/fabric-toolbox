import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useAppTheme } from "./use-theme";

describe("useAppTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });

  it("defaults to light and persists an explicit dark preference", async () => {
    const { result } = renderHook(() => useAppTheme());

    expect(result.current.isDark).toBe(false);
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(false),
    );

    act(() => result.current.toggleTheme());

    expect(result.current.isDark).toBe(true);
    await waitFor(() =>
      expect(localStorage.getItem("atlas.theme.v2")).toBe("dark"),
    );
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("restores a saved dark preference", () => {
    localStorage.setItem("atlas.theme.v2", "dark");

    const { result } = renderHook(() => useAppTheme());

    expect(result.current.isDark).toBe(true);
  });
});
