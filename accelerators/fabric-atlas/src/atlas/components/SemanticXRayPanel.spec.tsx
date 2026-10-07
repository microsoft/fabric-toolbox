import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA } from "../model";
import { xrayObjectKey } from "../semantic-xray";
import { AtlasProvider } from "../store";
import { SemanticXRayPanel } from "./SemanticXRayPanel";

function renderPanel(url = "/?view=xray#map") {
  window.history.replaceState(null, "", url);
  return render(
    <AtlasProvider isPreview>
      <SemanticXRayPanel />
    </AtlasProvider>,
  );
}

function table(name: string) {
  return within(screen.getByRole("list", { name: "Model objects by table" }))
    .getAllByRole("button", { expanded: undefined })
    .find((button) => button.getAttribute("aria-expanded") !== null && button.textContent?.includes(name))!;
}

describe("SemanticXRayPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts with every table collapsed and counts the complete model", () => {
    renderPanel();

    const objectList = screen.getByRole("list", { name: "Model objects by table" });
    const tables = within(objectList)
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-expanded"));
    expect(tables.length).toBeGreaterThan(1);
    expect(tables.every((button) => button.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(objectList).toHaveClass("overflow-y-auto");
    expect(table("revenue_by_month").closest("li")).toHaveClass("shrink-0");
    expect(screen.getByText(/Open a table and select an object to trace collected DAX references/)).toBeInTheDocument();
    expect(screen.getByText(/Report visual usage and runtime queries/)).toBeInTheDocument();
    const model = SAMPLE_DATA.items.find((item) => item.itemType === "SemanticModel")!;
    const measures = (SAMPLE_DATA.schema?.[model.fabricId] ?? []).reduce(
      (sum, entry) => sum + entry.measures.length,
      0,
    );
    expect(screen.getAllByText("Measures")[0].previousSibling).toHaveTextContent(String(measures));
  });

  it("traces dependencies and keeps unresolved references explicit", () => {
    renderPanel();

    fireEvent.click(table("revenue_by_month"));
    fireEvent.click(screen.getByRole("button", { name: /Revenue MoM %/ }));

    const detail = screen.getByRole("complementary", { name: "X-Ray object evidence" });
    expect(detail).toHaveTextContent("Depends on · 1");
    expect(within(detail).getByRole("button", { name: "revenue_by_month [Monthly Revenue]" })).toBeInTheDocument();
    expect(detail).toHaveTextContent("[PM] · unresolved");
    expect(detail).toHaveTextContent(
      "No DAX consumers in this model. Report and visual usage is not exposed by Fabric APIs, so this does not mean unused.",
    );
  });

  it("explains direction and scope and supports arrow-key radio navigation", async () => {
    renderPanel();
    const usedBy = screen.getByRole("radio", { name: "Used by" });
    expect(usedBy).toHaveAttribute("title", "Consumers that reference the selected object");
    await act(async () => {
      usedBy.focus();
      fireEvent.keyDown(usedBy, { key: "ArrowLeft" });
    });
    expect(screen.getByRole("radio", { name: "Depends on" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Depends on" })).toHaveAttribute("aria-checked", "true");
    expect(usedBy).toHaveAttribute("tabindex", "-1");
    await act(async () => {
      screen.getByRole("radio", { name: "Direct" }).focus();
      fireEvent.keyDown(screen.getByRole("radio", { name: "Direct" }), { key: "End" });
    });
    expect(screen.getByRole("radio", { name: "Transitive" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Transitive" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps the evidence column and a useful empty search state", () => {
    const { container } = renderPanel();
    fireEvent.change(screen.getByRole("textbox", { name: "Search measures and columns" }), { target: { value: "no such collected object" } });
    expect(screen.getByText(/No measures or columns match this search/)).toBeVisible();
    expect(screen.getByRole("complementary", { name: "X-Ray object evidence" })).toBeVisible();
    expect(container.querySelector(".atlas-xray-workbench")).toBeInTheDocument();
  });

  it("highlights consumers without reordering rows", () => {
    const { container } = renderPanel();
    fireEvent.click(table("revenue_by_month"));
    const order = () =>
      [...container.querySelectorAll("[data-object-key]")].map((row) =>
        row.getAttribute("data-object-key"),
      );
    const before = order();

    fireEvent.click(screen.getByRole("button", { name: /^fxMonthly Revenue/ }));

    expect(screen.getByRole("button", { name: /Revenue MoM %.*Used by · 1 hop/ })).toBeInTheDocument();
    expect(order()).toEqual(before);
  });

  it("expands matching tables while searching and restores shared view state", () => {
    const model = SAMPLE_DATA.items.find((item) => item.itemType === "SemanticModel")!;
    const key = xrayObjectKey("measure", "rentals_daily_summary", "Total Rentals");
    renderPanel(
      `/?view=xray&xray.model=${model.fabricId}&xray.object=${encodeURIComponent(key)}&xray.scope=transitive#map`,
    );

    expect(
      screen.getByRole("complementary", { name: "X-Ray object evidence" }),
    ).toHaveTextContent("Total Rentals");
    expect(screen.getByRole("radio", { name: "Transitive" })).toHaveAttribute("aria-checked", "true");

    fireEvent.change(screen.getByRole("textbox", { name: "Search measures and columns" }), {
      target: { value: "total_rentals" },
    });

    expect(table("rentals_daily_summary")).toHaveAttribute("aria-expanded", "true");
    expect(new URL(window.location.href).searchParams.get("xray.q")).toBe("total_rentals");
  });

  it("exports dependency evidence and states deferred ontology capabilities", async () => {
    let exported = "";
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      void (blob as Blob).text().then((text) => {
        exported = text;
      });
      return "blob:xray";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    renderPanel();
    fireEvent.click(table("revenue_by_month"));
    fireEvent.click(screen.getByRole("button", { name: /Revenue MoM %/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Export dependency evidence" }));
    });

    expect(exported).toContain("# AlpineRent Sales Model: revenue\\_by\\_month [Revenue MoM %]");
    const capabilities = screen.getByText("Lineage depth capability states").closest("details")!;
    expect(capabilities).toHaveTextContent("Ontology metrics deferred · 2026-10-02");
    expect(capabilities).toHaveTextContent("Ontology entity inheritance deferred · 2026-10-02");
  });
});
