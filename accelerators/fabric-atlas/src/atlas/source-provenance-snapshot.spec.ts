import { describe, expect, it } from "vitest";
import type { SourceProvenanceStageEnvelope } from "../../rayfin/functions/src/workspace-source-provenance";
import { normalizeLineageEdges } from "./lineage";
import type { Edge, Item } from "./model";
import { sourceProvenanceSnapshot } from "./source-provenance-snapshot";

const WS = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const CONSUMER = "44444444-4444-4444-8444-444444444444";
function envelope(sourceWorkspace = WS): SourceProvenanceStageEnvelope {
  return {
    contractVersion: 1, stage: "source-provenance", authoritative: false, workspaceId: WS,
    collectedAt: "2026-10-02T12:00:00Z", summary: { status: "complete", code: "partial-unsupported" },
    items: [{
      id: CONSUMER, type: "Lakehouse", status: "complete", code: "partial-unsupported",
      shortcuts: {
        status: "complete", truncated: false, shortcuts: [{
          name: "Orders", path: "Tables/silver/Orders", targetType: "OneLake",
          oneLake: { workspaceId: sourceWorkspace, itemId: SOURCE, path: "Tables/gold/Orders" },
        }, { name: "Unresolved", path: "Files", targetType: "AdlsGen2" }],
      },
      materializedLakeViews: { status: "unsupported", code: "read-write-permission-required", definitions: [], truncated: false },
    }],
  };
}

describe("source provenance snapshot projection", () => {
  it("keeps explicit shortcut direction even when item types imply the opposite stage order", () => {
    const raw = sourceProvenanceSnapshot(envelope(), new Set([SOURCE, CONSUMER]));
    const items: Item[] = [
      { fabricId: SOURCE, displayName: "Source endpoint", itemType: "SQLEndpoint", health: "unknown", endorsement: "none", tags: [] },
      { fabricId: CONSUMER, displayName: "Consumer lake", itemType: "Lakehouse", health: "unknown", endorsement: "none", tags: [] },
    ];
    expect(normalizeLineageEdges(items, raw.lineage as Edge[])).toEqual([
      expect.objectContaining({ source: SOURCE, target: CONSUMER, relation: "onelake-shortcut" }),
    ]);
    expect(raw.schema?.[CONSUMER]).toEqual([
      { name: "silver.Orders", objectType: "Shortcut", source: "Fabric OneLake shortcuts API", columns: [], measures: [] },
    ]);
    expect(raw.sections?.sourceProvenance).toEqual({ status: "complete", code: "partial-unsupported" });
    expect(raw.config).toContainEqual(expect.objectContaining({ label: "external-shortcut unresolved", value: expect.stringContaining("connection-id-missing") }));
  });
  it("keeps foreign explicit IDs in configuration without inventing local graph endpoints or persisting extra payload", () => {
    const input = { ...envelope(OTHER), password: "SECRET_CANARY", rows: ["BUSINESS_ROWS_CANARY"] };
    const raw = sourceProvenanceSnapshot(input, new Set([SOURCE, CONSUMER]));
    expect(raw.lineage).toEqual([]);
    expect(raw.config).toContainEqual(expect.objectContaining({
      itemId: CONSUMER, label: "onelake-shortcut", value: expect.stringContaining(`workspace=${OTHER}; item=${SOURCE}`),
    }));
    expect(JSON.stringify(raw)).not.toMatch(/SECRET_CANARY|BUSINESS_ROWS_CANARY/);
  });
});
