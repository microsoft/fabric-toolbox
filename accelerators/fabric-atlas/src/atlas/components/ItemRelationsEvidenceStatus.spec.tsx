import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createItemRelationsEvidence,
  recordItemRelationsResponse,
} from "../item-relations-evidence";
import { buildLineageEvidence } from "../lineage-evidence";
import { ItemRelationsEvidenceStatus } from "./ItemRelationsEvidenceStatus";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const STORED_SNAPSHOT = "33333333-3333-4333-8333-333333333333";
const CURRENT_SNAPSHOT = "44444444-4444-4444-8444-444444444444";

const evidence = createItemRelationsEvidence(WORKSPACE, "2026-10-01T08:00:00.000Z", [
  recordItemRelationsResponse(ITEM, "upstream", "2026-10-01T08:00:00.000Z", {
    items: [],
    relations: [],
    workspaces: [],
  }),
]);
const model = buildLineageEvidence({ items: [], edges: [], workspaceId: WORKSPACE, evidence });

function renderStatus(currentSnapshotId: string) {
  render(
    <ItemRelationsEvidenceStatus
      state={{
        status: "ready",
        evidence,
        snapshotId: STORED_SNAPSHOT,
        coverage: { sampledItemCount: 1, workspaceItemCount: 1, stopReasons: [] },
      }}
      model={model}
      currentSnapshotId={currentSnapshotId}
      onRetry={() => undefined}
    />,
  );
}

describe("ItemRelationsEvidenceStatus", () => {
  it("does not promise Atlas fallback when Preview evidence is missing", () => {
    render(<ItemRelationsEvidenceStatus state={{ status: "empty" }} model={model} onRetry={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("Atlas links stay hidden while Preview is on.");
    expect(screen.getByRole("status")).not.toHaveTextContent("show Atlas snapshot lineage only");
  });
  it("says when evidence was collected with an earlier Atlas snapshot", () => {
    renderStatus(CURRENT_SNAPSHOT);

    expect(screen.getByRole("status")).toHaveTextContent(
      "with an earlier Atlas snapshot",
    );
    expect(screen.queryByText(/Partial:/)).not.toBeInTheDocument();
  });

  it("omits the snapshot note when evidence matches the active snapshot", () => {
    renderStatus(STORED_SNAPSHOT);

    expect(screen.getByRole("status")).not.toHaveTextContent(
      "earlier Atlas snapshot",
    );
  });
});
