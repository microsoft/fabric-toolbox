import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  MAP_INSPECTOR_DEFAULT_WIDTH,
  MAP_INSPECTOR_MAX_WIDTH,
  MAP_INSPECTOR_MIN_WIDTH,
} from "../map-inspector";
import { ResizableInspector } from "./ResizableInspector";

describe("ResizableInspector", () => {
  it("supports keyboard resizing and viewport-aware clamping", () => {
    vi.stubGlobal("innerWidth", 1100);
    const onWidthChange = vi.fn();
    render(
      <ResizableInspector
        width={MAP_INSPECTOR_DEFAULT_WIDTH}
        onWidthChange={onWidthChange}
      >
        <aside>Details</aside>
      </ResizableInspector>,
    );

    const separator = screen.getByRole("separator", {
      name: "Resize details inspector",
    });
    expect(separator).toHaveAttribute("aria-valuemax", "620");
    expect(separator).toHaveClass("hidden", "xl:flex");
    expect(separator.parentElement).toHaveClass(
      "w-full",
      "xl:w-[var(--atlas-inspector-width)]",
    );

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(onWidthChange).toHaveBeenLastCalledWith(376);

    fireEvent.keyDown(separator, { key: "End" });
    expect(onWidthChange).toHaveBeenLastCalledWith(620);

    fireEvent.keyDown(separator, { key: "Home" });
    expect(onWidthChange).toHaveBeenLastCalledWith(MAP_INSPECTOR_MIN_WIDTH);
    vi.unstubAllGlobals();
  });

  it("supports pointer resizing and exposes preference errors", () => {
    vi.stubGlobal("innerWidth", 1600);
    const onWidthChange = vi.fn();
    render(
      <ResizableInspector
        width={400}
        onWidthChange={onWidthChange}
        error="The saved display setting could not be loaded."
      >
        <aside>Details</aside>
      </ResizableInspector>,
    );

    const separator = screen.getByRole("separator", {
      name: "Resize details inspector",
    });
    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 400 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: -100 });
    expect(onWidthChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: -100 });
    expect(onWidthChange).toHaveBeenLastCalledWith(MAP_INSPECTOR_MAX_WIDTH);
    expect(screen.getByRole("status")).toHaveTextContent(
      "could not be loaded",
    );
    vi.unstubAllGlobals();
  });
});
