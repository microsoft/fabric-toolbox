import { describe, expect, it } from "vitest";
import {
  createItemRelationsEvidence,
  recordItemRelationsResponse,
} from "../item-relations-evidence";
import { buildAtlasHistory, snapshotFromData } from "../history";
import {
  ANA,
  LAKEHOUSE,
  MODEL,
  NOTEBOOK,
  OTHER_WORKSPACE_ID,
  PIPELINE,
  PREVIOUS_SNAPSHOT_ID,
  REPORT,
  SNAPSHOT_ID,
  SYNCED_AT,
  WORKSPACE_ID,
  currentSnapshot,
  fakeSource,
  scopeEntry,
} from "../../test/atlas-mcp-fixtures";
import {
  ATLAS_MCP_BASE_LIMITATIONS,
  ATLAS_MCP_TOOL_NAMES,
  type AtlasMcpEnvelope,
  type AtlasMcpToolName,
} from "./contract";
import { callAtlasMcpTool, type AtlasMcpToolRuntime } from "./evidence-tools";

const NOW = new Date("2026-10-02T09:30:00.000Z");

function runtime(
  options: Parameters<typeof fakeSource>[0] = {},
  itemRelationsEnabled = false,
) {
  const { source, calls } = fakeSource(options);
  const value: AtlasMcpToolRuntime = {
    source,
    itemRelationsEnabled,
    now: () => NOW,
  };
  return { runtime: value, calls };
}

// The envelope result is a plain JSON object; tests read it structurally.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function result(envelope: AtlasMcpEnvelope): any {
  expect(envelope.error).toBeUndefined();
  return envelope.result;
}

const SAMPLE_ARGUMENTS: Record<AtlasMcpToolName, Record<string, unknown>> = {
  atlas_list_workspaces: {},
  atlas_get_snapshot_provenance: {},
  atlas_find_catalog_items: { query: "sales" },
  atlas_get_known_impact: { itemId: LAKEHOUSE },
  atlas_explain_lineage_evidence: { itemId: NOTEBOOK },
  atlas_get_access_evidence: { itemId: REPORT },
  atlas_get_operational_incidents: {},
  atlas_get_snapshot_changes: {},
};

describe("Atlas MCP envelope", () => {
  it.each(ATLAS_MCP_TOOL_NAMES)(
    "%s returns snapshot, timestamp, sources, coverage and limitations",
    async (tool) => {
      const { runtime: tools } = runtime();
      const envelope = await callAtlasMcpTool(tool, SAMPLE_ARGUMENTS[tool], tools);

      expect(envelope).toMatchObject({
        contract: "fabric-atlas-mcp",
        contractVersion: 1,
        tool,
        readOnly: true,
        retrievedAt: NOW.toISOString(),
      });
      expect(envelope.error).toBeUndefined();
      expect(envelope.sources.length).toBeGreaterThan(0);
      expect(envelope.coverage).toEqual(
        expect.objectContaining({
          status: expect.any(String),
          returned: expect.any(Number),
          total: expect.any(Number),
          truncated: expect.any(Boolean),
        }),
      );
      expect(envelope.limitations.slice(0, ATLAS_MCP_BASE_LIMITATIONS.length)).toEqual([
        ...ATLAS_MCP_BASE_LIMITATIONS,
      ]);
      if (tool === "atlas_list_workspaces") {
        expect(envelope.snapshot).toBeNull();
      } else {
        expect(envelope.workspace).toEqual({
          workspaceId: WORKSPACE_ID,
          displayName: "Sales analytics",
        });
        expect(envelope.snapshot).toMatchObject({
          snapshotId: SNAPSHOT_ID,
          syncedAt: SYNCED_AT,
          validation: "manifest-verified",
        });
      }
    },
  );
});

describe("authentication and workspace scope", () => {
  it("fails closed before any scope or snapshot read without a session", async () => {
    const { runtime: tools, calls } = runtime({ authenticated: false });
    const envelope = await callAtlasMcpTool(
      "atlas_get_known_impact",
      { itemId: LAKEHOUSE },
      tools,
    );

    expect(envelope.error).toMatchObject({ code: "unauthenticated" });
    expect(envelope.result).toBeNull();
    expect(calls).toEqual(["requireSession"]);
  });

  it("refuses workspaces outside the administrator-selected scope", async () => {
    const { runtime: tools, calls } = runtime();
    const envelope = await callAtlasMcpTool(
      "atlas_get_snapshot_provenance",
      { workspaceId: OTHER_WORKSPACE_ID },
      tools,
    );

    expect(envelope.error).toEqual({
      code: "workspace-not-in-scope",
      message: "The workspace is not in the Atlas workspace scope.",
      retryable: false,
      allowedWorkspaceIds: [WORKSPACE_ID],
    });
    expect(calls.some((call) => call.startsWith("loadSnapshot"))).toBe(false);
  });

  it("requires an explicit workspace when several are selected", async () => {
    const { runtime: tools } = runtime({
      scope: [
        scopeEntry(WORKSPACE_ID, "Sales analytics"),
        scopeEntry(OTHER_WORKSPACE_ID, "Finance"),
      ],
    });

    const missing = await callAtlasMcpTool("atlas_get_snapshot_provenance", {}, tools);
    expect(missing.error).toMatchObject({
      code: "workspace-required",
      allowedWorkspaceIds: [WORKSPACE_ID, OTHER_WORKSPACE_ID],
    });

    const chosen = await callAtlasMcpTool(
      "atlas_get_snapshot_provenance",
      { workspaceId: WORKSPACE_ID.toUpperCase() },
      tools,
    );
    expect(chosen.error).toBeUndefined();
    expect(chosen.workspace?.workspaceId).toBe(WORKSPACE_ID);
  });

  it("reports a missing or mismatched snapshot instead of using it", async () => {
    const empty = runtime({ snapshots: {} });
    expect(
      (await callAtlasMcpTool("atlas_get_snapshot_provenance", {}, empty.runtime)).error,
    ).toMatchObject({ code: "snapshot-unavailable", retryable: true });

    const other = currentSnapshot();
    other.workspace.fabricId = OTHER_WORKSPACE_ID;
    const mismatch = runtime({ snapshots: { [WORKSPACE_ID]: other } });
    const envelope = await callAtlasMcpTool(
      "atlas_get_snapshot_provenance",
      {},
      mismatch.runtime,
    );
    expect(envelope.error?.code).toBe("snapshot-unavailable");
    expect(envelope.snapshot).toBeNull();
  });

  it("maps unexpected loader failures to explicit retryable errors", async () => {
    const { source } = fakeSource();
    const failing: AtlasMcpToolRuntime = {
      source: {
        ...source,
        loadWorkspaceScope: async () => {
          throw new TypeError("network down");
        },
      },
      itemRelationsEnabled: false,
      now: () => NOW,
      log: () => undefined,
    };
    const envelope = await callAtlasMcpTool("atlas_list_workspaces", {}, failing);
    expect(envelope.error).toEqual({
      code: "scope-unavailable",
      message: "The Atlas workspace scope could not be read.",
      retryable: true,
    });
  });

  it("rejects unknown or out-of-range arguments explicitly", async () => {
    const { runtime: tools } = runtime();
    const unknown = await callAtlasMcpTool(
      "atlas_get_access_evidence",
      { itemId: REPORT, grantAccess: "owner" },
      tools,
    );
    expect(unknown.error).toMatchObject({ code: "invalid-arguments", retryable: false });
    expect(unknown.error?.message).toContain('"grantAccess"');

    const depth = await callAtlasMcpTool(
      "atlas_get_known_impact",
      { itemId: LAKEHOUSE, maxDepth: 40 },
      tools,
    );
    expect(depth.error?.message).toBe("maxDepth must be an integer from 1 to 6.");

    const workspace = await callAtlasMcpTool(
      "atlas_get_snapshot_provenance",
      { workspaceId: "../other" },
      tools,
    );
    expect(workspace.error?.code).toBe("invalid-arguments");
  });
});

describe("workspace scope and provenance", () => {
  it("lists the scope and marks the configured fallback", async () => {
    const { runtime: tools } = runtime({
      scope: [scopeEntry(WORKSPACE_ID, "Sales analytics", false)],
    });
    const envelope = await callAtlasMcpTool("atlas_list_workspaces", {}, tools);

    expect(result(envelope)).toEqual({
      workspaces: [
        {
          workspaceId: WORKSPACE_ID,
          displayName: "Sales analytics",
          workspaceType: "Workspace",
          selectedAt: null,
          selection: "configured-fallback",
        },
      ],
      defaultWorkspaceId: WORKSPACE_ID,
    });
    expect(envelope.sources[0]).toMatchObject({ authority: "configuration" });
    expect(envelope.coverage.notes[0]).toMatch(/fallback scope/);
  });

  it("summarizes the validated snapshot and its collection sections", async () => {
    const data = currentSnapshot();
    data.workspace.syncSections!.access = { status: "failed", code: "FORBIDDEN" };
    const { runtime: tools } = runtime({ snapshots: { [WORKSPACE_ID]: data } });
    const envelope = await callAtlasMcpTool("atlas_get_snapshot_provenance", {}, tools);
    const value = result(envelope);

    expect(value.counts).toMatchObject({
      items: 5,
      lineageEdges: 4,
      brokenLineageEdges: 1,
      principals: 3,
      externalPrincipals: 1,
      recordedGrants: 3,
      jobRuns: 2,
      failedJobRuns: 1,
      tables: 1,
      columns: 1,
      measures: 1,
    });
    expect(value.sections).toContainEqual({ name: "access", status: "failed", code: "FORBIDDEN" });
    expect(value.recentSynchronizations[1]).toMatchObject({
      status: "failed",
      failureCode: "deadline-exhausted",
    });
    expect(envelope.coverage).toMatchObject({ status: "partial" });
    expect(envelope.coverage.notes[0]).toContain("access");
  });
});

describe("catalog lookup", () => {
  it("finds items and schema objects without returning expressions", async () => {
    const { runtime: tools } = runtime();
    const envelope = await callAtlasMcpTool(
      "atlas_find_catalog_items",
      { query: "total sales" },
      tools,
    );
    const value = result(envelope);

    expect(value.matches[0]).toMatchObject({
      matchType: "object",
      kind: "measure",
      name: "Total Sales",
      itemId: MODEL,
      itemName: "Sales model",
      objectLabel: "Measure / KPI",
      tableName: "Sales",
      item: null,
    });
    expect(JSON.stringify(envelope)).not.toContain("SUM(");
  });

  it("never searches notes, configuration values, principals or job messages", async () => {
    const { runtime: tools } = runtime();
    for (const query of ["Quarterly freeze", "sales-db.contoso", "Partner guest", "Spark session"]) {
      const value = result(
        await callAtlasMcpTool("atlas_find_catalog_items", { query }, tools),
      );
      expect(value.matches).toEqual([]);
    }
  });

  it("filters by item type and reports metadata availability and truncation", async () => {
    const { runtime: tools } = runtime();
    const envelope = await callAtlasMcpTool(
      "atlas_find_catalog_items",
      { query: "sales", itemTypes: ["Lakehouse"], kinds: ["item"], limit: 1 },
      tools,
    );
    const value = result(envelope);

    expect(value.matches).toEqual([
      expect.objectContaining({
        matchType: "item",
        itemId: LAKEHOUSE,
        item: expect.objectContaining({
          owner: "Ana Silva",
          endorsement: "certified",
          metadataAvailability: {
            owner: "available",
            sensitivity: "unavailable",
            endorsement: "not-recorded",
            tags: "not-recorded",
          },
        }),
      }),
    ]);
    expect(JSON.stringify(value)).not.toContain("ana@contoso.example");
    expect(envelope.coverage).toMatchObject({ returned: 1, total: 1, truncated: false });
  });
});

describe("known impact", () => {
  it("returns upstream and downstream items reachable through snapshot lineage", async () => {
    const { runtime: tools } = runtime();
    const value = result(
      await callAtlasMcpTool("atlas_get_known_impact", { itemId: LAKEHOUSE }, tools),
    );

    expect(value.upstream.map((entry: { itemId: string; distance: number }) => [entry.itemId, entry.distance])).toEqual([
      [NOTEBOOK, 1],
      [PIPELINE, 2],
    ]);
    expect(value.downstream.map((entry: { itemId: string; distance: number }) => [entry.itemId, entry.distance])).toEqual([
      [MODEL, 1],
      [REPORT, 2],
    ]);
    expect(value.brokenEdgesOnPaths).toBe(1);
    expect(value.edges).toHaveLength(4);
  });

  it("honours direction and depth while reporting what lies beyond", async () => {
    const { runtime: tools } = runtime();
    const envelope = await callAtlasMcpTool(
      "atlas_get_known_impact",
      { itemId: PIPELINE, direction: "downstream", maxDepth: 1 },
      tools,
    );
    const value = result(envelope);

    expect(value.upstream).toEqual([]);
    expect(value.downstream.map((entry: { itemId: string }) => entry.itemId)).toEqual([NOTEBOOK]);
    expect(value.reachableWithoutDepthLimit).toEqual({ upstream: null, downstream: 4 });
    expect(value.edges).toEqual([
      { sourceItemId: PIPELINE, targetItemId: NOTEBOOK, relation: "orchestrates", broken: false },
    ]);
  });

  it("returns an explicit error for an item outside the snapshot", async () => {
    const { runtime: tools } = runtime();
    const envelope = await callAtlasMcpTool(
      "atlas_get_known_impact",
      { itemId: "c0000000-0000-4000-8000-0000000000ff" },
      tools,
    );
    expect(envelope.error?.code).toBe("item-not-found");
    expect(envelope.snapshot?.snapshotId).toBe(SNAPSHOT_ID);
  });
});

describe("lineage evidence", () => {
  const OBSERVED = "2026-10-02T07:00:00.000Z";
  const evidence = createItemRelationsEvidence(WORKSPACE_ID, OBSERVED, [
    recordItemRelationsResponse(PIPELINE, "downstream", OBSERVED, {
      items: [
        { id: NOTEBOOK, workspaceId: WORKSPACE_ID, type: "Notebook", displayName: "Load sales" },
      ],
      relations: [
        { itemId: PIPELINE, dependentOnItemId: NOTEBOOK, relationType: "Orchestration" },
      ],
      workspaces: [],
    }),
  ]);

  it("explains authoritative lineage only while Beta evidence is disabled", async () => {
    const { runtime: tools, calls } = runtime();
    const envelope = await callAtlasMcpTool(
      "atlas_explain_lineage_evidence",
      { itemId: NOTEBOOK },
      tools,
    );
    const value = result(envelope);

    expect(calls.some((call) => call.startsWith("loadItemRelationsEvidence"))).toBe(false);
    expect(value.itemRelationsEvidence.status).toBe("disabled");
    expect(value.agreementCounts).toEqual({ snapshot: 2 });
    expect(envelope.sources.map((source) => source.authority)).toEqual(["authoritative"]);
    expect(envelope.coverage.status).toBe("complete");
  });

  it("compares persisted Beta evidence without making it authoritative", async () => {
    const { runtime: tools } = runtime(
      {
        evidence: {
          envelope: evidence,
          snapshotId: SNAPSHOT_ID,
          coverage: { sampledItemCount: 1, workspaceItemCount: 5, stopReasons: ["budget"] },
        },
      },
      true,
    );
    const envelope = await callAtlasMcpTool(
      "atlas_explain_lineage_evidence",
      { itemId: NOTEBOOK },
      tools,
    );
    const value = result(envelope);
    const orchestration = value.relationships.find(
      (entry: { source: { itemId: string } }) => entry.source.itemId === PIPELINE,
    );

    expect(orchestration).toMatchObject({
      agreement: "agree",
      authoritative: [{ relation: "orchestrates" }],
      preview: [
        expect.objectContaining({
          relationType: "Orchestration",
          comparison: "matching",
          lastObservedAt: OBSERVED,
        }),
      ],
    });
    expect(value.itemRelationsEvidence).toMatchObject({
      status: "available",
      collectedAt: OBSERVED,
      collectedWithCurrentSnapshot: true,
      itemQueried: false,
      sampledItemCount: 1,
      workspaceItemCount: 5,
      stopReasons: ["budget"],
    });
    expect(envelope.sources[1]).toMatchObject({
      id: "fabric-item-relations-api-beta",
      authority: "non-authoritative",
      maturity: "beta",
      observedAt: OBSERVED,
    });
    expect(envelope.limitations).toContain(
      "Microsoft does not recommend the Beta API for production use.",
    );
  });

  it("keeps working when Beta evidence is missing or invalid", async () => {
    const missing = runtime({ evidence: null }, true);
    const empty = await callAtlasMcpTool(
      "atlas_explain_lineage_evidence",
      { itemId: NOTEBOOK },
      missing.runtime,
    );
    expect(result(empty).itemRelationsEvidence.status).toBe("not-collected");
    expect(empty.coverage.status).toBe("partial");

    const invalid = runtime(
      { evidence: { envelope: { schemaVersion: 99 }, snapshotId: SNAPSHOT_ID } },
      true,
    );
    const rejected = await callAtlasMcpTool(
      "atlas_explain_lineage_evidence",
      { itemId: NOTEBOOK },
      invalid.runtime,
    );
    expect(result(rejected).itemRelationsEvidence.status).toBe("invalid");
    expect(rejected.sources).toHaveLength(1);
  });
});

describe("access evidence", () => {
  it("returns recorded grant paths with coverage and no emails", async () => {
    const { runtime: tools } = runtime();
    const envelope = await callAtlasMcpTool(
      "atlas_get_access_evidence",
      { itemId: REPORT },
      tools,
    );
    const value = result(envelope);

    expect(value.scope).toBe("item");
    expect(value.assessment.state).toBe("partial");
    expect(
      value.assessment.layers.map((layer: { layer: string; state: string }) => [layer.layer, layer.state]),
    ).toEqual([
      ["workspace-grants", "observed"],
      ["item-grants", "observed"],
      ["group-membership", "unavailable"],
      ["onelake-security", "unsupported"],
      ["purview-dlp", "unsupported"],
      ["fabric-policies", "unavailable"],
    ]);
    expect(value.recordedGrants).toContainEqual(
      expect.objectContaining({
        principal: expect.objectContaining({ principalId: ANA, resolution: "resolved" }),
        highestRecordedGrant: "owner",
        origin: "workspace",
        paths: [{ scope: "workspace", accessLevel: "owner", source: "workspaceRole", roleName: "Admin" }],
      }),
    );
    expect(value.summary.recordedGrantPairs).toBe(3);
    expect(JSON.stringify(value)).not.toContain("ana@contoso.example");
    expect(envelope.coverage.status).toBe("partial");
    expect(envelope.limitations).toContain("Atlas MCP cannot grant, change or revoke permissions.");
  });

  it("summarizes workspace access without listing principals", async () => {
    const { runtime: tools } = runtime();
    const value = result(await callAtlasMcpTool("atlas_get_access_evidence", {}, tools));

    expect(value).toMatchObject({
      scope: "workspace",
      principalKinds: { user: 1, group: 1, servicePrincipal: 0, guest: 1 },
      externalPrincipals: 1,
      workspaceGrants: 1,
      itemGrants: 2,
    });
    expect(value).not.toHaveProperty("recordedGrants");
  });
});

describe("operational incidents", () => {
  it("separates observed failures from inferred downstream impact", async () => {
    const { runtime: tools } = runtime();
    const envelope = await callAtlasMcpTool("atlas_get_operational_incidents", {}, tools);
    const value = result(envelope);

    expect(value.incidents).toEqual([
      expect.objectContaining({
        evidence: "observed",
        source: "fabric-job-history",
        itemId: NOTEBOOK,
        observedAt: SYNCED_AT,
        message: "Spark session ended",
        downstreamImpact: expect.objectContaining({
          basis: "snapshot-lineage",
          total: 3,
          inferred: 3,
          observed: 0,
          truncated: false,
          items: [
            expect.objectContaining({ itemId: LAKEHOUSE, itemName: "Sales lakehouse", itemType: "Lakehouse", distance: 1, evidence: "inferred" }),
            expect.objectContaining({ itemId: MODEL, itemName: "Sales model", itemType: "SemanticModel", distance: 2, evidence: "inferred" }),
            expect.objectContaining({ itemId: REPORT, itemName: "Sales report", itemType: "Report", distance: 3, evidence: "inferred" }),
          ],
        }),
      }),
    ]);
    expect(value.monitoringSources.map((source: { id: string; status: string }) => [source.id, source.status])).toEqual([
      ["fabric-job-history", "collected"],
      ["workspace-monitoring", "not-collected"],
      ["monitor-hub-alerts", "fabric-only"],
      ["app-metrics", "fabric-only"],
    ]);
    expect(envelope.sources.map((source) => source.authority)).toEqual([
      "authoritative",
      "derived",
      "authoritative",
    ]);
    expect(envelope.coverage.status).toBe("partial");
  });

  it("omits inferred impact on request", async () => {
    const { runtime: tools } = runtime();
    const envelope = await callAtlasMcpTool(
      "atlas_get_operational_incidents",
      { includeImpact: false },
      tools,
    );
    expect(result(envelope).incidents[0].downstreamImpact).toBeNull();
    expect(envelope.sources.map((source) => source.authority)).toEqual([
      "authoritative",
      "authoritative",
    ]);
  });
});

describe("snapshot changes", () => {
  it("compares the two latest validated snapshots and withholds email values", async () => {
    const { runtime: tools } = runtime();
    const envelope = await callAtlasMcpTool("atlas_get_snapshot_changes", { limit: 100 }, tools);
    const value = result(envelope);

    expect(value.fromSnapshot).toEqual({
      snapshotId: PREVIOUS_SNAPSHOT_ID,
      syncedAt: "2026-10-01T08:00:00.000Z",
    });
    expect(value.toSnapshot.snapshotId).toBe(SNAPSHOT_ID);
    expect(value.countsByType).toMatchObject({
      "item-added": 1,
      "item-modified": 1,
      "sensitivity-changed": 1,
      "access-grant-added": 2,
      "lineage-added": 1,
      "job-status-changed": 1,
    });
    const lakehouse = value.changes.find(
      (change: { type: string; itemId: string }) =>
        change.type === "item-modified" && change.itemId === LAKEHOUSE,
    );
    expect(lakehouse).toMatchObject({
      changedFields: ["health", "ownerEmail"],
      before: { health: "stale", ownerEmail: "[withheld]" },
      after: { health: "healthy", ownerEmail: "[withheld]" },
    });
    expect(JSON.stringify(value)).not.toMatch(/@contoso\.example/);
  });

  it("filters domains and reports when no earlier snapshot exists", async () => {
    const lineageOnly = runtime();
    const value = result(
      await callAtlasMcpTool(
        "atlas_get_snapshot_changes",
        { domains: ["lineage"] },
        lineageOnly.runtime,
      ),
    );
    expect(value.changes.map((change: { type: string }) => change.type)).toEqual(["lineage-added"]);

    const single = runtime({
      history: buildAtlasHistory([snapshotFromData(currentSnapshot())]),
    });
    const envelope = await callAtlasMcpTool("atlas_get_snapshot_changes", {}, single.runtime);
    expect(result(envelope)).toMatchObject({ fromSnapshot: null, changes: [] });
    expect(envelope.coverage).toMatchObject({ status: "unavailable" });
  });

  it("refuses history that does not contain the current snapshot", async () => {
    const other = currentSnapshot();
    other.workspace.snapshotId = "99999999-9999-4999-8999-999999999999";
    const { runtime: tools } = runtime({
      history: buildAtlasHistory([snapshotFromData(other)]),
    });
    const envelope = await callAtlasMcpTool("atlas_get_snapshot_changes", {}, tools);
    expect(envelope.error?.code).toBe("history-unavailable");
  });
});
