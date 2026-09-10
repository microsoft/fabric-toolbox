import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteFindingAck,
  loadFindingAcks,
  saveFindingAck,
} from "./finding-acks";

const mocks = vi.hoisted(() => {
  const rows: Array<Record<string, unknown>> = [];
  const api = {
    select: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { rows, api };
});

vi.mock("@/lib/rayfin-client", () => ({
  getRayfinClient: () => ({
    data: { FindingAck: mocks.api },
  }),
}));

describe("finding acknowledgements", () => {
  beforeEach(() => {
    mocks.rows.length = 0;
    mocks.api.create.mockReset().mockImplementation(async (value) => {
      const row = { id: crypto.randomUUID(), ...value };
      mocks.rows.push(row);
      return row;
    });
    mocks.api.update.mockReset().mockResolvedValue(undefined);
    mocks.api.delete.mockReset().mockResolvedValue(undefined);
    mocks.api.select.mockReset().mockImplementation(() => {
      let filter: Record<string, { eq?: unknown }> = {};
      const query = {
        where(next: Record<string, { eq?: unknown }>) {
          filter = next;
          return query;
        },
        orderBy() {
          return query;
        },
        async execute() {
          return mocks.rows.filter((row) =>
            Object.entries(filter).every(
              ([key, condition]) => row[key] === condition.eq,
            ),
          );
        },
      };
      return query;
    });
  });

  it("keeps acknowledgements scoped to workspace and user", async () => {
    mocks.rows.push(
      {
        id: "ack-1",
        workspace_id: "workspace",
        user_id: "user",
        recordKey: "key",
        findingId: "finding",
        status: "acked",
        updatedAt: new Date("2026-08-30T12:00:00.000Z"),
      },
      {
        id: "ack-2",
        workspace_id: "workspace",
        user_id: "other",
        recordKey: "key-2",
        findingId: "other",
        status: "muted",
        updatedAt: new Date("2026-08-30T12:00:00.000Z"),
      },
    );

    expect(await loadFindingAcks(false, "workspace", "user")).toEqual([
      expect.objectContaining({ id: "ack-1", findingId: "finding" }),
    ]);
  });

  it("creates, updates and deletes one stable finding record", async () => {
    const created = await saveFindingAck(
      false,
      "workspace",
      "user",
      {
        findingId: "finding",
        occurrenceSnapshotId: "11111111-1111-4111-8111-111111111111",
        status: "acked",
      },
    );
    expect(mocks.api.create).toHaveBeenCalledTimes(1);

    await saveFindingAck(false, "workspace", "user", {
      current: created,
      findingId: "finding",
      occurrenceSnapshotId: "11111111-1111-4111-8111-111111111111",
      status: "muted",
      note: "Reviewed",
    });
    expect(mocks.api.update).toHaveBeenCalledWith(
      { id: created.id },
      expect.objectContaining({ status: "muted", note: "Reviewed" }),
    );

    await deleteFindingAck(false, created.id);
    expect(mocks.api.delete).toHaveBeenCalledWith({ id: created.id });
  });
});
