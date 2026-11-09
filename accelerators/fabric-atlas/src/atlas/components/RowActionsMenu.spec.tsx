import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RowActionsMenu } from "./RowActionsMenu";

function renderMenu() {
  const first = vi.fn();
  const blocked = vi.fn();
  render(
    <>
      <RowActionsMenu
        label="Actions for Sales"
        actions={[
          { id: "first", label: "Synchronize now", onSelect: first },
          {
            id: "blocked",
            label: "Open in Atlas",
            onSelect: blocked,
            disabled: true,
            disabledReason: "Paused until the current run finishes",
          },
          { id: "fabric", label: "Open in Fabric", href: "https://app.fabric.microsoft.com/groups/x" },
        ]}
      />
      <button type="button">Outside</button>
    </>,
  );
  return { first, blocked };
}

describe("RowActionsMenu", () => {
  it("opens from the keyboard and moves focus with arrow, Home and End keys", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Actions for Sales" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const menu = screen.getByRole("menu", { name: "Actions for Sales" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveFocus();

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "End" });
    expect(items[2]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(items[2]).toHaveFocus();
    fireEvent.keyDown(menu, { key: "Home" });
    expect(items[0]).toHaveFocus();

    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("opens on the last item with ArrowUp", () => {
    renderMenu();
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for Sales" }),
      { key: "ArrowUp" },
    );
    expect(screen.getByRole("menuitem", { name: "Open in Fabric" })).toHaveFocus();
  });

  it("runs enabled actions, keeps disabled actions inert and announces why", () => {
    const { first, blocked } = renderMenu();
    const trigger = screen.getByRole("button", { name: "Actions for Sales" });
    fireEvent.click(trigger);

    const disabled = screen.getByRole("menuitem", { name: "Open in Atlas" });
    expect(disabled).toHaveAttribute("aria-disabled", "true");
    expect(disabled).toHaveAccessibleDescription(
      "Paused until the current run finishes",
    );
    fireEvent.click(disabled);
    expect(blocked).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();

    const external = screen.getByRole("menuitem", { name: "Open in Fabric" });
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noreferrer");

    fireEvent.click(screen.getByRole("menuitem", { name: "Synchronize now" }));
    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("closes when the pointer goes down outside the menu", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Sales" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders nothing when a row has no available action", () => {
    const { container } = render(
      <RowActionsMenu label="Actions for Sales" actions={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
