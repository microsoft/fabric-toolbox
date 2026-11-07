import { describe, expect, it } from "vitest";
import { SAMPLE_DATA } from "./model";
import {
  buildSnapshotExport,
  canonicalJson,
  parseSnapshotExport,
  SnapshotExportError,
} from "./snapshot-export";

describe("snapshot export", () => {
  it("round-trips a snapshot with a matching manifest", () => {
    const exported = buildSnapshotExport(SAMPLE_DATA, "2026-01-01T00:00:00.000Z");
    const parsed = parseSnapshotExport(JSON.stringify(exported, null, 2));

    expect(parsed.snapshot).toEqual(exported.snapshot);
    expect(parsed.manifest.counts.items).toBe(SAMPLE_DATA.items.length);
    expect(parsed.manifest.workspaceId).toBe(SAMPLE_DATA.workspace.fabricId);
    expect(parsed.snapshot).not.toHaveProperty("comments");
    expect(parsed.snapshot).not.toHaveProperty("syncRuns");
  });

  it("rejects edited content and wrong counts", () => {
    const exported = buildSnapshotExport(SAMPLE_DATA, "2026-01-01T00:00:00.000Z");
    const edited = structuredClone(exported);
    edited.snapshot.items[0] = { ...edited.snapshot.items[0], displayName: "tampered" };
    expect(() => parseSnapshotExport(JSON.stringify(edited))).toThrow(/fingerprint/);

    const truncated = structuredClone(exported);
    truncated.snapshot.items.pop();
    expect(() => parseSnapshotExport(JSON.stringify(truncated))).toThrow(/items/);

    expect(() => parseSnapshotExport("{")).toThrow(SnapshotExportError);
    expect(() => parseSnapshotExport(JSON.stringify({ format: "other" }))).toThrow(
      SnapshotExportError,
    );
  });

  it("serializes keys canonically", () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe(
      '{"a":[1,{"d":2}],"b":1}',
    );
  });
});
