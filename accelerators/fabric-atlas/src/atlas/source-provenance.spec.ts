import { describe, expect, it } from "vitest";
import type {
  SourceProvenanceItemEvidence,
  SourceProvenanceStageEnvelope,
} from "../../rayfin/functions/src/workspace-source-provenance";
import {
  buildSourceProvenance,
  externalConnectionKey,
  fabricItemNodeKey,
} from "./source-provenance";

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER_WS = "22222222-2222-4222-8222-222222222222";
const LAKEHOUSE = "33333333-3333-4333-8333-333333333333";
const MIRROR = "55555555-5555-4555-8555-555555555555";
const TARGET_LH = "77777777-7777-4777-8777-777777777777";
const LOCAL_LH = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CONN = "88888888-8888-4888-8888-888888888888";
const CONN2 = "99999999-9999-4999-8999-999999999999";
const ENDPOINT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MLV_DEF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COLLECTED_AT = "2026-10-02T16:00:00.000Z";

function lakehouse(): SourceProvenanceItemEvidence {
  return {
    id: LAKEHOUSE,
    type: "Lakehouse",
    status: "complete",
    shortcuts: {
      status: "complete",
      truncated: false,
      shortcuts: [
        { name: "sales", path: "/Tables", targetType: "OneLake", oneLake: { workspaceId: OTHER_WS, itemId: TARGET_LH, path: "Tables/sales" } },
        { name: "local", path: "Tables", targetType: "OneLake", oneLake: { workspaceId: WS, itemId: LOCAL_LH } },
        { name: "raw", path: "Files/landing", targetType: "AdlsGen2", connectionId: CONN },
        { name: "noaccess", path: "Files", targetType: "AmazonS3" },
        { name: "unresolvable", path: "Tables", targetType: "OneLake" },
        { name: "docs", path: "Files", targetType: "OneDriveSharePoint", connectionId: CONN2, sensitivityLabelSyncRequested: true },
      ],
    },
    materializedLakeViews: {
      status: "complete",
      truncated: false,
      definitions: [
        {
          id: MLV_DEF,
          displayName: "Gold chain",
          viewSelection: "Selected",
          selectedViews: ["silver.sales_mv"],
          lineageSelection: "Selected",
          lakehouses: [{ workspaceId: WS, itemId: LOCAL_LH }, { workspaceId: OTHER_WS, itemId: TARGET_LH }],
          variableReferences: 1,
          truncated: false,
        },
      ],
    },
  };
}

function mirror(): SourceProvenanceItemEvidence {
  return {
    id: MIRROR,
    type: "MirroredDatabase",
    status: "complete",
    mirroring: {
      status: "complete",
      properties: { status: "complete", sqlEndpointId: ENDPOINT },
      definition: {
        status: "complete",
        sourceType: "Snowflake",
        connectionId: CONN,
        externalStorages: [{ type: "AmazonS3", connectionId: CONN2 }],
        tableSelection: "selected",
        tables: [{ schema: "dbo", table: "orders" }],
        tablesTruncated: false,
      },
      replication: { status: "complete", state: "Running" },
    },
  };
}

function envelope(items: SourceProvenanceItemEvidence[] = [lakehouse(), mirror()]): SourceProvenanceStageEnvelope {
  return {
    contractVersion: 1,
    stage: "source-provenance",
    authoritative: false,
    workspaceId: WS,
    collectedAt: COLLECTED_AT,
    items,
    summary: { status: "complete" },
  };
}

const SNAPSHOT = new Set([LAKEHOUSE, MIRROR, LOCAL_LH, ENDPOINT]);

describe("source provenance contract", () => {
  it("creates edges only from explicit IDs and namespaced connection IDs", () => {
    const provenance = buildSourceProvenance(envelope(), SNAPSHOT);
    expect(provenance).toMatchObject({ contractVersion: 1, workspaceId: WS, authoritative: false });
    expect(
      provenance.edges.map((edge) => [edge.relation, edge.source.key, edge.consumer.itemId, edge.binding.field]),
    ).toEqual(
      expect.arrayContaining([
        ["onelake-shortcut", fabricItemNodeKey({ workspaceId: OTHER_WS, itemId: TARGET_LH }), LAKEHOUSE, "target.oneLake.itemId"],
        ["onelake-shortcut", fabricItemNodeKey({ workspaceId: WS, itemId: LOCAL_LH }), LAKEHOUSE, "target.oneLake.itemId"],
        ["external-shortcut", externalConnectionKey(CONN), LAKEHOUSE, "target.adlsGen2.connectionId"],
        ["external-shortcut", externalConnectionKey(CONN2), LAKEHOUSE, "target.oneDriveSharePoint.connectionId"],
        ["mirroring-source", externalConnectionKey(CONN), MIRROR, "source.typeProperties.connection"],
        ["mirroring-external-storage", externalConnectionKey(CONN2), MIRROR, "source.typeProperties.externalStorages.typeProperties.connection"],
        ["mirrored-sql-endpoint", fabricItemNodeKey({ workspaceId: WS, itemId: MIRROR }), ENDPOINT, "properties.sqlEndpointProperties.id"],
      ]),
    );
    expect(provenance.edges).toHaveLength(7);
    expect(provenance.edges.every((edge) => edge.authoritative === false && edge.observedAt === COLLECTED_AT)).toBe(true);
    const crossWorkspace = provenance.edges.find((edge) => edge.source.key.includes(TARGET_LH))!;
    expect(crossWorkspace.source).toMatchObject({ kind: "fabric-item", inSnapshot: false });
    const local = provenance.edges.find((edge) => edge.source.key.includes(LOCAL_LH))!;
    expect(local.source).toMatchObject({ kind: "fabric-item", inSnapshot: true });
    expect(provenance.edges.find((edge) => edge.relation === "mirroring-source")!.source).toEqual({
      kind: "external-connection",
      key: `fabric-connection:${CONN}`,
      connectionId: CONN,
      provider: "Snowflake",
    });
  });

  it("records missing identifiers as unresolved instead of fabricating edges", () => {
    const provenance = buildSourceProvenance(envelope(), SNAPSHOT);
    expect(provenance.unresolved.map((record) => [record.relation, record.reason, record.provider ?? "", record.location ?? ""])).toEqual([
      ["external-shortcut", "connection-id-missing", "AmazonS3", "Files/noaccess"],
      ["mlv-refresh-scope", "reference-by-variable", "", MLV_DEF],
      ["onelake-shortcut", "target-details-unavailable", "OneLake", "Tables/unresolvable"],
    ]);
    expect(provenance.edges.some((edge) => edge.binding.location === "Tables/unresolvable")).toBe(false);
    expect(provenance.coverage).toMatchObject({ items: 2, complete: 2, edges: 7, unresolved: 3, truncated: false });
  });

  it("never matches a shortcut name to an item with the same display name", () => {
    const provenance = buildSourceProvenance(
      envelope([
        {
          id: LAKEHOUSE,
          type: "Lakehouse",
          status: "complete",
          shortcuts: {
            status: "complete",
            truncated: false,
            shortcuts: [{ name: "Sales Lakehouse", path: "Tables", targetType: "OneLake" }],
          },
        },
      ]),
      SNAPSHOT,
    );
    expect(provenance.edges).toEqual([]);
    expect(provenance.unresolved).toHaveLength(1);
  });

  it("keeps policy origin separate from unverified destination enforcement", () => {
    const provenance = buildSourceProvenance(envelope(), SNAPSHOT);
    expect(provenance.policyOrigins.every((policy) => policy.destinationEnforcement === "not-verified")).toBe(true);
    expect(provenance.policyOrigins.map((policy) => [policy.mechanism, policy.origin, policy.evidence, policy.consumer.itemId])).toEqual(
      expect.arrayContaining([
        ["sensitivity-label-sync", "source-system", "configured", LAKEHOUSE],
        ["source-permission-replication", "source-system", "unavailable", MIRROR],
        ["target-access-evaluation", "shortcut-target", "unavailable", LAKEHOUSE],
      ]),
    );
    const labelSync = provenance.policyOrigins.find((policy) => policy.mechanism === "sensitivity-label-sync")!;
    expect(labelSync.detail).toMatch(/does not verify the resulting label/);
    expect(provenance.edges.some((edge) => edge.key === labelSync.edgeKey)).toBe(true);
  });

  it("models MLV refresh scope as Lakehouse-adjacent orchestration, not lineage", () => {
    const provenance = buildSourceProvenance(envelope(), SNAPSHOT);
    expect(provenance.materializedLakeViews).toEqual([
      expect.objectContaining({
        lakehouse: { workspaceId: WS, itemId: LAKEHOUSE },
        executionDefinitionId: MLV_DEF,
        selectedViews: ["silver.sales_mv"],
        includedLakehouses: [
          { workspaceId: WS, itemId: LOCAL_LH, inSnapshot: true },
          { workspaceId: OTHER_WS, itemId: TARGET_LH, inSnapshot: false },
        ],
        unresolvedReferences: 1,
      }),
    ]);
    expect(provenance.edges.some((edge) => edge.binding.field.includes("mlv"))).toBe(false);
  });

  it("is deterministic and replay-safe across item order and repeated evidence", () => {
    const first = buildSourceProvenance(envelope(), SNAPSHOT);
    const replay = buildSourceProvenance(envelope([mirror(), lakehouse(), lakehouse()]), SNAPSHOT);
    expect(replay.edges).toEqual(first.edges);
    expect(replay.unresolved).toEqual(first.unresolved);
    expect(replay.policyOrigins).toEqual(first.policyOrigins);
    expect(new Set(first.edges.map((edge) => edge.key)).size).toBe(first.edges.length);
  });

  it("ignores incomplete sections and keeps failure codes in coverage", () => {
    const failed: SourceProvenanceItemEvidence = {
      id: LAKEHOUSE,
      type: "Lakehouse",
      status: "failed",
      code: "rate-limited",
      shortcuts: { status: "failed", code: "rate-limited", shortcuts: [], truncated: false },
    };
    const denied: SourceProvenanceItemEvidence = {
      ...mirror(),
      status: "complete",
      code: "partial-unsupported",
      mirroring: {
        ...mirror().mirroring!,
        definition: { status: "unsupported", code: "read-write-permission-required", externalStorages: [], tables: [], tablesTruncated: false },
      },
    };
    const provenance = buildSourceProvenance(envelope([failed, denied]), SNAPSHOT);
    expect(provenance.edges.map((edge) => edge.relation)).toEqual(["mirrored-sql-endpoint"]);
    expect(provenance.coverage).toMatchObject({ failed: 1, complete: 1, codes: ["partial-unsupported", "rate-limited"] });
    expect(provenance.policyOrigins).toEqual([]);
  });
});
