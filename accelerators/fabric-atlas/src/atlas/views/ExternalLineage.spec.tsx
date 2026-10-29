import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AtlasProvider } from "../store";
import { createMemoryRepo } from "../external-lineage";
import { ExternalLineageProvider } from "../external-lineage-store";
import { ExternalLineageView } from "./ExternalLineage";

const EVENT = {
  eventType: "COMPLETE",
  eventTime: "2026-10-28T06:12:00Z",
  producer: "https://example.com/source",
  schemaURL: "https://openlineage.io/spec/2-0-2/OpenLineage.json#/definitions/RunEvent",
  run: { runId: "0190a1b2-0000-7000-8000-000000000001" },
  job: { namespace: "source://prod", name: "pricing.daily" },
  inputs: [{ namespace: "oracle://crm:1521", name: "CRM.MEMBERS" }],
  outputs: [{ namespace: "postgres://pricing:5432", name: "pricing.daily_rates" }],
};

function renderView() {
  render(
    <AtlasProvider isPreview>
      <ExternalLineageProvider repo={createMemoryRepo()}>
        <ExternalLineageView />
      </ExternalLineageProvider>
    </AtlasProvider>,
  );
}

function upload(name: string, text: string, label?: string) {
  const file = new File([text], name, { type: "application/json" });
  fireEvent.change(screen.getByTestId("external-file-input"), { target: { files: [file] } });
  const dialog = screen.getByRole("dialog");
  if (label !== undefined) fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: label } });
  fireEvent.click(within(dialog).getByRole("button", { name: /^(Import|Replace)$/ }));
}

afterEach(() => vi.restoreAllMocks());

describe("ExternalLineageView", () => {
  it("imports an OpenLineage file and lists it with its datasets", async () => {
    renderView();
    expect(await screen.findByText(/No OpenLineage file imported yet/i)).toBeInTheDocument();
    upload("pricing_source.ndjson", JSON.stringify(EVENT));
    await waitFor(() => expect(screen.getByText("pricing_source imported.")).toBeInTheDocument());
    const table = screen.getByRole("table");
    expect(within(table).getByText("pricing_source")).toBeInTheDocument();
    expect(within(table).getByTitle("Data source")).toBeInTheDocument();
  });

  it("names the import, keeps the file name, and reuses the name on replace", async () => {
    renderView();
    upload("pricing_source.ndjson", JSON.stringify(EVENT), "Pricing nightly");
    await screen.findByText("Pricing nightly imported.");
    const table = screen.getByRole("table");
    expect(within(table).getByText("Pricing nightly")).toBeInTheDocument();
    expect(within(table).getByText("pricing_source.ndjson")).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("external-file-input"), {
      target: { files: [new File([JSON.stringify(EVENT)], "pricing_source.ndjson")] },
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Pricing nightly");
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace" }));
    await screen.findByText("Pricing nightly replaced.");
    expect(within(screen.getByRole("table")).getAllByText("Pricing nightly")).toHaveLength(1);
  });

  it("records a rejected file without storing edges", async () => {
    renderView();
    upload("export.json", JSON.stringify({ hello: "world" }));
    await waitFor(() => expect(screen.getByText(/^export rejected/)).toBeInTheDocument());
    expect(within(screen.getByRole("table")).getByText("export")).toBeInTheDocument();
  });

  it("deletes an accepted import after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderView();
    upload("pricing_source.ndjson", JSON.stringify(EVENT));
    const del = await screen.findByRole("button", { name: "Delete pricing_source" });
    fireEvent.click(del);
    await waitFor(() =>
      expect(screen.getByText("pricing_source deleted · its edges were removed.")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: "Delete pricing_source" })).not.toBeInTheDocument();
  });

  it("links a dataset by hand, unlinks it, then keeps another one external", async () => {
    renderView();
    upload("pricing_source.ndjson", JSON.stringify(EVENT));
    await screen.findByText("pricing_source imported.");
    fireEvent.click(screen.getByRole("tab", { name: /Link to Fabric/ }));

    fireEvent.click(screen.getByRole("button", { name: "Link CRM.MEMBERS" }));
    const panel = screen.getByRole("region", { name: "Link CRM.MEMBERS" });
    fireEvent.change(within(panel).getByLabelText("Fabric item"), { target: { value: "alpinerent_dw" } });
    fireEvent.click(within(panel).getAllByRole("radio")[0]);
    fireEvent.click(within(panel).getByRole("button", { name: "Link" }));
    await waitFor(() => expect(screen.getByText(/^Picked by /)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Unlink CRM.MEMBERS" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unlink CRM.MEMBERS" }));
    await waitFor(() => expect(screen.queryByText(/^Picked by /)).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Link pricing.daily_rates" }));
    const next = screen.getByRole("region", { name: "Link pricing.daily_rates" });
    fireEvent.click(within(next).getByLabelText(/Not in Fabric/));
    fireEvent.click(within(next).getByRole("button", { name: "Link" }));
    await waitFor(() => expect(screen.getByText("Stays outside Fabric")).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "External 1" })).toBeInTheDocument();
  });

  it("documents the accepted OpenLineage format", () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: "File format" }));
    expect(screen.getByText("OpenLineage 2-0-x")).toBeInTheDocument();
    expect(screen.getByText(/Ignored and never stored/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: ".json (array)" }));
    expect(screen.getByTestId("openlineage-example").textContent?.startsWith("[")).toBe(true);
  });
});
