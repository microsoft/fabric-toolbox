import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasData } from "../model";
import { SemanticXRayPanel } from "./SemanticXRayPanel";

const data: AtlasData = {
  workspace: { fabricId: "workspace", displayName: "Large model workspace", region: "", capacity: "" },
  items: [{ fabricId: "model", displayName: "Large model", itemType: "SemanticModel", health: "unknown", endorsement: "none", tags: [] }],
  schema: {
    model: Array.from({ length: 120 }, (_, index) => ({
      name: `Table ${String(index).padStart(3, "0")}`,
      columns: [{ name: `Value${index}`, dataType: "Int64" }],
      measures: [{ name: `Total${index}`, expr: `SUM('Table ${String(index).padStart(3, "0")}'[Value${index}])` }],
    })),
  },
  edges: [], grants: [], principals: [], jobs: [], config: [], comments: [], syncRuns: [],
};
vi.mock("../store", () => ({ useAtlas: () => ({ data }) }));

beforeEach(() => { window.history.replaceState(null, "", "/?view=xray#map"); });

describe("large semantic model layout", () => {
  it("keeps all 120 groups non-shrinking in a bounded scroll list with independent evidence", () => {
    const { container } = render(<SemanticXRayPanel />);
    const list = screen.getByRole("list", { name: "Model objects by table" });
    expect(list.children).toHaveLength(120);
    for (const group of list.children) {
      expect(group).toHaveClass("shrink-0");
      expect(within(group as HTMLElement).getByRole("button")).toHaveClass("min-h-[var(--atlas-touch-target)]");
      expect(within(group as HTMLElement).getByRole("button")).toHaveAttribute("aria-expanded", "false");
    }
    expect(list).toHaveClass("overflow-y-auto");
    expect(container.querySelector(".atlas-xray-workbench")?.children).toHaveLength(2);
    expect(screen.getByRole("complementary", { name: "X-Ray object evidence" })).toHaveClass("overflow-y-auto");

    fireEvent.click(within(list).getByRole("button", { name: /^Table 119/ }));
    fireEvent.click(within(list).getByRole("button", { name: /^fxTotal119/ }));
    expect(screen.getByRole("complementary", { name: "X-Ray object evidence" })).toHaveTextContent("Total119");
    expect(list.children).toHaveLength(120);
    expect(list.lastElementChild).toHaveClass("shrink-0");
    const css = readFileSync(resolve(process.cwd(), "src", "global.css"), "utf8");
    expect(css).toMatch(/--atlas-touch-target:\s*44px/);
    expect(css).toMatch(/--atlas-xray-min-height:\s*320px/);
    expect(css).toMatch(/\.atlas-xray-workbench\s*\{[^}]*min-height:\s*var\(--atlas-xray-min-height\)/);
  });

  it("expands only search matches and keeps their rows readable", () => {
    render(<SemanticXRayPanel />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search measures and columns" }), { target: { value: "Value119" } });
    const list = screen.getByRole("list", { name: "Model objects by table" });
    expect(list.children).toHaveLength(1);
    expect(within(list).getByRole("button", { name: /^Table 119/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(list).getByRole("button", { name: /^colValue119/ })).toHaveClass("min-h-[var(--atlas-touch-target)]");
  });
});
