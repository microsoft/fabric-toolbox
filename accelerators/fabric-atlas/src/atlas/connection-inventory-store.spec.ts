import { beforeEach, describe, expect, it } from "vitest";
import { ATLAS_CONFIG } from "./config";
import {
  persistConnectionInventory,
  readLatestConnectionInventory,
  recordConnectionAttempt,
  type ConnectionEntityApi,
  type ConnectionStoreApi,
} from "./connection-inventory-store";
import type { ConnectionInventoryView } from "./connections";

type Row = Record<string, unknown>;

const WRITER = "sync@contoso.com";
const SHARED = "11111111-1111-4111-8111-111111111111";
const PERSONAL = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";

function table(): ConnectionEntityApi & { rows: Row[] } {
  const rows: Row[] = [];
  const matches = (row: Row, filter: Row) =>
    Object.entries(filter).every(([key, condition]) => row[key] === (condition as { eq: unknown }).eq);
  const query = (filter: Row = {}, size = 200, offset = 0) => ({
    where: (next: Row) => query({ ...filter, ...next }, size, offset),
    first: (count: number) => query(filter, count, offset),
    after: (cursor: string) => query(filter, size, Number(cursor)),
    executePaginated: async () => {
      const found = rows.filter((row) => matches(row, filter));
      const items = found.slice(offset, offset + size).map((row) => ({ ...row }));
      const end = offset + items.length;
      return { items, endCursor: String(end), hasNextPage: end < found.length };
    },
  });
  return {
    rows,
    select: () => query(),
    create: async (row: Row) => {
      rows.push({ ...row });
    },
    delete: async (filter: Row) => {
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index].id === filter.id) rows.splice(index, 1);
      }
    },
  };
}

function store() {
  const api = { inventory: table(), connections: table(), roles: table() };
  return api satisfies ConnectionStoreApi;
}

function inventory(collectedAt: string, ownerType = "User"): ConnectionInventoryView {
  return {
    collectedAt,
    status: "complete",
    truncated: false,
    roleLookups: { done: 1, skipped: 0, failed: 0 },
    connections: [
      {
        id: SHARED,
        displayName: "adls-landing",
        connectivityType: "ShareableCloud",
        connectorType: "AzureDataLakeStorage",
        path: "https://lake.dfs.core.windows.net/landing",
        credentialType: "Key",
        lastCredentialUsedAt: "2026-11-08T10:00:00.000Z",
        rolesStatus: "complete",
        roles: [{ principalId: OWNER, principalType: ownerType, role: "Owner", displayName: "owner@contoso.com" }],
      },
      { id: PERSONAL, displayName: "Unnamed connection (AdminInsights)", connectivityType: "PersonalCloud", rolesStatus: "personal", roles: [] },
    ],
  };
}

describe("connection inventory store", () => {
  beforeEach(() => {
    ATLAS_CONFIG.syncAdminEmail = WRITER;
    ATLAS_CONFIG.breakGlassSyncAdminEmail = "";
    ATLAS_CONFIG.previousSyncWriters = [];
  });

  it("writes rows before the manifest and reads the same inventory back", async () => {
    const api = store();
    const stored = await persistConnectionInventory(api, inventory("2026-11-09T08:00:00.000Z"), "Sync@Contoso.com");

    expect(api.connections.rows).toHaveLength(2);
    expect(api.roles.rows).toEqual([expect.objectContaining({ connectionId: SHARED, principalId: OWNER, writerEmail: WRITER })]);
    expect(api.inventory.rows).toEqual([expect.objectContaining({ id: stored.inventory.id, connectionCount: 2, writerEmail: WRITER })]);

    const { latest, previous } = await readLatestConnectionInventory(api);
    expect(previous).toBeUndefined();
    expect(latest).toMatchObject({ id: stored.inventory.id, collectedAt: "2026-11-09T08:00:00.000Z", status: "complete" });
    expect(latest?.connections.find((connection) => connection.id === SHARED)).toMatchObject({
      displayName: "adls-landing",
      credentialType: "Key",
      lastCredentialUsedAt: "2026-11-08T10:00:00.000Z",
      roles: [{ principalId: OWNER, principalType: "User", role: "Owner", displayName: "owner@contoso.com" }],
    });
  });

  it("keeps the previous inventory for comparison and prunes beyond retention", async () => {
    const api = store();
    const first = await persistConnectionInventory(api, inventory("2026-11-01T08:00:00.000Z"), WRITER, { retained: 2 });
    const second = await persistConnectionInventory(api, inventory("2026-11-08T08:00:00.000Z", "Group"), WRITER, { retained: 2 });

    const read = await readLatestConnectionInventory(api);
    expect(read.latest?.id).toBe(second.inventory.id);
    expect(read.previous?.id).toBe(first.inventory.id);

    const third = await persistConnectionInventory(api, inventory("2026-11-09T08:00:00.000Z"), WRITER, { retained: 2 });
    expect(third.pruned).toBe(4);
    expect(api.inventory.rows.map((row) => row.id).sort()).toEqual([second.inventory.id, third.inventory.id].sort());
    expect(api.connections.rows.some((row) => row.inventoryId === first.inventory.id)).toBe(false);
    expect(api.roles.rows.some((row) => row.inventoryId === first.inventory.id)).toBe(false);
  });

  it("ignores untrusted writers and skips an incomplete newest inventory", async () => {
    const api = store();
    const older = await persistConnectionInventory(api, inventory("2026-11-01T08:00:00.000Z"), WRITER);
    const newer = await persistConnectionInventory(api, inventory("2026-11-08T08:00:00.000Z"), WRITER);
    api.connections.rows.splice(api.connections.rows.findIndex((row) => row.inventoryId === newer.inventory.id), 1);
    await api.inventory.create({ ...api.inventory.rows[0], id: "44444444-4444-4444-8444-444444444444", writerEmail: "intruder@contoso.com", collectedAt: new Date("2026-11-09T00:00:00Z") });

    const { latest } = await readLatestConnectionInventory(api);
    expect(latest?.id).toBe(older.inventory.id);
  });

  it("records a collection that stored nothing without hiding the last inventory", async () => {
    const api = store();
    await recordConnectionAttempt(api, { collectedAt: "2026-11-07T08:00:00.000Z", status: "unsupported", code: "authorization-failed" }, WRITER);
    expect(await readLatestConnectionInventory(api)).toEqual({
      lastAttempt: expect.objectContaining({ status: "unsupported", code: "authorization-failed", connectionCount: 0 }),
    });

    const stored = await persistConnectionInventory(api, inventory("2026-11-08T08:00:00.000Z"), WRITER);
    expect(api.inventory.rows.map((row) => row.status)).toEqual(["complete"]);

    await recordConnectionAttempt(api, { collectedAt: "2026-11-09T08:00:00.000Z", status: "unsupported", code: "authorization-failed" }, WRITER);
    await recordConnectionAttempt(api, { collectedAt: "2026-11-09T09:00:00.000Z", status: "failed", code: "invoke-failed" }, WRITER);
    expect(api.inventory.rows).toHaveLength(2);
    const read = await readLatestConnectionInventory(api);
    expect(read.latest?.id).toBe(stored.inventory.id);
    expect(read.previous).toBeUndefined();
    expect(read.lastAttempt).toMatchObject({ status: "failed", code: "invoke-failed", collectedAt: "2026-11-09T09:00:00.000Z" });

    const next = await persistConnectionInventory(api, inventory("2026-11-10T08:00:00.000Z"), WRITER);
    const after = await readLatestConnectionInventory(api);
    expect(after.latest?.id).toBe(next.inventory.id);
    expect(after.previous?.id).toBe(stored.inventory.id);
    expect(after.lastAttempt).toBeUndefined();
    expect(api.inventory.rows.every((row) => row.status === "complete")).toBe(true);
  });
});
