import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AboutView } from "./About";

describe("AboutView", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("shows the concise project and runtime summary from main", () => {
    render(<AboutView />);

    expect(screen.getByRole("heading", { name: "Fabric Atlas" })).toBeVisible();
    expect(screen.getByText("Open source")).toBeVisible();
    expect(screen.getByText("MIT licensed")).toBeVisible();
    expect(screen.getByText("Rayfin SDK")).toBeVisible();
    expect(screen.getByText("1.36.2")).toBeVisible();
    expect(screen.getByText("Functions API")).toBeVisible();
    expect(screen.getByText("Snapshot")).toBeVisible();
    expect(
      screen.getByText(
        "Rayfin collectors with Python compatibility, browser-run",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Enabled")).toBeNull();
    expect(screen.queryByText("Disabled")).toBeNull();
    expect(
      screen.queryByText("Fabric Apps backend Functions"),
    ).toBeNull();
  });

  it("copies the real repository clone command", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<AboutView />);

    fireEvent.click(screen.getByRole("button", { name: "Copy clone command" }));

    expect(writeText).toHaveBeenCalledWith(
      "git clone https://github.com/fredgis/FabricAtlas.git",
    );
  });

  it("reports the explicit Python rollback", () => {
    vi.stubEnv("VITE_ATLAS_COLLECTOR_ROLLBACK", "true");
    render(<AboutView />);
    expect(screen.getByText("Python rollback, browser-run")).toBeVisible();
  });
});
