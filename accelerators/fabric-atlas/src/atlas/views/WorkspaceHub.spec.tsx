import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AtlasProvider } from "../store";
import { WorkspaceHubView } from "./WorkspaceHub";
import { ConfigView } from "./Config";
import { SAMPLE_DATA } from "../model";

function renderHub(props: Parameters<typeof WorkspaceHubView>[0] = {}) {
  return render(
    <AtlasProvider isPreview>
      <WorkspaceHubView {...props} />
    </AtlasProvider>,
  );
}

describe("WorkspaceHubView", () => {
  it("opens on Synchronization with the four hub sections in order", () => {
    const onStateChange = vi.fn();
    renderHub({ onStateChange });

    expect(
      screen.getByRole("heading", { level: 1, name: "Workspace Hub" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tablist", { name: "Workspace Hub sections" })).toHaveClass("atlas-line-tabs");
    expect(screen.getByRole("switch", { name: "Scheduled synchronization" })).toBeDisabled();
    expect(screen.getByText(/Runs are manual and execute in the synchronizer's browser tab/)).toBeInTheDocument();
    expect(screen.queryByText(/in the background|schedule enabled/i)).toBeNull();
    expect(
      screen
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Workspace", "Synchronization", "Configuration", "Team notes"]);
    expect(
      screen.getByRole("tab", { name: "Synchronization" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("heading", { name: "Selected workspaces" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recent synchronization runs" }),
    ).toBeInTheDocument();
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tab: "workspace",
        focus: expect.objectContaining({ workspaceSection: "synchronization" }),
      }),
    );
  });

  it("supports keyboard navigation across every hub section", async () => {
    renderHub();

    const synchronization = screen.getByRole("tab", {
      name: "Synchronization",
    });
    await act(async () => {
      synchronization.focus();
      fireEvent.keyDown(synchronization, { key: "ArrowLeft" });
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Workspace" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Active workspace" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Active workspace" }),
    ).toBeNull();
    expect(
      screen.getByText(/Only one workspace is in the shared Atlas scope/),
    ).toBeInTheDocument();

    const workspace = screen.getByRole("tab", { name: "Workspace" });
    await act(async () => {
      fireEvent.keyDown(workspace, { key: "End" });
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Team notes" })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Team feed" }),
    ).toBeInTheDocument();
  });

  it("honours routed sections", () => {
    renderHub({
      focus: { requestId: "route", workspaceSection: "configuration" },
    });

    expect(
      screen.getByRole("tab", { name: "Configuration" }),
    ).toHaveAttribute("aria-selected", "true");
  });
  it("replaces a carried configuration item target with an item in the current workspace", () => {
    const onSelectedItemChange = vi.fn();
    const foreign = "20000000-0000-4000-8000-000000000001";
    render(
      <AtlasProvider isPreview>
        <ConfigView embedded focus={{ requestId: "carried-config", itemId: foreign }} onSelectedItemChange={onSelectedItemChange} />
      </AtlasProvider>,
    );
    expect(onSelectedItemChange).not.toHaveBeenCalledWith(foreign);
    expect(SAMPLE_DATA.items.some((item) => item.fabricId === onSelectedItemChange.mock.lastCall?.[0])).toBe(true);
  });
});
