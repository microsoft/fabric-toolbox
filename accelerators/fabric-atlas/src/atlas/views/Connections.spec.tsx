import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AtlasProvider } from "../store";
import { ConnectionsView } from "./Connections";

async function renderView(onNavigate = vi.fn()) {
  render(
    <AtlasProvider isPreview>
      <ConnectionsView onNavigate={onNavigate} />
    </AtlasProvider>,
  );
  await screen.findByRole("table");
  return onNavigate;
}

function rowNames(): string[] {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("button")[0].textContent ?? "");
}

describe("ConnectionsView", () => {
  it("lists the tenant inventory by urgency with the selected connection's evidence", async () => {
    const onNavigate = await renderView();

    const summary = screen.getByRole("region", { name: "Connection summary" });
    expect(within(summary).getByText("7 cloud · 1 through a gateway")).toBeInTheDocument();
    expect(rowNames()[0]).toBe("sql-booking-prod");
    expect(screen.getByText("1 to 8 of 8 connections")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "adls-partner-landing" }));
    const detail = screen.getByRole("region", { name: "Connection adls-partner-landing" });
    expect(within(detail).getByText("Key is not in the draft allowlist")).toBeInTheDocument();
    expect(within(detail).getByText("partner_lakehouse")).toBeInTheDocument();
    expect(within(detail).getByText(/AlpineRent Partners/)).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: /downstream items? in Map & lineage/ }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ tab: "map" }));
  });

  it("narrows to connections used by synchronized items and filters by flag", async () => {
    await renderView();

    fireEvent.click(screen.getByRole("button", { name: /Used by synced items/ }));
    expect(rowNames()).toHaveLength(4);
    expect(rowNames()).not.toContain("salesforce-crm");

    fireEvent.click(screen.getByRole("button", { name: /Whole tenant/ }));
    fireEvent.change(screen.getByLabelText("Flag"), { target: { value: "pending-owner" } });
    expect(rowNames()).toEqual(["sharepoint-ops"]);
    expect(screen.getByText("1 to 1 of 1 connections")).toBeInTheDocument();
  });

  it("compares with the previous inventory in the Changes tab", async () => {
    await renderView();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Changes/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Changes/ }));
    await waitFor(() => expect(screen.getByText("Removed connections")).toBeInTheDocument());
    expect(screen.getByText("ftp-legacy-tariffs")).toBeInTheDocument();
  });
});
