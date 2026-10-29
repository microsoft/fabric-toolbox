import { beforeEach, describe, expect, it } from "vitest";
import { ATLAS_CONFIG } from "./config";
import {
  createItemRelationsEvidence,
  ItemRelationsContractError,
  recordItemRelationsFailure,
  recordItemRelationsResponse,
  type ItemRelationsEvidence,
} from "./item-relations-evidence";
import {
  evidenceFromRows,
  itemRelationsEvidenceRows,
  persistItemRelationsEvidence,
  readLatestItemRelationsEvidence,
  type ItemRelationsEvidenceApi,
  type ItemRelationsEvidencePersistInput,
} from "./item-relations-evidence-store";
import type { Edge, Item } from "./model";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "99999999-9999-4999-8999-999999999999";
const SNAPSHOT = "22222222-2222-4222-8222-222222222222";
const NEXT_SNAPSHOT = "33333333-3333-4333-8333-333333333333";
const CORRELATION = "44444444-4444-4444-8444-444444444444";
const LAKEHOUSE = "aaaaaaaa-0000-4000-8000-000000000001";
const MODEL = "aaaaaaaa-0000-4000-8000-000000000002";
const EXTERNAL = "bbbbbbbb-0000-4000-8000-000000000001";
const WRITER = "sync@example.com";
const EARLIER = "2026-09-01T08:00:00.000Z";
const LATER = "2026-10-01T08:00:00.000Z";

type Row = Record<string, unknown>;

function item(fabricId: string, itemType: Item["itemType"], displayName: string): Item {
  return { fabricId, itemType, displayName, health: "healthy", endorsement: "none", tags: [] };
}

const snapshot = {
  items: [item(LAKEHOUSE, "Lakehouse", "Sales lakehouse"), item(MODEL, "SemanticModel", "Sales model")],
  edges: [{ source: LAKEHOUSE, target: MODEL, relation: "Direct Lake" }] as Edge[],
  workspaceName: "Sales",
};

const upstream = {
  items: [
    { id: LAKEHOUSE, workspaceId: WORKSPACE, type: "Lakehouse", displayName: "Sales lakehouse" },
    { id: EXTERNAL, workspaceId: OTHER_WORKSPACE, type: "FutureItem", displayName: "Shared ✓ lakehouse" },
  ],
  relations: [
    // Datasource draws Sales model -> Sales lakehouse: opposite to the snapshot.
    { itemId: LAKEHOUSE, dependentOnItemId: MODEL, relationType: "Datasource" },
    { itemId: MODEL, dependentOnItemId: EXTERNAL, relationType: "FutureRelation" },
    { itemId: MODEL, dependentOnItemId: "cccccccc-0000-4000-8000-000000000001", relationType: "Shortcut" },
  ],
  workspaces: [{ id: OTHER_WORKSPACE, displayName: "Shared data" }],
};

function evidence(
  queries = [
    recordItemRelationsResponse(MODEL, "upstream", EARLIER, upstream),
    recordItemRelationsFailure(MODEL, "downstream", EARLIER, "throttled"),
  ],
  collectedAt = EARLIER,
): ItemRelationsEvidence {
  return createItemRelationsEvidence(WORKSPACE, collectedAt, queries);
}

function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([field, condition]) => {
    const expected = (condition as { eq: unknown }).eq;
    return String(row[field] ?? "").toLowerCase() === String(expected ?? "").toLowerCase();
  });
}

function memoryApi(rows: Row[] = []) {
  const calls = { create: [] as Row[], delete: [] as Row[] };
  let failCreate: ((row: Row) => boolean) | undefined;
  let failReads = false;
  const api: ItemRelationsEvidenceApi = {
    select() {
      let filter: Row = {};
      const query = {
        where(next: Row) {
          filter = next;
          return query;
        },
        first() {
          return query;
        },
        after() {
          return query;
        },
        async executePaginated() {
          if (failReads) throw new Error("network unavailable");
          return { items: rows.filter((row) => matches(row, filter)), hasNextPage: false };
        },
      };
      return query;
    },
    async create(row) {
      calls.create.push(row);
      if (failCreate?.(row)) throw new Error("write failed");
      rows.push({ ...row });
      return row;
    },
    async delete(filter) {
      calls.delete.push(filter);
      const index = rows.findIndex((row) => row.id === filter.id);
      if (index >= 0) rows.splice(index, 1);
    },
  };
  return {
    api,
    rows,
    calls,
    failCreates(predicate: (row: Row) => boolean) {
      failCreate = predicate;
    },
    failReads(value: boolean) {
      failReads = value;
    },
  };
}

function persistInput(
  value: ItemRelationsEvidence,
  overrides: Partial<ItemRelationsEvidencePersistInput> = {},
): ItemRelationsEvidencePersistInput {
  return {
    workspaceId: WORKSPACE,
    snapshotId: SNAPSHOT,
    correlationId: CORRELATION,
    writerEmail: WRITER,
    collection: {
      evidence: value,
      sampledItemCount: 1,
      workspaceItemCount: 2,
      stopReasons: ["deadline-exhausted"],
    },
    snapshot,
    ...overrides,
  };
}

describe("Item Relations evidence storage rows", () => {
  it("splits an envelope into ordered chunks and a manifest written last", async () => {
    const value = evidence();
    const rows = await itemRelationsEvidenceRows({
      workspaceId: WORKSPACE.toUpperCase(),
      snapshotId: SNAPSHOT,
      correlationId: CORRELATION,
      writerEmail: " SYNC@example.com ",
      evidence: {
        ...value,
        queries: Array.from({ length: 40 }, (_, index) =>
          recordItemRelationsResponse(
            `aaaaaaaa-0000-4000-8000-${String(index).padStart(12, "0")}`,
            "upstream",
            EARLIER,
            upstream,
          ),
        ),
      },
      coverage: { sampledItemCount: 40, workspaceItemCount: 120, stopReasons: ["throttled", "throttled"] },
      summary: {
        queryCount: 40,
        completeQueryCount: 40,
        preservedQueryCount: 0,
        failedQueryCount: 0,
        relationCount: 3,
        unresolvedCount: 1,
        crossWorkspaceCount: 1,
        conflictCount: 1,
      },
    });
    const manifest = rows.at(-1)!;
    const chunks = rows.slice(0, -1);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((row) => String(row.payload).length <= 3_200)).toBe(true);
    expect(chunks.map((row) => row.chunkIndex)).toEqual(chunks.map((_, index) => index + 1));
    expect(manifest).toMatchObject({
      rowType: "manifest",
      workspace_id: WORKSPACE,
      snapshotId: SNAPSHOT,
      correlationId: CORRELATION,
      writerEmail: WRITER,
      storageVersion: 1,
      chunkCount: chunks.length,
      payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      sampledItemCount: 40,
      workspaceItemCount: 120,
      stopReasons: "throttled",
      conflictCount: 1,
    });
    const restored = await evidenceFromRows(manifest, [...chunks].reverse(), WORKSPACE);
    expect(restored.snapshotId).toBe(SNAPSHOT);
    expect(restored.coverage).toEqual({ sampledItemCount: 40, workspaceItemCount: 120, stopReasons: ["throttled"] });
    expect((restored.envelope as ItemRelationsEvidence).queries).toHaveLength(40);
  });

  it("never splits a surrogate pair and keeps raw relation types", async () => {
    const value = evidence([
      recordItemRelationsResponse(MODEL, "upstream", EARLIER, {
        ...upstream,
        items: [
          ...upstream.items,
          ...Array.from({ length: 15 }, (_, index) => ({
            id: `dddddddd-0000-4000-8000-${String(index).padStart(12, "0")}`,
            workspaceId: OTHER_WORKSPACE,
            type: "Lakehouse",
            displayName: `${index}${"🔗".repeat(140)}`,
          })),
        ],
      }),
    ]);
    const rows = await itemRelationsEvidenceRows({
      workspaceId: WORKSPACE,
      snapshotId: SNAPSHOT,
      writerEmail: WRITER,
      evidence: value,
      coverage: { stopReasons: [] },
      summary: {
        queryCount: 1,
        completeQueryCount: 1,
        preservedQueryCount: 0,
        failedQueryCount: 0,
        relationCount: 3,
        unresolvedCount: 1,
        crossWorkspaceCount: 1,
        conflictCount: 1,
      },
    });
    expect(rows.length).toBeGreaterThan(2);
    for (const chunk of rows.slice(0, -1)) {
      const payload = String(chunk.payload);
      const last = payload.charCodeAt(payload.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    }
    const restored = await evidenceFromRows(rows.at(-1)!, rows.slice(0, -1), WORKSPACE);
    expect(
      (restored.envelope as ItemRelationsEvidence).queries[0].response?.relations.map(
        (relation) => relation.relationType,
      ),
    ).toEqual(["Datasource", "FutureRelation", "Shortcut"]);
  });

  it.each([
    ["a tampered chunk", (rows: Row[]) => (rows[0].payload = `${rows[0].payload} `)],
    ["a missing chunk", (rows: Row[]) => rows.splice(0, 1)],
    ["another workspace", (rows: Row[]) => (rows.at(-1)!.workspace_id = OTHER_WORKSPACE)],
    ["an unknown storage version", (rows: Row[]) => (rows.at(-1)!.storageVersion = 2)],
    ["a chunk from another envelope", (rows: Row[]) => (rows[0].evidenceId = CORRELATION)],
  ])("rejects %s", async (_label, damage) => {
    const rows = await itemRelationsEvidenceRows({
      workspaceId: WORKSPACE,
      snapshotId: SNAPSHOT,
      writerEmail: WRITER,
      evidence: evidence(),
      coverage: { stopReasons: [] },
      summary: {
        queryCount: 2,
        completeQueryCount: 1,
        preservedQueryCount: 0,
        failedQueryCount: 1,
        relationCount: 3,
        unresolvedCount: 1,
        crossWorkspaceCount: 1,
        conflictCount: 1,
      },
    });
    damage(rows);

    await expect(
      evidenceFromRows(rows.at(-1)!, rows.slice(0, -1), WORKSPACE),
    ).rejects.toBeInstanceOf(ItemRelationsContractError);
  });
});

describe("Item Relations evidence persistence", () => {
  beforeEach(() => {
    ATLAS_CONFIG.syncAdminEmail = WRITER;
    ATLAS_CONFIG.previousSyncWriters = [];
  });

  it("reports no evidence when nothing was stored", async () => {
    await expect(
      readLatestItemRelationsEvidence(WORKSPACE, undefined, memoryApi().api),
    ).resolves.toBeNull();
  });

  it("stores a real collection after publication and reads it back with its coverage", async () => {
    const store = memoryApi();

    const result = await persistItemRelationsEvidence(persistInput(evidence()), store.api);

    expect(result).toMatchObject({
      status: "persisted",
      summary: {
        queryCount: 2,
        completeQueryCount: 1,
        failedQueryCount: 1,
        relationCount: 3,
        unresolvedCount: 1,
        crossWorkspaceCount: 1,
        conflictCount: 1,
      },
    });
    expect(store.calls.create.at(-1)?.rowType).toBe("manifest");
    expect(
      store.calls.create.slice(0, -1).every((row) => row.rowType === "chunk"),
    ).toBe(true);
    const loaded = await readLatestItemRelationsEvidence(WORKSPACE, undefined, store.api);
    expect(loaded).toMatchObject({
      snapshotId: SNAPSHOT,
      coverage: { sampledItemCount: 1, workspaceItemCount: 2, stopReasons: ["deadline-exhausted"] },
    });
    expect((loaded!.envelope as ItemRelationsEvidence).queries[0].response).toEqual(
      evidence().queries[0].response,
    );
  });

  it("preserves prior responses when a later collection fails or stops early", async () => {
    const store = memoryApi();
    await persistItemRelationsEvidence(persistInput(evidence()), store.api);

    const result = await persistItemRelationsEvidence(
      persistInput(
        evidence(
          [
            recordItemRelationsFailure(MODEL, "upstream", LATER, "unauthorized"),
            recordItemRelationsFailure(MODEL, "downstream", LATER, "not-attempted"),
          ],
          LATER,
        ),
        { snapshotId: NEXT_SNAPSHOT },
      ),
      store.api,
    );

    expect(result).toMatchObject({
      status: "persisted",
      summary: { preservedQueryCount: 1, failedQueryCount: 1, conflictCount: 1 },
    });
    const loaded = await readLatestItemRelationsEvidence(WORKSPACE, undefined, store.api);
    const queries = (loaded!.envelope as ItemRelationsEvidence).queries;
    expect(loaded!.snapshotId).toBe(NEXT_SNAPSHOT);
    expect(queries[0]).toMatchObject({
      status: "failed",
      failureCode: "unauthorized",
      attemptedAt: LATER,
      observedAt: EARLIER,
      response: evidence().queries[0].response,
    });
    expect(queries[1]).toMatchObject({ failureCode: "not-attempted" });
    expect(queries[1].response).toBeUndefined();
  });

  it("does not replace visible evidence when prior evidence cannot be read", async () => {
    const store = memoryApi();
    await persistItemRelationsEvidence(persistInput(evidence()), store.api);
    const written = store.calls.create.length;
    store.failReads(true);

    await expect(
      persistItemRelationsEvidence(
        persistInput(evidence([], LATER), { snapshotId: NEXT_SNAPSHOT }),
        store.api,
      ),
    ).resolves.toEqual({ status: "skipped", reason: "prior-evidence-unreadable" });
    expect(store.calls.create).toHaveLength(written);
  });

  it("rolls back chunks and publishes no manifest when a write fails", async () => {
    const store = memoryApi();
    store.failCreates((row) => row.rowType === "manifest");

    await expect(
      persistItemRelationsEvidence(persistInput(evidence()), store.api),
    ).rejects.toThrow("write failed");
    expect(store.calls.create.some((row) => row.rowType === "chunk")).toBe(true);
    expect(store.rows).toEqual([]);
    await expect(
      readLatestItemRelationsEvidence(WORKSPACE, undefined, store.api),
    ).resolves.toBeNull();
  });

  it("retries a create that failed without committing", async () => {
    const store = memoryApi();
    let failures = 0;
    store.failCreates(() => failures++ === 0);

    await expect(
      persistItemRelationsEvidence(persistInput(evidence()), store.api),
    ).resolves.toMatchObject({ status: "persisted" });
    const ids = store.rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("falls back to the newest valid envelope and ignores untrusted writers", async () => {
    const store = memoryApi();
    await persistItemRelationsEvidence(persistInput(evidence()), store.api);
    await persistItemRelationsEvidence(
      persistInput(evidence([recordItemRelationsResponse(MODEL, "upstream", LATER, upstream)], LATER), {
        snapshotId: NEXT_SNAPSHOT,
      }),
      store.api,
    );
    const newest = store.rows.find(
      (row) => row.rowType === "chunk" && row.snapshotId === NEXT_SNAPSHOT,
    )!;
    newest.payload = `${newest.payload}x`;
    store.rows.push({
      ...store.rows.find((row) => row.rowType === "manifest")!,
      id: crypto.randomUUID(),
      evidenceId: crypto.randomUUID(),
      writerEmail: "intruder@example.com",
      collectedAt: new Date("2026-12-01T00:00:00.000Z"),
    });

    const loaded = await readLatestItemRelationsEvidence(WORKSPACE, undefined, store.api);

    expect(loaded?.snapshotId).toBe(SNAPSHOT);
  });

  it("throws a contract error when every stored envelope is invalid", async () => {
    const store = memoryApi();
    await persistItemRelationsEvidence(persistInput(evidence()), store.api);
    for (const row of store.rows) {
      if (row.rowType === "chunk") row.payload = "{}";
    }

    await expect(
      readLatestItemRelationsEvidence(WORKSPACE, undefined, store.api),
    ).rejects.toBeInstanceOf(ItemRelationsContractError);
  });

  it("keeps the three newest envelopes", async () => {
    const store = memoryApi();
    for (let index = 0; index < 5; index += 1) {
      await persistItemRelationsEvidence(
        persistInput(
          evidence(
            [recordItemRelationsResponse(MODEL, "upstream", `2026-10-0${index + 1}T08:00:00.000Z`, upstream)],
            `2026-10-0${index + 1}T08:00:00.000Z`,
          ),
        ),
        store.api,
      );
    }

    const manifests = store.rows.filter((row) => row.rowType === "manifest");
    expect(manifests).toHaveLength(3);
    expect(
      manifests.map((row) => new Date(row.collectedAt as Date).toISOString()).sort(),
    ).toEqual([
      "2026-10-03T08:00:00.000Z",
      "2026-10-04T08:00:00.000Z",
      "2026-10-05T08:00:00.000Z",
    ]);
    const evidenceIds = new Set(manifests.map((row) => row.evidenceId));
    expect(store.rows.every((row) => evidenceIds.has(row.evidenceId))).toBe(true);
  });
});
