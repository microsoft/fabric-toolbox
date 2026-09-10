import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AtlasProvider } from "../store";
import { WorkspaceHubView } from "./WorkspaceHub";

describe("WorkspaceHubView", () => {
  it("supports keyboard navigation between configuration and notes", async () => {
    render(
      <AtlasProvider isPreview>
        <WorkspaceHubView />
      </AtlasProvider>,
    );

    const configuration = screen.getByRole("tab", {
      name: /Configuration/,
    });
    await act(async () => {
      configuration.focus();
      fireEvent.keyDown(configuration, { key: "ArrowRight" });
    });

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Team notes/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Team feed" }),
    ).toBeInTheDocument();
  });
});
