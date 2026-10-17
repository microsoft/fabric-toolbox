import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtlasData } from "../model";
import { snapshotFromData } from "../history";
import { PoliciesAiSection } from "./PoliciesAi";
import { POLICIES_AI_LIMITATION } from "../policies-ai";
import type { PolicyEvidenceLoader } from "../access-policy-evidence-source";

const feature = vi.hoisted(() => ({ enabled: false }));
vi.mock("../feature-flags", () => ({ isFeatureEnabled: () => feature.enabled }));

const data: AtlasData = {
  workspace: { fabricId: "workspace", snapshotId: "current", displayName: "Workspace", capacity: "F2", region: "West Europe",
    syncedAt: "2026-10-02T12:00:00Z", syncSections: { definitions: { status: "complete" } } },
  items: [{ fabricId: "agent", displayName: "Recorded agent", itemType: "DataAgent", health: "healthy",
    endorsement: "none", tags: [], ownerMetadataAvailable: false }],
  itemMetadata: { agent: { kind: "dataAgent", sources: [] } },
  edges: [], principals: [], grants: [], jobs: [], config: [], comments: [], syncRuns: [],
};
const props = () => ({
  data, historyLoading: false, isPreview: true, onNavigate: vi.fn(), onCompare: vi.fn(),
});
beforeEach(() => { feature.enabled = false; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("PoliciesAiSection", () => {
  it("shows observed empty definitions as unknown exposure with real provenance and no synthetic score", () => {
    render(<PoliciesAiSection {...props()} />);
    expect(screen.getByText(/Coverage is partial/)).toBeVisible();
    expect(screen.getByRole("button", { name: /Inspect Recorded agent/ })).toHaveAccessibleName(/AI exposure unknown/);
    fireEvent.click(screen.getByRole("button", { name: /Inspect Recorded agent/ }));
    const details = screen.getByRole("region", { name: "Evidence details: Recorded agent" });
    expect(within(details).getByText("Unknown; no exposure contract collected")).toBeVisible();
    expect(within(details).getByText("2026-10-02T12:00:00Z")).toBeVisible();
    fireEvent.click(within(details).getByText("Sources and provenance"));
    expect(screen.getByText(POLICIES_AI_LIMITATION)).toBeVisible();
    expect(within(details).getByText("Per-definition observation time")).toBeVisible();
    expect(within(details).getByText(/Neither statement establishes/)).toBeVisible();
    expect(screen.queryByText(/^(AI.safe|AI readiness|Compliant|Not exposed)$/i)).not.toBeInTheDocument();
  });

  it("keeps unrelated build notes and empty policy prose out of the AI inventory", () => {
    render(<PoliciesAiSection {...props()} />);
    expect(screen.queryByRole("button", { name: /Watchlists|Sync Brief/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Watchlists and Sync Brief are unavailable/)).not.toBeInTheDocument();
    expect(screen.getByText(/Policy collection is off/)).toBeVisible();
    expect(screen.queryByText("Workspace settings only, not item restriction or exposure decisions.")).not.toBeInTheDocument();
    expect(screen.getByText(/AI and Copilot exposure is not collected/)).toBeVisible();
  });

  it("opens useful evidence by default on desktop, with three real summaries and a stable pane after filtering", () => {
    render(<PoliciesAiSection {...props()} />);
    expect(screen.getByRole("region", { name: "Evidence details: Recorded agent" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Inspect Recorded agent/ })).toHaveAttribute("aria-pressed", "true");
    const summary = screen.getByLabelText("Policy and AI inventory summary");
    expect(within(summary).getAllByRole("definition").map((value) => value.textContent)).toEqual(["0", "1", "0"]);
    const inventory = screen.getByRole("table", { name: /AI governance inventory/ });
    expect(within(inventory).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Asset", "Owner", "Sources", "Protection evidence",
    ]);
    expect(inventory.parentElement?.parentElement).toHaveClass("atlas-ai-workbench");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no match" } });
    expect(screen.getByRole("heading", { name: "Evidence details" })).toBeVisible();
    expect(screen.getByText(/No asset matches the current inventory filter/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Workspace policy context" })).toBeVisible();
  });

  it("keeps network Deny as workspace context, never an AI exposure or restriction decision", async () => {
    feature.enabled = true;
    const workspaceId = "11111111-1111-4111-8111-111111111111";
    const snapshotId = "22222222-2222-4222-8222-222222222222";
    const loader = vi.fn<PolicyEvidenceLoader>(async () => [{
      id: "33333333-3333-4333-8333-333333333333", workspace_id: workspaceId, snapshotId,
      collectionId: "44444444-4444-4444-8444-444444444444", writerEmail: "collector@example.test",
      schemaVersion: 1, kind: "workspace-networking", source: "fabric-core-workspace-policy-v1",
      collectorIdentity: "fabric-function-connection-unverified", coverage: "observed", reason: "context-only",
      attemptedAt: "2026-10-02T12:00:00Z", observedAt: "2026-10-02T12:00:01Z",
      inboundPublicAction: "Deny", outboundPublicAction: "Allow",
    }]);
    render(<PoliciesAiSection {...props()} data={{ ...data, workspace: { ...data.workspace, fabricId: workspaceId, snapshotId } }} policyEvidenceLoader={loader} />);
    expect(screen.getByText("Loading stored workspace context...")).toBeInTheDocument();
    await screen.findByText("1 stored workspace context records.");
    fireEvent.click(screen.getByText("Stored context records"));
    expect(screen.getByText("Inbound public-network default: Deny")).toBeVisible();
    expect(screen.getByText("Unknown; no exposure contract collected")).toBeVisible();
    expect(screen.getByText("Workspace settings only, not item restriction or exposure decisions.")).toBeVisible();
    expect(screen.queryByText(/Restrictions observed|Not exposed|Compliant/)).not.toBeInTheDocument();
  });

  it("announces unavailable policy reads and history loading without fabricating decisions", async () => {
    feature.enabled = true;
    render(<PoliciesAiSection {...props()} historyLoading policyEvidenceLoader={async () => { throw new Error("Unavailable"); }} />);
    expect(screen.getByText(/Loading validated snapshot history/)).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent("Stored policy context unavailable");
  });

  it("links only loaded published historical comparisons and fails closed on history errors", () => {
    const prior: AtlasData = { ...data, workspace: {
      ...data.workspace, snapshotId: "previous", syncedAt: "2026-10-01T12:00:00Z",
    } };
    const values = props();
    const rendered = render(<PoliciesAiSection {...values} previous={snapshotFromData(prior)} current={snapshotFromData(data)} />);
    fireEvent.click(screen.getByText("Source-change evidence"));
    expect(screen.getByText(/previous \(2026-10-01.*to current \(2026-10-02/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Open exact historical comparison" }));
    expect(values.onCompare).toHaveBeenCalledWith("previous", "current");
    rendered.rerender(<PoliciesAiSection {...values} historyError="unavailable" previous={snapshotFromData(prior)} current={snapshotFromData(data)} />);
    expect(screen.getByRole("alert")).toHaveTextContent("no selection changes are inferred");
    expect(screen.queryByRole("button", { name: "Open exact historical comparison" })).not.toBeInTheDocument();
  });

  it("supports empty filtered inventory and exact catalog/lineage evidence targets", () => {
    const values = props();
    render(<PoliciesAiSection {...values} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search policy and AI inventory" }), { target: { value: "missing" } });
    expect(screen.getByText(/No inventoried artifacts match/)).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search policy and AI inventory" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Inspect Recorded agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open catalog evidence" }));
    expect(values.onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      tab: "catalog", focus: expect.objectContaining({ itemId: "agent" }),
    }));
    fireEvent.click(screen.getByRole("button", { name: "Open lineage evidence" }));
    expect(values.onNavigate).toHaveBeenLastCalledWith(expect.objectContaining({
      tab: "map", focus: expect.objectContaining({ itemId: "agent" }),
    }));
  });

  it("manages a mobile evidence drawer, native keyboard controls and focus restoration", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })));
    render(<PoliciesAiSection {...props()} />);
    const inspect = screen.getByRole("button", { name: /Inspect Recorded agent/ });
    await act(async () => { inspect.focus(); fireEvent.click(inspect); });
    const dialog = await screen.findByRole("dialog", { name: "Policies and AI evidence" });
    const close = within(dialog).getByRole("button", { name: "Close AI evidence details" });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(inspect).toHaveFocus());
  });
});
