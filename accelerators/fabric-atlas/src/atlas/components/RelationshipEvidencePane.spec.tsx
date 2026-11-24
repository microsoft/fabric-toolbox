import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createItemRelationsEvidence,
  recordItemRelationsResponse,
} from "../item-relations-evidence";
import { buildLineageEvidence } from "../lineage-evidence";
import type { Item } from "../model";
import { LineageSourceLegend } from "./LineageSourceLegend";
import { RelationshipEvidencePane } from "./RelationshipEvidencePane";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const LAKEHOUSE = "aaaaaaaa-0000-4000-8000-000000000001";
const MODEL = "aaaaaaaa-0000-4000-8000-000000000002";
const OBSERVED = "2026-10-01T08:00:00.000Z";

const items: Item[] = [
  { fabricId: LAKEHOUSE, itemType: "Lakehouse", displayName: "Rental warehouse", health: "healthy", endorsement: "none", tags: [] },
  { fabricId: MODEL, itemType: "SemanticModel", displayName: "Sales model", health: "healthy", endorsement: "none", tags: [] },
];

const model = buildLineageEvidence({
  items,
  edges: [{ source: LAKEHOUSE, target: MODEL, relation: "reads" }],
  workspaceId: WORKSPACE,
  workspaceName: "Sales",
  evidence: createItemRelationsEvidence(WORKSPACE, OBSERVED, [
    recordItemRelationsResponse(MODEL, "upstream", OBSERVED, {
      items: [{ id: LAKEHOUSE, workspaceId: WORKSPACE, type: "Lakehouse", displayName: "Rental warehouse" }],
      relations: [{ itemId: LAKEHOUSE, dependentOnItemId: MODEL, relationType: "Datasource" }],
      workspaces: [],
    }),
  ]),
});
const relationship = model.relationships[0];
const names = new Map(items.map((item) => [item.fabricId, item.displayName]));

describe("RelationshipEvidencePane", () => {
  it("shows only the active Preview source without comparing it to Atlas", () => {
    render(
      <RelationshipEvidencePane
        relationship={relationship}
        sourceMode="preview"
        snapshotSyncedAt={OBSERVED}
        itemNames={names}
      />,
    );
    const pane = screen.getByRole("region", { name: "Line evidence" });

    expect(within(pane).getByRole("heading", { level: 3, name: "Rental warehouse to Sales model" })).toBeInTheDocument();
    const facts = within(pane).getAllByRole("term").map((term) => term.textContent);
    expect(facts.slice(0, 2)).toEqual(["Relation type", "Workspace boundary"]);
    expect(pane).toHaveTextContent("Same workspace");
    const cards = within(pane).getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent("Item Relations API · Preview");
    expect(cards[0]).toHaveTextContent("Sales model → Rental warehouse (Datasource).");
    expect(cards[0]).toHaveTextContent("SourceFabric Item Relations API");
    expect(within(pane).getByRole("note")).toHaveTextContent(
      "This is the Preview API line currently drawn on the graph.",
    );
    expect(pane.querySelector(".overflow-auto")).toHaveClass("space-y-l");
    expect(pane.querySelector(".overflow-auto")).not.toHaveClass("flex-col");
  });

  it("shows only validated snapshot evidence in Atlas mode", () => {
    render(
      <RelationshipEvidencePane
        relationship={relationship}
        sourceMode="atlas"
        itemNames={names}
      />,
    );

    const [card] = screen.getAllByRole("listitem");
    expect(card).toHaveTextContent("Atlas snapshot · Validated");
    expect(screen.getByText("Collected with the synchronized snapshot")).toBeInTheDocument();
    expect(screen.queryByText(/Item Relations API · Preview/)).not.toBeInTheDocument();
  });
});

describe("LineageSourceLegend", () => {
  it("shows only the active graph source in the legend", () => {
    const { rerender } = render(<LineageSourceLegend mode="items" previewIncluded />);
    expect(
      within(screen.getByRole("group", { name: "Lineage legend" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Item Relations API (Beta, observed)",
      "Upstream path",
    ]);
    expect(screen.getByText("Sources and paths")).toBeVisible();
    expect(screen.getByText("Only Item Relations API (Beta) lineage is drawn. Line labels use the API relationType.")).toBeVisible();
    expect(screen.queryByText("Atlas snapshot (verified)")).not.toBeInTheDocument();

    rerender(<LineageSourceLegend mode="items" previewIncluded={false} />);
    expect(screen.queryByText("Item Relations API (Beta, observed)")).not.toBeInTheDocument();
    expect(screen.getByText("Only Atlas snapshot lineage is drawn.")).toBeVisible();
  });
});
