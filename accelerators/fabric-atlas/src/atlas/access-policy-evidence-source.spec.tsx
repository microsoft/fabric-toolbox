import { act, render, renderHook, screen, within, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStoredPolicyEvidence, loadStoredPolicyEvidence } from "./access-policy-evidence-source";
import { parseAccessPolicyEvidence, POLICY_SOURCE, POLICY_IDENTITY } from "../../rayfin/functions/src/policy-evidence-contract";
import { withStoredPolicyEvidence, buildAccessEvidenceCoverage, evaluatedAccessLayers } from "./access-coverage";
import { buildAccessReviewRows } from "./governance";
import { accessRowsToCsv } from "./access-export";
import { simulateAccessGrantRemoval, accessWhatIfToMarkdown } from "./access-what-if";
import { AccessReviewDetailPanel } from "./views/Access";

const W = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const raw = () => ({
  id: "33333333-3333-4333-8333-333333333333", workspace_id: W, snapshotId: S,
  collectionId: "44444444-4444-4444-8444-444444444444", writerEmail: "sync@example.test",
  schemaVersion: 1 as const, kind: "workspace-networking" as const, source: POLICY_SOURCE,
  collectorIdentity: POLICY_IDENTITY, coverage: "observed" as const, reason: "context-only" as const,
  attemptedAt: "2026-10-02T12:00:00Z", observedAt: "2026-10-02T12:00:01Z",
  inboundPublicAction: "Deny" as const, outboundPublicAction: "Allow" as const,
});
const api = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/rayfin-client", () => ({ getRayfinClient: () => ({ data: { AccessPolicyEvidence: api } }) }));
afterEach(() => vi.clearAllMocks());

describe("stored policy evidence contract and hydration", () => {
  it("shows stored settings as context without a granted-access or restriction verdict", () => {
    const data = {
      workspace: { fabricId: W, snapshotId: S, displayName: "Workspace", capacity: "F2", region: "West Europe" },
      items: [{ fabricId: W, displayName: "Item", itemType: "Lakehouse" as const,
        health: "healthy" as const, endorsement: "none" as const, tags: [] }],
      principals: [],
      grants: [{ principalRef: "recorded-user", source: "workspaceRole" as const, accessLevel: "edit" as const }],
    };
    const row = buildAccessReviewRows(data)[0];
    render(<AccessReviewDetailPanel row={{
      ...row, coverage: withStoredPolicyEvidence(row.coverage, [parseAccessPolicyEvidence(raw(), W, S)]),
    }} reviewsLoading={false} saving={false} readOnly
      onSaveDecision={vi.fn()} onClearDecision={vi.fn()} onClose={vi.fn()} />);
    const context = screen.getByRole("region", { name: "Stored workspace policy context" });
    expect(within(context).getByText("Inbound public-network default: Deny")).toBeVisible();
    expect(within(context).getByText(/not a principal.item access decision/)).toBeVisible();
    expect(within(context).getByText(/2026-10-02T12:00:01/)).toBeVisible();
    const grants = screen.getByRole("region", { name: "1. Granted permissions" });
    expect(within(grants).getAllByText("Edit").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unsupported").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/No restrictions|None observed|Access denied/i)).not.toBeInTheDocument();
  });

  it("projects only approved fields and rejects scope mismatches or fake evaluation facts", () => {
    const parsed = parseAccessPolicyEvidence({ ...raw(), token: "SECRET", businessRows: [1], decision: "Allow" }, W, S);
    expect(JSON.stringify(parsed)).not.toMatch(/SECRET|businessRows|decision/);
    expect(() => parseAccessPolicyEvidence(raw(), S, S)).toThrow();
    expect(() => parseAccessPolicyEvidence({ ...raw(), observedAt: undefined }, W, S)).toThrow();
    expect(() => parseAccessPolicyEvidence({ ...raw(), kind: "fabric-policies-evaluation" }, W, S)).toThrow();
    expect(() => parseAccessPolicyEvidence({ ...raw(), reason: "read-denied" }, W, S)).toThrow();
    expect(() => parseAccessPolicyEvidence({ ...raw(), kind: "onelake-security" }, W, S)).toThrow();
  });

  it("is default-off and does not invoke its loader", () => {
    const loader = vi.fn().mockResolvedValue([]);
    const { result, rerender } = renderHook(() => useStoredPolicyEvidence(W, S, false, loader));
    expect(result.current.status).toBe("off");
    const records = result.current.records;
    rerender();
    expect(result.current.records).toBe(records);
    expect(loader).not.toHaveBeenCalled();
  });

  it("reads three bounded kinds from the actual entity with workspace/snapshot filters", async () => {
    const query = {
      where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(),
      first: vi.fn().mockReturnThis(), execute: vi.fn()
        .mockResolvedValueOnce([raw()]).mockResolvedValueOnce([]).mockResolvedValueOnce([]),
    };
    api.select.mockReturnValue(query);
    const records = await loadStoredPolicyEvidence(W, S, new AbortController().signal);
    expect(records).toHaveLength(1);
    expect(api.select).toHaveBeenCalledTimes(3);
    expect(query.first).toHaveBeenCalledWith(1);
    expect(query.where).toHaveBeenCalledWith({ workspace_id: W, snapshotId: S, kind: "workspace-networking" });
    expect(query.orderBy).toHaveBeenCalledWith({ attemptedAt: "desc" });
  });

  it("never shows a late response from the old workspace/snapshot", async () => {
    let finish!: (values: unknown[]) => void;
    const loader = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValue([]);
    const { result, rerender } = renderHook(({ snapshot }) => useStoredPolicyEvidence(W, snapshot, true, loader), {
      initialProps: { snapshot: S },
    });
    rerender({ snapshot: W });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => { finish([raw()]); });
    expect(result.current.records).toEqual([]);
  });

  it("fails closed on malformed evidence and absent entity without changing catalog state", async () => {
    const loader = vi.fn().mockResolvedValue([{ ...raw(), snapshotId: W }]);
    const { result } = renderHook(() => useStoredPolicyEvidence(W, S, true, loader));
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.records).toEqual([]);
    api.select.mockImplementation(() => { throw new Error("SECRET"); });
    await expect(loadStoredPolicyEvidence(W, S, new AbortController().signal)).rejects.toThrow();
  });

  it("preserves grants, What-if results and manual OneLake/DLP layers while exporting real context", () => {
    const data = {
      workspace: { fabricId: W, snapshotId: S, displayName: "Workspace", capacity: "F2", region: "West Europe" },
      items: [{ fabricId: W, displayName: "Item", itemType: "Lakehouse" as const,
        health: "healthy" as const, endorsement: "none" as const, tags: [] }],
      principals: [],
      grants: [{ principalRef: "recorded-user", source: "workspaceRole" as const, accessLevel: "edit" as const }],
    };
    const original = buildAccessReviewRows(data)[0];
    const before = JSON.stringify(original.applicableGrants);
    const enriched = { ...original, coverage: withStoredPolicyEvidence(original.coverage, [parseAccessPolicyEvidence(raw(), W, S)]) };
    expect(enriched.effectiveAccess).toBe(original.effectiveAccess);
    expect(enriched.coverage.state).toBe("partial");
    expect(enriched.coverage.layers.find((layer) => layer.layer === "onelake-security")?.state).toBe("unsupported");
    expect(enriched.coverage.layers.find((layer) => layer.layer === "purview-dlp")?.state).toBe("unsupported");
    expect(enriched.coverage.layers.find((layer) => layer.layer === "fabric-policies")?.state).toBe("unsupported");
    expect(evaluatedAccessLayers(enriched.coverage)).toContain("context read only");
    expect(accessRowsToCsv([enriched])).toContain("inbound public default Deny");
    const scenario = simulateAccessGrantRemoval(enriched, []);
    expect(scenario.simulatedLevel).toBe("edit");
    expect(accessWhatIfToMarkdown(scenario)).toContain("policy context (not modeled)");
    expect(JSON.stringify(original.applicableGrants)).toBe(before);
    expect(withStoredPolicyEvidence(buildAccessEvidenceCoverage([]), [parseAccessPolicyEvidence(raw(), W, S)]).policyEvidence)
      .toBeUndefined();
  });
});
