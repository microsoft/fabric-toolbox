import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  displayPreferenceKey,
  isDisplayDensity,
  useDisplayPreference,
} from "./display-preferences";

describe("personal display preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("persists density only for the matching user and workspace", () => {
    const { result, rerender } = renderHook(
      ({ userId, workspaceId }) =>
        useDisplayPreference(userId, workspaceId, "density", "comfortable", isDisplayDensity),
      { initialProps: { userId: "user-a", workspaceId: "workspace-a" } },
    );
    act(() => result.current.setValue("compact"));
    expect(result.current.value).toBe("compact");
    rerender({ userId: "user-b", workspaceId: "workspace-a" });
    expect(result.current.value).toBe("comfortable");
    rerender({ userId: "user-a", workspaceId: "workspace-b" });
    expect(result.current.value).toBe("comfortable");
    rerender({ userId: "user-a", workspaceId: "workspace-a" });
    expect(result.current.value).toBe("compact");
  });

  it("reports invalid stored values instead of applying them", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    localStorage.setItem(displayPreferenceKey("u", "w", "density"), '"tiny"');
    const { result } = renderHook(() =>
      useDisplayPreference("u", "w", "density", "comfortable", isDisplayDensity),
    );
    expect(result.current.value).toBe("comfortable");
    expect(result.current.error).toContain("could not be loaded");
    expect(warn).toHaveBeenCalled();
  });

  it("reloads a previous scope after another tab changes its preference", () => {
    const { result, rerender } = renderHook(
      ({ userId }) =>
        useDisplayPreference(userId, "w", "density", "comfortable", isDisplayDensity),
      { initialProps: { userId: "a" } },
    );
    act(() => result.current.setValue("compact"));
    rerender({ userId: "b" });
    localStorage.setItem(displayPreferenceKey("a", "w", "density"), '"comfortable"');
    act(() => window.dispatchEvent(new StorageEvent("storage", {
      key: displayPreferenceKey("a", "w", "density"),
    })));
    rerender({ userId: "a" });
    expect(result.current.value).toBe("comfortable");
  });

  it("keeps an explicitly unsaved preference usable when storage is blocked", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { result } = renderHook(() =>
      useDisplayPreference("u", "w", "density", "comfortable", isDisplayDensity),
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is blocked", "SecurityError");
    });
    act(() => result.current.setValue("compact"));
    expect(result.current.value).toBe("compact");
    expect(result.current.error).toContain("could not be saved");
    expect(warn).toHaveBeenCalled();
  });
});
