import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AtlasProvider, useAtlas } from "../store";
import { OverviewView } from "./Overview";

function GovernanceTargetButton() {
  const { governanceTargets, saveGovernanceTargets } = useAtlas();
  return (
    <button
      onClick={() => void saveGovernanceTargets({ ...governanceTargets, documentation: 95 })}
    >
      Set documentation target
    </button>
  );
}

describe("OverviewView navigation", () => {
  it("reflects shared target changes without reverting to the default", async () => {
    render(
      <AtlasProvider isPreview>
        <GovernanceTargetButton />
        <OverviewView onOpen={vi.fn()} />
      </AtlasProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Set documentation target" }));
    expect(await screen.findByText(/^Target 95%/)).toBeVisible();
  });

  it("opens governance and access signals with actionable filters", () => {
    const onOpen = vi.fn();
    render(
      <AtlasProvider isPreview>
        <OverviewView onOpen={onOpen} />
      </AtlasProvider>,
    );
    expect(
      screen.getByText("Standard baseline: 70% for each governance pillar."),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /External access:/ }));
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tab: "access",
        focus: expect.objectContaining({
          filters: { risk: "external" },
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Needs attention:/ }));
    expect(onOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tab: "governance",
        focus: expect.objectContaining({
          governanceSection: "findings",
          filters: { section: "findings", category: "operations" },
        }),
      }),
    );
  });
});
