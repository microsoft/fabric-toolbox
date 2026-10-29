import { beforeEach, describe, expect, it, vi } from "vitest";
import { ATLAS_CONFIG } from "./config";
import type { AtlasData, Item, Job } from "./model";
import {
  MAX_INCIDENTS_PER_SNAPSHOT,
  OperationalIncidentsUnavailableError,
  operationalIncidentRows,
  persistOperationalIncidents,
  readOperationalIncidents,
  type OperationalIncidentApi,
} from "./operational-incident-store";

vi.mock("@/lib/rayfin-client", () => ({
  getRayfinClient: () => ({ data: {} }),
}));

const WORKSPACE = "6bf4c521-7412-4e6b-8867-68253bbfb18a";
const SNAPSHOT_1 = "10000000-0000-4000-8000-0000000000a1";
const SNAPSHOT_2 = "10000000-0000-4000-8000-0000000000a2";
const SNAPSHOT_3 = "10000000-0000-4000-8000-0000000000a3";
const NOTEBOOK = "20000000-0000-4000-8000-000000000002";
const MODEL = "20000000-0000-4000-8000-000000000003";
const RUN = "A0A0A0A0-0000-4000-8000-000000000001";
const WRITER = "admin@example.com";

const items: Item[] = [
  { fabricId: NOTEBOOK, displayName: "Load\u0007 sales\n nightly", itemType: "Notebook" },
  { fabricId: MODEL, displayName: "Sales model", itemType: "SemanticModel" },
] as Item[];

function failed(itemFabricId: string, startedAt: string, overrides: Partial<Job> = {}): Job {
  return {
    itemFabricId,
    itemName: "fallback",
    jobType: "RunNotebook",
    status: "failed",
    startedAt,
    durationSec: 61,
    ...overrides,
  };
}

function snapshot(jobs: Job[]): Pick<AtlasData, "workspace" | "items" | "jobs"> {
  return {
    workspace: { fabricId: WORKSPACE, displayName: "Sales", capacity: "", region: "" },
    items,
    jobs,
  };
}

function memoryApi(initial: Record<string, unknown>[] = []) {
  const rows = [...initial];
  const matches = (row: Record<string, unknown>, filter: Record<string, unknown>) =>
    Object.entries(filter).every(([field, condition]) => {
      const expected = (condition as { eq: unknown }).eq;
      return String(row[field] ?? "").toLowerCase() === String(expected).toLowerCase();
    });
  const api: OperationalIncidentApi & { rows: typeof rows } = {
    rows,
    select: () => {
      let filter: Record<string, unknown> = {};
      const query = {
        where(next: Record<string, unknown>) {
          filter = next;
          return query;
        },
        first: () => query,
        after: () => query,
        executePaginated: async () => ({
          items: rows.filter((row) => matches(row, filter)).map((row) => ({ ...row })),
          hasNextPage: false,
        }),
      };
      return query;
    },
    create: vi.fn(async (row: Record<string, unknown>) => {
      rows.push({ ...row });
      return row;
    }),
    delete: vi.fn(async ({ id }: Record<string, unknown>) => {
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) rows.splice(index, 1);
    }),
  };
  return api;
}

describe("operational incident rows", () => {
  beforeEach(() => {
    ATLAS_CONFIG.syncAdminEmail = WRITER;
    ATLAS_CONFIG.previousSyncWriters = [];
  });

  it("keeps only allowlisted identity and timing fields", async () => {
    const { rows, skipped, truncated } = await operationalIncidentRows({
      workspaceId: WORKSPACE,
      snapshotId: SNAPSHOT_1,
      writerEmail: "Admin@Example.com",
      observedAt: "2026-10-02T10:00:00.000Z",
      data: snapshot([
        failed(NOTEBOOK, "2026-10-02T06:00:00.000Z", {
          runId: RUN,
          message: "SELECT * FROM customers WHERE secret = 'x'",
        }),
        failed(MODEL, "2026-10-02T07:00:00.000Z", { jobType: "Refresh<script>" }),
        failed(MODEL, "2026-10-02T08:00:00.000Z", { jobType: "Refresh", startedAt: "garbage" }),
      ]),
    });

    expect(skipped).toBe(1);
    expect(truncated).toBe(false);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(Object.keys(row).sort()).toEqual(
      [
        "contractVersion",
        "durationSec",
        "firstObservedAt",
        "firstObservedSnapshotId",
        "id",
        "incidentKey",
        "itemFabricId",
        "itemName",
        "itemType",
        "jobType",
        "observedAt",
        "occurredAt",
        "runId",
        "snapshotId",
        "source",
        "workspace_id",
        "writerEmail",
      ].sort(),
    );
    expect(JSON.stringify(row)).not.toMatch(/customers|secret|SELECT/);
    expect(row).toMatchObject({
      workspace_id: WORKSPACE,
      snapshotId: SNAPSHOT_1,
      writerEmail: WRITER,
      incidentKey: `incident:v1:${WORKSPACE}:${NOTEBOOK}:runnotebook`,
      itemName: "Load sales nightly",
      runId: RUN.toLowerCase(),
      source: "fabric-job-history",
      contractVersion: 1,
      firstObservedSnapshotId: SNAPSHOT_1,
    });
    expect((row.firstObservedAt as Date).toISOString()).toBe("2026-10-02T10:00:00.000Z");
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const again = await operationalIncidentRows({
      workspaceId: WORKSPACE,
      snapshotId: SNAPSHOT_1,
      writerEmail: WRITER,
      observedAt: "2026-10-02T10:00:00.000Z",
      data: snapshot([failed(NOTEBOOK, "2026-10-02T06:00:00.000Z")]),
    });
    expect(again.rows[0].id).toBe(row.id);
  });

  it("bounds the rows written for one snapshot", async () => {
    const jobs = Array.from({ length: MAX_INCIDENTS_PER_SNAPSHOT + 3 }, (_, index) =>
      failed(
        `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
      ),
    );
    const result = await operationalIncidentRows({
      workspaceId: WORKSPACE,
      snapshotId: SNAPSHOT_1,
      writerEmail: WRITER,
      observedAt: "2026-10-02T10:00:00.000Z",
      data: snapshot(jobs),
    });

    expect(result.rows).toHaveLength(MAX_INCIDENTS_PER_SNAPSHOT);
    expect(result.truncated).toBe(true);
  });
});

describe("operational incident persistence", () => {
  beforeEach(() => {
    ATLAS_CONFIG.syncAdminEmail = WRITER;
    ATLAS_CONFIG.previousSyncWriters = [];
  });

  it("carries the first observation forward from the previous published snapshot", async () => {
    const api = memoryApi();
    await persistOperationalIncidents(
      {
        workspaceId: WORKSPACE,
        snapshotId: SNAPSHOT_1,
        writerEmail: WRITER,
        observedAt: "2026-10-01T10:00:00.000Z",
        data: snapshot([failed(NOTEBOOK, "2026-10-01T06:00:00.000Z")]),
      },
      api,
    );
    const result = await persistOperationalIncidents(
      {
        workspaceId: WORKSPACE,
        snapshotId: SNAPSHOT_2,
        writerEmail: WRITER,
        observedAt: "2026-10-02T10:00:00.000Z",
        data: snapshot([failed(NOTEBOOK, "2026-10-02T06:00:00.000Z")]),
        previousSnapshotId: SNAPSHOT_1,
      },
      api,
    );

    expect(result).toMatchObject({ status: "persisted", written: 1, pruned: 0 });
    const [record] = await readOperationalIncidents(WORKSPACE, SNAPSHOT_2, api);
    expect(record).toMatchObject({
      occurredAt: "2026-10-02T06:00:00.000Z",
      observedAt: "2026-10-02T10:00:00.000Z",
      firstObservedAt: "2026-10-01T10:00:00.000Z",
      firstObservedSnapshotId: SNAPSHOT_1,
    });
  });

  it("is idempotent for a retried snapshot and prunes the oldest snapshots", async () => {
    const api = memoryApi();
    const persist = (snapshotId: string, day: number) =>
      persistOperationalIncidents(
        {
          workspaceId: WORKSPACE,
          snapshotId,
          writerEmail: WRITER,
          observedAt: new Date(Date.UTC(2026, 9, day, 10)).toISOString(),
          data: snapshot([failed(NOTEBOOK, new Date(Date.UTC(2026, 9, day, 6)).toISOString())]),
          retainedSnapshots: 2,
        },
        api,
      );

    await persist(SNAPSHOT_1, 1);
    await persist(SNAPSHOT_2, 2);
    const retry = await persist(SNAPSHOT_2, 2);
    expect(retry.written).toBe(0);
    const third = await persist(SNAPSHOT_3, 3);

    expect(third.pruned).toBe(1);
    expect(api.rows.map((row) => row.snapshotId).sort()).toEqual([SNAPSHOT_2, SNAPSHOT_3]);
  });
});

describe("operational incident reads", () => {
  beforeEach(() => {
    ATLAS_CONFIG.syncAdminEmail = WRITER;
    ATLAS_CONFIG.previousSyncWriters = [];
  });

  it("ignores rows from untrusted writers or outside the contract", async () => {
    const { rows } = await operationalIncidentRows({
      workspaceId: WORKSPACE,
      snapshotId: SNAPSHOT_1,
      writerEmail: WRITER,
      observedAt: "2026-10-02T10:00:00.000Z",
      data: snapshot([failed(NOTEBOOK, "2026-10-02T06:00:00.000Z")]),
    });
    const api = memoryApi([
      rows[0],
      { ...rows[0], id: "40000000-0000-4000-8000-000000000001", writerEmail: "intruder@example.com" },
      { ...rows[0], id: "40000000-0000-4000-8000-000000000002", incidentKey: "incident:v1:forged" },
      { ...rows[0], id: "40000000-0000-4000-8000-000000000003", contractVersion: 2 },
    ]);

    const records = await readOperationalIncidents(WORKSPACE, SNAPSHOT_1, api);

    expect(records.map((record) => record.id)).toEqual([rows[0].id]);
  });

  it("reports an undeployed entity instead of an empty incident list", async () => {
    await expect(readOperationalIncidents(WORKSPACE, SNAPSHOT_1)).rejects.toBeInstanceOf(
      OperationalIncidentsUnavailableError,
    );
  });
});
