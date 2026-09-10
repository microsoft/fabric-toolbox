import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_DATA } from "./model";
import {
  metadataObjectLineageEdges,
  parseOntologyMetadata,
  projectItemMetadataToSchema,
} from "./item-metadata";
import {
  loadCommentsFromDb,
  loadFromDb,
  loadHistoryFromDb,
  persistComment,
  readWithRetry,
  runFabricSync,
  snapshotSummaryFromManifest,
} from "./backend";
import { ATLAS_CONFIG } from "./config";
import { DEPLOYMENT_ID } from "./release";

const mocks = vi.hoisted(() => {
  const names = [
    "Workspace",
    "FabricItem",
    "LineageEdge",
    "Principal",
    "AccessGrant",
    "JobRun",
    "ConfigEntry",
    "Comment",
    "SyncRun",
  ];
  const data = Object.fromEntries(
    names.map((name) => {
      const api = {
        rows: [] as Record<string, unknown>[],
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        select: vi.fn(),
      };
      return [name, api];
    }),
  );
  return {
    data,
    invokeSyncAll: vi.fn(),
    mapSyncToAtlas: vi.fn(),
  };
});

vi.mock("@/lib/rayfin-client", () => ({
  getRayfinClient: () => ({ data: mocks.data }),
}));

vi.mock("./live-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./live-sync")>();
  return {
    ...actual,
    invokeSyncAll: mocks.invokeSyncAll,
    mapSyncToAtlas: mocks.mapSyncToAtlas,
  };
});

const workspaceId = "11111111-1111-4111-8111-111111111111";
const identity = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "user@example.com",
  email: "user@example.com",
};

it("reads beyond the former 100-page snapshot limit", async () => {
  let pageIndex = 0;
  const query = {
    where: vi.fn(),
    first: vi.fn(),
    after: vi.fn(),
    executePaginated: vi.fn(async () => {
      const current = pageIndex++;
      return {
        items: [{ id: `row-${current}` }],
        hasNextPage: current < 100,
        endCursor: current < 100 ? `cursor-${current}` : undefined,
      };
    }),
  };
  query.where.mockReturnValue(query);
  query.first.mockReturnValue(query);
  query.after.mockReturnValue(query);

  const rows = await readWithRetry(
    {
      select: vi.fn(() => query),
      create: vi.fn(),
    },
    ["id"],
    {},
  );

  expect(rows).toHaveLength(101);
});

function summaryMarker(
  snapshotId: string,
  syncedAt: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `marker-${snapshotId}`,
    snapshotId,
    writerEmail: identity.email,
    fabricId: workspaceId,
    displayName: "Historical",
    itemCount: 0,
    edgeCount: 0,
    principalCount: 0,
    grantCount: 0,
    jobCount: 0,
    configCount: 0,
    schemaEntryCount: 0,
    summaryVersion: 1,
    healthyCount: 0,
    staleCount: 0,
    failingCount: 0,
    labelCount: 0,
    externalPrincipalCount: 0,
    failedJobCount: 0,
    brokenEdgeCount: 0,
    tableCount: 0,
    columnCount: 0,
    measureCount: 0,
    syncedAt,
    ...overrides,
  };
}

describe("Rayfin snapshot persistence", () => {
  beforeEach(() => {
    ATLAS_CONFIG.syncAdminEmail = identity.email;
    ATLAS_CONFIG.syncAdminSubject = identity.id;
    ATLAS_CONFIG.snapshotRetentionCount = 12;
    ATLAS_CONFIG.previousSyncWriters = [];
    (
      window as unknown as { __atlasWorkspaceId?: string }
    ).__atlasWorkspaceId = workspaceId;
    for (const api of Object.values(mocks.data)) {
      api.rows.length = 0;
      api.findMany.mockReset().mockImplementation(async (filter = {}) =>
        api.rows.filter((row) =>
          Object.entries(filter as Record<string, unknown>).every(
            ([field, condition]) => {
              const expected =
                condition &&
                typeof condition === "object" &&
                "eq" in condition
                  ? (condition as { eq: unknown }).eq
                  : condition;
              return String(row[field] ?? "").toLowerCase() ===
                String(expected ?? "").toLowerCase();
            },
          ),
        ),
      );
      api.create.mockReset().mockImplementation(async (row) => {
        const stored = {
          id: (row as Record<string, unknown>).id ?? crypto.randomUUID(),
          ...(row as Record<string, unknown>),
        };
        api.rows.push(stored);
        return stored;
      });
      api.update.mockReset().mockImplementation(async (filter, values) => {
        const id = String((filter as { id?: unknown }).id ?? "");
        const row = api.rows.find((candidate) => String(candidate.id) === id);
        if (row) Object.assign(row, values);
        return row;
      });
      api.delete.mockReset().mockImplementation(async (filter) => {
        const id = String((filter as { id?: unknown }).id ?? "");
        const index = api.rows.findIndex((row) => String(row.id) === id);
        if (index >= 0) api.rows.splice(index, 1);
      });
      api.select.mockReset().mockImplementation(() => {
        let filter: Record<string, unknown> = {};
        const query = {
          where(nextFilter: Record<string, unknown>) {
            filter = nextFilter;
            return query;
          },
          first() {
            return query;
          },
          after() {
            return query;
          },
          async executePaginated() {
            const mocked = await api.findMany(filter);
            const persisted = api.rows.filter((row) =>
              Object.entries(filter).every(([field, condition]) => {
                const expected =
                  condition &&
                  typeof condition === "object" &&
                  "eq" in condition
                    ? (condition as { eq: unknown }).eq
                    : condition;
                return String(row[field] ?? "").toLowerCase() ===
                  String(expected ?? "").toLowerCase();
              }),
            );
            const seen = new Set<string>();
            return {
              items: [...mocked, ...persisted].filter((row) => {
                const id = String(row.id ?? JSON.stringify(row));
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
              }),
              hasNextPage: false,
            };
          },
        };
        return query;
      });
    }
    mocks.invokeSyncAll.mockReset().mockResolvedValue({});
    mocks.mapSyncToAtlas
      .mockReset()
      .mockReturnValue(structuredClone(SAMPLE_DATA));
  });

  it("does not publish a Workspace marker when an individual write fails", async () => {
    mocks.data.FabricItem.create.mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    await expect(runFabricSync(false, identity)).rejects.toThrow(
      "database unavailable",
    );
    expect(mocks.data.Workspace.create).not.toHaveBeenCalled();
    expect(
      mocks.data.SyncRun.create.mock.calls.map(([row]) => row.status),
    ).toEqual(["running"]);
    expect(mocks.data.SyncRun.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ status: "failed" }),
    );
    expect(
      Object.entries(mocks.data)
        .filter(([name]) => name !== "SyncRun")
        .some(([, api]) => api.delete.mock.calls.length),
    ).toBe(false);
  });

  it("persists and reloads the authenticated comment display name", async () => {
    const comment = {
      id: "33333333-3333-4333-8333-333333333333",
      authorId: identity.id,
      authorName: identity.email,
      authorEmail: identity.email,
      body: "Document the refresh owner.",
      createdAt: "2026-08-30T15:00:00.000Z",
    };

    await persistComment(false, comment);
    expect(mocks.data.Comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: identity.id,
        authorName: identity.email,
        authorEmail: identity.email,
      }),
    );

    mocks.data.Workspace.findMany.mockResolvedValue([
      summaryMarker(
        "44444444-4444-4444-8444-444444444444",
        "2026-08-30T15:00:00.000Z",
      ),
    ]);

    const comments = await loadCommentsFromDb(false);
    expect(comments).toEqual([
      expect.objectContaining({
        authorName: identity.email,
        authorEmail: identity.email,
      }),
    ]);
  });

  it("rejects snapshot publication from a different authenticated user", async () => {
    await expect(
      runFabricSync(false, {
        id: "33333333-3333-4333-8333-333333333333",
        name: "viewer@example.com",
        email: "viewer@example.com",
      }),
    ).rejects.toThrow(/configured Atlas sync administrator/i);
    await expect(
      runFabricSync(false, {
        id: "33333333-3333-4333-8333-333333333333",
        name: identity.email,
        email: identity.email,
      }),
    ).rejects.toThrow(/configured Atlas sync administrator/i);
    expect(mocks.invokeSyncAll).not.toHaveBeenCalled();
  });

  it("publishes the manifest only after all snapshot rows succeed", async () => {
    const persisted = await runFabricSync(false, identity);
    expect(persisted).toMatchObject({
      items: SAMPLE_DATA.items,
      workspace: {
        deploymentId: DEPLOYMENT_ID,
        snapshotId: expect.any(String),
        syncedAt: expect.any(String),
      },
    });

    expect(mocks.data.Workspace.create).toHaveBeenCalledTimes(1);
    const markerOrder =
      mocks.data.Workspace.create.mock.invocationCallOrder[0];
    const contentOrders = [
      "FabricItem",
      "LineageEdge",
      "Principal",
      "AccessGrant",
      "JobRun",
      "ConfigEntry",
      "SyncRun",
    ].flatMap(
      (name) =>
        mocks.data[name].create.mock.invocationCallOrder as number[],
    );
    expect(Math.max(...contentOrders)).toBeLessThan(markerOrder);
    expect(mocks.data.SyncRun.create).toHaveBeenCalledTimes(1);
    expect(mocks.data.SyncRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "running",
        correlationId: expect.any(String),
      }),
    );
    expect(mocks.data.SyncRun.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        status: "completed",
        durationMs: expect.any(Number),
      }),
    );
    expect(mocks.data.SyncRun.delete).not.toHaveBeenCalled();
  });

  it("retries the completed SyncRun update before publishing the manifest", async () => {
    mocks.data.SyncRun.update.mockRejectedValueOnce(
      new Error("temporary update failure"),
    );

    await expect(runFabricSync(false, identity)).resolves.toBeTruthy();

    expect(mocks.data.SyncRun.update).toHaveBeenCalledTimes(2);
    expect(mocks.data.Workspace.create).toHaveBeenCalledTimes(1);
  });

  it("does not publish the manifest when synchronization is cancelled during persistence", async () => {
    const controller = new AbortController();
    mocks.data.FabricItem.create.mockImplementationOnce(async (row) => {
      controller.abort();
      return row;
    });

    await expect(
      runFabricSync(false, identity, undefined, controller.signal),
    ).rejects.toThrow(/synchronization cancelled/i);

    expect(mocks.data.Workspace.create).not.toHaveBeenCalled();
    expect(mocks.data.SyncRun.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("preserves principal workspace roles through persistence and hydration", async () => {
    const atlas = structuredClone(SAMPLE_DATA);
    atlas.workspace.fabricId = workspaceId;
    atlas.principals[0].workspaceRole = "Admin";
    mocks.mapSyncToAtlas.mockReturnValue(atlas);

    await runFabricSync(false, identity);
    const hydrated = await loadFromDb(false);

    expect(mocks.data.Principal.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceRole: "Admin" }),
    );
    expect(hydrated?.principals[0].workspaceRole).toBe("Admin");
  });

  it("cleans orphan snapshot rows after a later successful publication", async () => {
    const orphanSnapshotId = "99999999-9999-4999-8999-999999999999";
    mocks.data.SyncRun.rows.push({
      id: "orphan-attempt",
      workspace_id: workspaceId,
      snapshotId: orphanSnapshotId,
      writerEmail: identity.email,
      startedAt: new Date("2026-09-05T10:00:00.000Z"),
      finishedAt: new Date("2026-09-05T10:01:00.000Z"),
      status: "failed",
    });
    mocks.data.FabricItem.rows.push({
      id: "orphan-item",
      workspace_id: workspaceId,
      snapshotId: orphanSnapshotId,
      writerEmail: identity.email,
      fabricId: "orphan",
      displayName: "Orphan",
      itemType: "Lakehouse",
    });

    await runFabricSync(false, identity);

    expect(mocks.data.FabricItem.delete).toHaveBeenCalledWith({
      id: "orphan-item",
    });
    expect(
      mocks.data.SyncRun.rows.some((row) => row.id === "orphan-attempt"),
    ).toBe(true);
  });

  it("keeps young unpublished attempts inside the orphan grace period", async () => {
    const orphanSnapshotId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    mocks.data.SyncRun.rows.push({
      id: "young-attempt",
      workspace_id: workspaceId,
      snapshotId: orphanSnapshotId,
      writerEmail: identity.email,
      startedAt: new Date(),
      finishedAt: new Date(),
      status: "failed",
    });
    mocks.data.FabricItem.rows.push({
      id: "young-item",
      workspace_id: workspaceId,
      snapshotId: orphanSnapshotId,
      writerEmail: identity.email,
      fabricId: "young",
      displayName: "Young",
      itemType: "Lakehouse",
    });

    await runFabricSync(false, identity);

    expect(mocks.data.FabricItem.delete).not.toHaveBeenCalledWith({
      id: "young-item",
    });
  });

  it("writes snapshot rows with bounded concurrency", async () => {
    const atlas = structuredClone(SAMPLE_DATA);
    atlas.items = Array.from({ length: 20 }, (_, index) => ({
      ...atlas.items[0],
      fabricId: `item-${index}`,
      displayName: `Item ${index}`,
    }));
    atlas.schema = {};
    atlas.itemMetadata = {};
    atlas.objectEdges = [];
    mocks.mapSyncToAtlas.mockReturnValue(atlas);
    let active = 0;
    let maximumActive = 0;
    mocks.data.FabricItem.create.mockImplementation(async (row) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      const stored = {
        id: crypto.randomUUID(),
        ...(row as Record<string, unknown>),
      };
      mocks.data.FabricItem.rows.push(stored);
      return stored;
    });

    await runFabricSync(false, identity);

    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(8);
    expect(mocks.data.FabricItem.create).toHaveBeenCalledTimes(20);
  });

  it("drains a failed batch before stopping snapshot publication", async () => {
    const atlas = structuredClone(SAMPLE_DATA);
    atlas.items = Array.from({ length: 12 }, (_, index) => ({
      ...atlas.items[0],
      fabricId: `item-${index}`,
      displayName: `Item ${index}`,
    }));
    mocks.mapSyncToAtlas.mockReturnValue(atlas);
    let settled = 0;
    mocks.data.FabricItem.create.mockImplementation(async (row) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      settled += 1;
      if ((row as Record<string, unknown>).fabricId === "item-3") {
        throw new Error("batch failed");
      }
      return row;
    });

    await expect(runFabricSync(false, identity)).rejects.toThrow(
      "batch failed",
    );

    expect(mocks.data.FabricItem.create).toHaveBeenCalledTimes(8);
    expect(settled).toBe(8);
    expect(mocks.data.Principal.create).not.toHaveBeenCalled();
    expect(
      mocks.data.SyncRun.create.mock.calls.map(([row]) => row.status),
    ).toEqual(["running"]);
    expect(mocks.data.SyncRun.update).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ status: "failed" }),
    );
    expect(mocks.data.Workspace.create).not.toHaveBeenCalled();
  });

  it("persists Fabric item metadata provenance and sync section status", async () => {
    const atlas = structuredClone(SAMPLE_DATA);
    atlas.items[0].createdAt = "2026-08-20T08:00:00.000Z";
    atlas.items[0].updatedAt = "2026-08-29T08:00:00.000Z";
    atlas.items[0].configuredBy = "builder@example.com";
    atlas.items[0].endorsementRaw = "Certified";
    atlas.items[0].endorsementBy = "certifier@example.com";
    atlas.items[0].sensitivityLabelId = "label-guid";
    atlas.items[0].tagIds = ["tag-guid"];
    atlas.items[0].ownerMetadataAvailable = false;
    atlas.items[0].sensitivityMetadataAvailable = true;
    atlas.items[0].endorsementMetadataAvailable = true;
    atlas.items[0].tagMetadataAvailable = true;
    atlas.workspace.syncSections = {
      scanner: { status: "complete" },
      jobs: { status: "unsupported", code: "unsupported-item-types" },
    };
    mocks.mapSyncToAtlas.mockReturnValue(atlas);

    await runFabricSync(false, identity);

    expect(mocks.data.FabricItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        itemCreatedAt: new Date("2026-08-20T08:00:00.000Z"),
        itemUpdatedAt: new Date("2026-08-29T08:00:00.000Z"),
        configuredBy: "builder@example.com",
        endorsementRaw: "Certified",
        endorsementBy: "certifier@example.com",
        sensitivityLabelId: "label-guid",
        tagIds: "tag-guid",
        ownerMetadataAvailable: false,
        sensitivityMetadataAvailable: true,
        endorsementMetadataAvailable: true,
        tagMetadataAvailable: true,
      }),
    );
    expect(mocks.data.Workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        syncSectionsJson: JSON.stringify(atlas.workspace.syncSections),
        summaryVersion: 1,
        healthyCount: expect.any(Number),
        labelCount: expect.any(Number),
        tableCount: expect.any(Number),
      }),
    );
  });

  it("prunes only stale trusted snapshots after publishing the new manifest", async () => {
    ATLAS_CONFIG.snapshotRetentionCount = 2;
    const oldSnapshots = [
      {
        id: "workspace-old-1",
        snapshotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        writerEmail: identity.email,
        fabricId: workspaceId,
        displayName: "Old 1",
        itemCount: 1,
        edgeCount: 0,
        principalCount: 0,
        grantCount: 0,
        jobCount: 0,
        configCount: 0,
        schemaEntryCount: 0,
        summaryVersion: 1,
        healthyCount: 1,
        staleCount: 0,
        failingCount: 0,
        labelCount: 0,
        externalPrincipalCount: 0,
        failedJobCount: 0,
        brokenEdgeCount: 0,
        tableCount: 0,
        columnCount: 0,
        measureCount: 0,
        syncedAt: "2026-08-29T20:00:00.000Z",
      },
      {
        id: "workspace-old-2",
        snapshotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
        writerEmail: identity.email,
        fabricId: workspaceId,
        displayName: "Old 2",
        itemCount: 1,
        edgeCount: 0,
        principalCount: 0,
        grantCount: 0,
        jobCount: 0,
        configCount: 0,
        schemaEntryCount: 0,
        summaryVersion: 1,
        healthyCount: 1,
        staleCount: 0,
        failingCount: 0,
        labelCount: 0,
        externalPrincipalCount: 0,
        failedJobCount: 0,
        brokenEdgeCount: 0,
        tableCount: 0,
        columnCount: 0,
        measureCount: 0,
        syncedAt: "2026-08-28T20:00:00.000Z",
      },
    ];
    mocks.data.Workspace.findMany.mockImplementation(async () => {
      const published = mocks.data.Workspace.create.mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;
      return published
        ? [
            {
              ...published,
              id: "workspace-current",
              fabricId: workspaceId,
            },
            ...oldSnapshots,
          ]
        : oldSnapshots;
    });
    mocks.data.FabricItem.findMany.mockImplementation(async (filter) => {
      const snapshotId = (
        filter as { snapshotId?: { eq?: string } }
      ).snapshotId?.eq;
      if (snapshotId === oldSnapshots[1].snapshotId) {
        return [
          {
            id: "item-old-2",
            workspace_id: workspaceId,
            snapshotId,
            writerEmail: identity.email,
            fabricId: "old-item",
            displayName: "Old item",
            itemType: "Lakehouse",
            health: "healthy",
            endorsement: "none",
          },
          {
            id: "forged-item",
            workspace_id: workspaceId,
            snapshotId,
            writerEmail: "viewer@example.com",
            fabricId: "forged",
            displayName: "Forged",
            itemType: "Lakehouse",
            health: "healthy",
            endorsement: "none",
          },
        ];
      }
      return [];
    });

    await expect(runFabricSync(false, identity)).resolves.toBeTruthy();

    expect(mocks.data.FabricItem.delete).toHaveBeenCalledWith({
      id: "item-old-2",
    });
    expect(mocks.data.FabricItem.delete).not.toHaveBeenCalledWith({
      id: "forged-item",
    });
    expect(mocks.data.Workspace.delete).toHaveBeenCalledWith({
      id: "workspace-old-2",
    });
    expect(mocks.data.Workspace.delete).not.toHaveBeenCalledWith({
      id: "workspace-old-1",
    });
    expect(
      mocks.data.Workspace.create.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.data.FabricItem.delete.mock.invocationCallOrder[0]);
    expect(
      mocks.data.FabricItem.delete.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.data.Workspace.delete.mock.invocationCallOrder[0]);
  });

  it("keeps a published snapshot successful when retention is deferred", async () => {
    ATLAS_CONFIG.snapshotRetentionCount = 2;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const staleSnapshot = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    mocks.data.Workspace.findMany.mockImplementation(async () => {
      const published = mocks.data.Workspace.create.mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;
      return [
        {
          ...published,
          id: "workspace-current",
          fabricId: workspaceId,
        },
        {
          id: "workspace-retained",
          snapshotId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
          writerEmail: identity.email,
          fabricId: workspaceId,
          displayName: "Retained",
          itemCount: 0,
          edgeCount: 0,
          principalCount: 0,
          grantCount: 0,
          jobCount: 0,
          configCount: 0,
          schemaEntryCount: 0,
          summaryVersion: 1,
          healthyCount: 0,
          staleCount: 0,
          failingCount: 0,
          labelCount: 0,
          externalPrincipalCount: 0,
          failedJobCount: 0,
          brokenEdgeCount: 0,
          tableCount: 0,
          columnCount: 0,
          measureCount: 0,
          syncedAt: "2026-08-29T20:00:00.000Z",
        },
        {
          id: "workspace-stale",
          snapshotId: staleSnapshot,
          writerEmail: identity.email,
          fabricId: workspaceId,
          displayName: "Stale",
          itemCount: 1,
          edgeCount: 0,
          principalCount: 0,
          grantCount: 0,
          jobCount: 0,
          configCount: 0,
          schemaEntryCount: 0,
          summaryVersion: 1,
          healthyCount: 1,
          staleCount: 0,
          failingCount: 0,
          labelCount: 0,
          externalPrincipalCount: 0,
          failedJobCount: 0,
          brokenEdgeCount: 0,
          tableCount: 0,
          columnCount: 0,
          measureCount: 0,
          syncedAt: "2026-08-28T20:00:00.000Z",
        },
      ];
    });
    mocks.data.FabricItem.findMany.mockResolvedValue([
      {
        id: "stale-item",
        workspace_id: workspaceId,
        snapshotId: staleSnapshot,
        writerEmail: identity.email,
        fabricId: "stale-item",
        displayName: "Stale item",
        itemType: "Lakehouse",
        health: "healthy",
        endorsement: "none",
      },
    ]);
    mocks.data.FabricItem.delete.mockRejectedValueOnce(
      new Error("cleanup unavailable"),
    );

    await expect(runFabricSync(false, identity)).resolves.toBeTruthy();
    expect(mocks.data.Workspace.create).toHaveBeenCalledTimes(1);
    expect(mocks.data.Workspace.delete).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      "[atlas] snapshot retention deferred",
      expect.any(Error),
    );
    warning.mockRestore();
  });

  it("retries a partially deleted stale snapshot idempotently", async () => {
    ATLAS_CONFIG.snapshotRetentionCount = 2;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const retained = summaryMarker(
      "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      "2026-08-29T20:00:00.000Z",
    );
    const partial = summaryMarker(
      "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
      "2026-08-28T20:00:00.000Z",
      {
        id: "workspace-partial",
        itemCount: 2,
        healthyCount: 2,
        summaryVersion: undefined,
      },
    );
    mocks.data.Workspace.findMany.mockImplementation(async () => {
      const published = mocks.data.Workspace.create.mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;
      return [
        {
          ...published,
          id: "workspace-current",
          fabricId: workspaceId,
        },
        retained,
        partial,
      ];
    });
    mocks.data.FabricItem.findMany.mockImplementation(async (filter) => {
      const snapshotId = (
        filter as { snapshotId?: { eq?: string } }
      ).snapshotId?.eq;
      return snapshotId === partial.snapshotId
        ? [
            {
              id: "remaining-item",
              workspace_id: workspaceId,
              snapshotId,
              writerEmail: identity.email,
              fabricId: "remaining",
              displayName: "Remaining",
              itemType: "Lakehouse",
              health: "healthy",
              endorsement: "none",
            },
          ]
        : [];
    });

    await expect(runFabricSync(false, identity)).resolves.toBeTruthy();

    expect(mocks.data.FabricItem.delete).toHaveBeenCalledWith({
      id: "remaining-item",
    });
    expect(mocks.data.Workspace.delete).toHaveBeenCalledWith({
      id: "workspace-partial",
    });
    warning.mockRestore();
  });

  it("prunes snapshots from an explicitly trusted previous writer", async () => {
    ATLAS_CONFIG.snapshotRetentionCount = 2;
    ATLAS_CONFIG.previousSyncWriters = ["former@example.com"];
    const retained = summaryMarker(
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
      "2026-08-29T20:00:00.000Z",
    );
    const previousWriter = summaryMarker(
      "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2",
      "2026-08-28T20:00:00.000Z",
      {
        id: "workspace-former",
        writerEmail: "former@example.com",
        itemCount: 1,
        healthyCount: 1,
      },
    );
    mocks.data.Workspace.findMany.mockImplementation(async (filter) => {
      const writer = (
        filter as { writerEmail?: { eq?: string } }
      ).writerEmail?.eq;
      if (writer === "former@example.com") return [previousWriter];
      const published = mocks.data.Workspace.create.mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;
      return [
        {
          ...published,
          id: "workspace-current",
          fabricId: workspaceId,
        },
        retained,
      ];
    });
    mocks.data.FabricItem.findMany.mockImplementation(async (filter) => {
      const snapshotId = (
        filter as { snapshotId?: { eq?: string } }
      ).snapshotId?.eq;
      return snapshotId === previousWriter.snapshotId
        ? [
            {
              id: "former-item",
              workspace_id: workspaceId,
              snapshotId,
              writerEmail: "former@example.com",
              fabricId: "former-item",
              displayName: "Former item",
              itemType: "Lakehouse",
              health: "healthy",
              endorsement: "none",
            },
          ]
        : [];
    });

    await expect(runFabricSync(false, identity)).resolves.toBeTruthy();

    expect(mocks.data.FabricItem.delete).toHaveBeenCalledWith({
      id: "former-item",
    });
    expect(mocks.data.Workspace.delete).toHaveBeenCalledWith({
      id: "workspace-former",
    });
  });

  it("parses valid manifest summaries and rejects inconsistent values", () => {
    const marker = {
      snapshotId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      syncedAt: "2026-08-30T10:00:00.000Z",
      summaryVersion: 1,
      itemCount: 2,
      healthyCount: 1,
      staleCount: 1,
      failingCount: 0,
      labelCount: 1,
      principalCount: 2,
      externalPrincipalCount: 1,
      grantCount: 3,
      jobCount: 2,
      failedJobCount: 1,
      edgeCount: 1,
      brokenEdgeCount: 0,
      tableCount: 4,
      columnCount: 8,
      measureCount: 2,
    };
    expect(snapshotSummaryFromManifest(marker)).toMatchObject({
      items: 2,
      healthy: 1,
      labels: 1,
      externalPrincipals: 1,
      failedJobs: 1,
      tables: 4,
    });
    expect(
      snapshotSummaryFromManifest({ ...marker, labelCount: 3 }),
    ).toBeUndefined();
  });

  it("never serializes business rows into schema snapshot chunks", async () => {
    const atlas = structuredClone(SAMPLE_DATA);
    const itemId = atlas.items[0].fabricId;
    atlas.schema = {
      [itemId]: [
        {
          name: "Unsafe",
          rows: [{ businessValue: "secret" }] as unknown as number,
          columns: [],
          measures: [],
        },
      ],
    };
    mocks.mapSyncToAtlas.mockReturnValue(atlas);

    await runFabricSync(false, identity);

    const schemaWrites = mocks.data.ConfigEntry.create.mock.calls
      .map(([row]) => row as Record<string, unknown>)
      .filter((row) => row.section === "__schema__");
    expect(schemaWrites).toHaveLength(1);
    expect(schemaWrites[0].value).not.toContain("businessValue");
    expect(schemaWrites[0].value).not.toContain("secret");
  });

  it("persists safe item metadata and verified object lineage as hidden chunks", async () => {
    const atlas = structuredClone(SAMPLE_DATA);
    const ontology = atlas.items.find(
      (item) => item.itemType === "SemanticModel",
    )!;
    const source = atlas.items.find((item) => item.itemType === "Lakehouse")!;
    ontology.itemType = "Ontology";
    const metadata = parseOntologyMetadata({
      entities: [
        {
          id: "customer",
          name: "Customer",
          properties: [
            { id: "customer-id", name: "Customer ID", valueType: "String" },
          ],
          entityIdParts: ["customer-id"],
        },
      ],
      relationships: [],
      bindings: [
        {
          id: "customer-binding",
          entityId: "customer",
          dataBindingConfiguration: {
            sourceTableProperties: {
              itemId: source.fabricId,
              sourceSchema: "dbo",
              sourceTableName: "Customers",
            },
            propertyBindings: [
              {
                sourceColumnName: "CustomerId",
                targetPropertyId: "customer-id",
              },
            ],
          },
        },
      ],
      contextualizations: [],
    })!;
    atlas.schema = {
      [ontology.fabricId]: projectItemMetadataToSchema(metadata),
    };
    atlas.itemMetadata = { [ontology.fabricId]: metadata };
    atlas.objectEdges = metadataObjectLineageEdges(
      ontology.fabricId,
      metadata,
    );
    mocks.mapSyncToAtlas.mockReturnValue(atlas);

    await runFabricSync(false, identity);

    const writes = mocks.data.ConfigEntry.create.mock.calls.map(
      ([row]) => row as Record<string, unknown>,
    );
    expect(
      writes.some((row) => row.section === "__object_edges__"),
    ).toBe(true);
    expect(
      writes
        .filter((row) => row.section === "__object_edges__")
        .map((row) => String(row.value))
        .join(""),
    ).toContain("binds property");
    expect(
      writes
        .filter((row) => row.section === "__schema__")
        .map((row) => String(row.value))
        .join(""),
    ).not.toMatch(/aiInstructions|fewShots|businessValue/);
  });

  it("falls back to the previous complete manifest during hydration", async () => {
    const oldSnapshot = "33333333-3333-4333-8333-333333333333";
    const incompleteSnapshot = "44444444-4444-4444-8444-444444444444";
    mocks.data.Workspace.findMany.mockResolvedValue([
      {
        snapshotId: incompleteSnapshot,
        writerEmail: identity.email,
        fabricId: workspaceId,
        displayName: "Incomplete",
        itemCount: 2,
        edgeCount: 0,
        principalCount: 0,
        grantCount: 0,
        jobCount: 0,
        configCount: 0,
        schemaEntryCount: 0,
        syncedAt: "2026-08-29T20:00:00.000Z",
      },
      {
        snapshotId: oldSnapshot,
        writerEmail: identity.email,
        fabricId: workspaceId,
        displayName: "Last known good",
        itemCount: 1,
        edgeCount: 0,
        principalCount: 0,
        grantCount: 0,
        jobCount: 0,
        configCount: 0,
        schemaEntryCount: 0,
        syncedAt: "2026-08-29T19:00:00.000Z",
      },
    ]);
    mocks.data.FabricItem.findMany.mockResolvedValue([
      {
        workspace_id: workspaceId,
        snapshotId: incompleteSnapshot,
        writerEmail: identity.email,
        fabricId: "new-item",
        displayName: "Partial",
        itemType: "Lakehouse",
        health: "unknown",
        endorsement: "none",
      },
      {
        workspace_id: workspaceId,
        snapshotId: oldSnapshot,
        writerEmail: identity.email,
        fabricId: "old-item",
        displayName: "Preserved",
        itemType: "Lakehouse",
        health: "healthy",
        endorsement: "none",
      },
    ]);

    await expect(loadFromDb(false)).resolves.toMatchObject({
      workspace: {
        displayName: "Last known good",
        snapshotId: oldSnapshot,
        syncedAt: "2026-08-29T19:00:00.000Z",
      },
      items: [{ fabricId: "old-item", displayName: "Preserved" }],
    });
    expect(mocks.data.FabricItem.select).toHaveBeenCalledWith(
      expect.arrayContaining(["workspace_id", "snapshotId", "displayName"]),
    );
  });

  it("sanitizes persisted placeholder display names", async () => {
    const snapshotId = "55555555-5555-4555-8555-555555555555";
    mocks.data.Workspace.findMany.mockResolvedValue([
      {
        snapshotId,
        writerEmail: identity.email,
        fabricId: workspaceId,
        displayName: "Workspace",
        itemCount: 1,
        edgeCount: 0,
        principalCount: 0,
        grantCount: 0,
        jobCount: 0,
        configCount: 0,
        schemaEntryCount: 0,
        syncedAt: "2026-08-29T20:00:00.000Z",
      },
    ]);
    mocks.data.FabricItem.findMany.mockResolvedValue([
      {
        workspace_id: workspaceId,
        snapshotId,
        writerEmail: identity.email,
        fabricId: "real-item-id",
        displayName: "null",
        itemType: "Lakehouse",
        health: "unknown",
        endorsement: "none",
        itemCreatedAt: "2026-08-20T08:00:00.000Z",
        itemUpdatedAt: "2026-08-29T08:00:00.000Z",
      },
    ]);

    await expect(loadFromDb(false)).resolves.toMatchObject({
      items: [
        {
          fabricId: "real-item-id",
          displayName: "real-item-id",
          itemType: "Lakehouse",
          createdAt: "2026-08-20T08:00:00.000Z",
          updatedAt: "2026-08-29T08:00:00.000Z",
        },
      ],
    });
  });

  it("hydrates a complete empty workspace snapshot", async () => {
    const snapshotId = "56565656-5656-4656-8656-565656565656";
    mocks.data.Workspace.findMany.mockResolvedValue([
      {
        snapshotId,
        writerEmail: identity.email,
        fabricId: workspaceId,
        displayName: "Empty workspace",
        itemCount: 0,
        edgeCount: 0,
        principalCount: 0,
        grantCount: 0,
        jobCount: 0,
        configCount: 0,
        schemaEntryCount: 0,
        syncedAt: "2026-08-30T08:00:00.000Z",
        syncSectionsJson: JSON.stringify({
          scanner: { status: "complete" },
        }),
      },
    ]);

    await expect(loadFromDb(false)).resolves.toMatchObject({
      workspace: {
        displayName: "Empty workspace",
        snapshotId,
        syncSections: {
          scanner: { status: "complete" },
        },
      },
      items: [],
      edges: [],
    });
  });

  it("does not hydrate a snapshot containing a generic ITEM row", async () => {
    const snapshotId = "66666666-6666-4666-8666-666666666666";
    mocks.data.Workspace.findMany.mockResolvedValue([
      {
        snapshotId,
        writerEmail: identity.email,
        fabricId: workspaceId,
        displayName: "Workspace",
        itemCount: 1,
        edgeCount: 0,
        principalCount: 0,
        grantCount: 0,
        jobCount: 0,
        configCount: 0,
        schemaEntryCount: 0,
        syncedAt: "2026-08-29T20:00:00.000Z",
      },
    ]);
    mocks.data.FabricItem.findMany.mockResolvedValue([
      {
        workspace_id: workspaceId,
        snapshotId,
        writerEmail: identity.email,
        fabricId: "real-item-id",
        displayName: "Malformed",
        itemType: "ITEM",
        health: "unknown",
        endorsement: "none",
      },
    ]);

    await expect(loadFromDb(false)).resolves.toBeNull();
  });

  it("ignores sync audit rows from untrusted writers", async () => {
    const snapshotId = "77777777-7777-4777-8777-777777777777";
    mocks.data.Workspace.findMany.mockResolvedValue([
      {
        snapshotId,
        writerEmail: identity.email,
        fabricId: workspaceId,
        displayName: "Workspace",
        itemCount: 1,
        edgeCount: 0,
        principalCount: 0,
        grantCount: 0,
        jobCount: 0,
        configCount: 0,
        schemaEntryCount: 0,
        syncedAt: "2026-08-29T20:00:00.000Z",
      },
    ]);
    mocks.data.FabricItem.findMany.mockResolvedValue([
      {
        workspace_id: workspaceId,
        snapshotId,
        writerEmail: identity.email,
        fabricId: "item-1",
        displayName: "Item",
        itemType: "Lakehouse",
        health: "healthy",
        endorsement: "none",
      },
    ]);
    mocks.data.SyncRun.findMany.mockResolvedValue([
      {
        id: "trusted",
        workspace_id: workspaceId,
        snapshotId,
        writerEmail: identity.email,
        startedAt: "2026-08-29T20:00:00.000Z",
        status: "completed",
        triggeredBy: identity.email,
      },
      {
        id: "forged",
        workspace_id: workspaceId,
        snapshotId,
        writerEmail: "viewer@example.com",
        startedAt: "2099-01-01T00:00:00.000Z",
        status: "completed",
        triggeredBy: "Administrator",
      },
    ]);

    await expect(loadFromDb(false)).resolves.toMatchObject({
      syncRuns: [{ id: "trusted", triggeredBy: identity.email }],
    });
  });

  it("loads valid older snapshots with snapshot-scoped filters and skips invalid candidates", async () => {
    const invalidSnapshot = "88888888-8888-4888-8888-888888888888";
    const validSnapshot = "99999999-9999-4999-8999-999999999999";
    mocks.data.Workspace.findMany.mockResolvedValue([
      {
        snapshotId: invalidSnapshot,
        writerEmail: identity.email,
        fabricId: workspaceId,
        displayName: "Invalid",
        itemCount: 2,
        edgeCount: 0,
        principalCount: 0,
        grantCount: 0,
        jobCount: 0,
        configCount: 0,
        schemaEntryCount: 0,
        syncedAt: "2026-08-29T19:00:00.000Z",
      },
      {
        snapshotId: validSnapshot,
        writerEmail: identity.email,
        fabricId: workspaceId,
        displayName: "Valid",
        itemCount: 1,
        edgeCount: 0,
        principalCount: 0,
        grantCount: 0,
        jobCount: 0,
        configCount: 0,
        schemaEntryCount: 0,
        syncedAt: "2026-08-29T18:00:00.000Z",
      },
    ]);
    mocks.data.FabricItem.findMany.mockResolvedValue([
      {
        workspace_id: workspaceId,
        snapshotId: invalidSnapshot,
        writerEmail: identity.email,
        fabricId: "partial",
        displayName: "Partial",
        itemType: "Lakehouse",
        health: "unknown",
        endorsement: "none",
      },
      {
        workspace_id: workspaceId,
        snapshotId: validSnapshot,
        writerEmail: identity.email,
        fabricId: "historical",
        displayName: "Historical",
        itemType: "Lakehouse",
        health: "healthy",
        endorsement: "none",
      },
    ]);
    const current = structuredClone(SAMPLE_DATA);
    current.workspace.snapshotId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    current.workspace.syncedAt = "2026-08-29T20:00:00.000Z";

    const history = await loadHistoryFromDb(false, current, 2);

    expect(history.snapshots.map((entry) => entry.snapshotId)).toEqual([
      current.workspace.snapshotId,
      validSnapshot,
    ]);
    expect(history.snapshots[1].catalog.items).toEqual([
      expect.objectContaining({ fabricId: "historical" }),
    ]);
    expect(history.snapshots[1].catalog).not.toHaveProperty("comments");
    expect(history.snapshots[1].catalog).not.toHaveProperty("syncRuns");
    expect(mocks.data.FabricItem.findMany).toHaveBeenCalledWith({
      workspace_id: { eq: workspaceId },
      snapshotId: { eq: invalidSnapshot },
      writerEmail: { eq: identity.email },
    });
    expect(mocks.data.FabricItem.findMany).toHaveBeenCalledWith({
      workspace_id: { eq: workspaceId },
      snapshotId: { eq: validSnapshot },
      writerEmail: { eq: identity.email },
    });
    expect(mocks.data.Workspace.findMany).toHaveBeenCalledWith({
      fabricId: { eq: workspaceId },
      writerEmail: { eq: identity.email },
    });
  });

  it("loads modern history summaries without reading every catalog", async () => {
    const snapshotIds = [
      "11111111-aaaa-4aaa-8aaa-111111111111",
      "22222222-bbbb-4bbb-8bbb-222222222222",
      "33333333-cccc-4ccc-8ccc-333333333333",
    ];
    const marker = (snapshotId: string, syncedAt: string, id: string) => ({
      id,
      snapshotId,
      writerEmail: identity.email,
      fabricId: workspaceId,
      displayName: "Historical",
      itemCount: 1,
      edgeCount: 0,
      principalCount: 0,
      grantCount: 0,
      jobCount: 0,
      configCount: 0,
      schemaEntryCount: 0,
      summaryVersion: 1,
      healthyCount: 1,
      staleCount: 0,
      failingCount: 0,
      labelCount: 0,
      externalPrincipalCount: 0,
      failedJobCount: 0,
      brokenEdgeCount: 0,
      tableCount: 0,
      columnCount: 0,
      measureCount: 0,
      syncedAt,
    });
    mocks.data.Workspace.findMany.mockResolvedValue([
      marker(snapshotIds[0], "2026-08-29T19:00:00.000Z", "marker-1"),
      marker(snapshotIds[1], "2026-08-29T18:00:00.000Z", "marker-2"),
      marker(snapshotIds[2], "2026-08-29T17:00:00.000Z", "marker-3"),
    ]);
    mocks.data.FabricItem.findMany.mockImplementation(async (filter) => {
      const snapshotId = (
        filter as { snapshotId?: { eq?: string } }
      ).snapshotId?.eq;
      return snapshotId === snapshotIds[0]
        ? [
            {
              workspace_id: workspaceId,
              snapshotId,
              writerEmail: identity.email,
              fabricId: "historical",
              displayName: "Historical",
              itemType: "Lakehouse",
              health: "healthy",
              endorsement: "none",
            },
          ]
        : [];
    });
    const current = structuredClone(SAMPLE_DATA);
    current.workspace.snapshotId =
      "44444444-dddd-4ddd-8ddd-444444444444";
    current.workspace.syncedAt = "2026-08-29T20:00:00.000Z";

    const history = await loadHistoryFromDb(false, current, 4);

    expect(history.summaries.map((entry) => entry.snapshotId)).toEqual([
      current.workspace.snapshotId,
      ...snapshotIds,
    ]);
    expect(history.snapshots.map((entry) => entry.snapshotId)).toEqual([
      current.workspace.snapshotId,
      snapshotIds[0],
    ]);
    expect(mocks.data.FabricItem.findMany).toHaveBeenCalledTimes(1);
  });

  it("returns one preview history point without querying Rayfin", async () => {
    const preview = await loadHistoryFromDb(true, structuredClone(SAMPLE_DATA));

    expect(preview.snapshots).toHaveLength(1);
    expect(preview.changes).toEqual([]);
    expect(mocks.data.Workspace.select).not.toHaveBeenCalled();
  });
});
