import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeContext } from "@/hooks/theme.context";
import { AtlasProvider } from "../store";
import { FirstSyncView } from "./FirstSync";

describe("FirstSyncView", () => {
  it("shows the shared accessible synchronization progress display", () => {
    render(
      <ThemeContext.Provider
        value={{ isDark: false, toggleTheme: () => undefined }}
      >
        <AtlasProvider isPreview>
          <FirstSyncView />
        </AtlasProvider>
      </ThemeContext.Provider>,
    );

    expect(
      screen.getByRole("progressbar", {
        name: "Workspace synchronization progress",
      }),
    ).toHaveAttribute("aria-valuenow", "0");
    expect(
      screen.getByRole("region", {
        name: "Workspace synchronization status",
      }),
    ).toHaveTextContent("Phase 1 of 5");
    expect(
      screen.queryByLabelText(/Animated preview of Fabric lineage/),
    ).not.toBeInTheDocument();
  });
});
