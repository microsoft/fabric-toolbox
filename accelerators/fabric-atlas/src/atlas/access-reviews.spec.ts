import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendAccessReviewEvent,
  buildAccessReviewHistories,
  clearAccessReview,
  loadAccessReviewHistories,
  saveAccessReview,
  type AccessReviewHistoryEntry,
} from "./access-reviews";

const mocks = vi.hoisted(() => ({
  legacyRows: [] as Array<Record<string, unknown>>,
  eventRows: [] as Array<Record<string, unknown>>,
  legacySelect: vi.fn(),
  eventSelect: vi.fn(),
  legacyWhere: vi.fn(),
  eventWhere: vi.fn(),
  legacyExecute: vi.fn(),
  eventExecute: vi.fn(),
  eventCreate: vi.fn(),
}));

vi.mock("@/lib/rayfin-client", () => ({
  getRayfinClient: () => ({
    data: {
      AccessReview: {
        select: mocks.legacySelect,
      },
      AccessReviewEvent: {
        select: mocks.eventSelect,
        create: mocks.eventCreate,
      },
    },
  }),
}));

function matchesScope(
  row: Record<string, unknown>,
  filter: Record<string, { eq?: unknown }>,
): boolean {
  return Object.entries(filter).every(
    ([field, condition]) => row[field] === condition.eq,
  );
}

function configureQuery(
  select: typeof mocks.legacySelect,
  where: typeof mocks.legacyWhere,
  execute: typeof mocks.legacyExecute,
  rows: Array<Record<string, unknown>>,
) {
  let filter: Record<string, { eq?: unknown }> = {};
  const query = {
    where: where.mockImplementation(
      (next: Record<string, { eq?: unknown }>) => {
        filter = next;
        return query;
      },
    ),
    orderBy: vi.fn(() => query),
    execute: execute.mockImplementation(async () =>
      rows.filter((row) => matchesScope(row, filter)),
    ),
  };
  select.mockReturnValue(query);
}

function event(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    workspace_id: "workspace-1",
    user_id: "user-1",
    rowKey: "row-1",
    itemFabricId: "item-1",
    principalRef: "Analyst",
    status: "accepted",
    evidenceKey: "evidence-1",
    eventOrder: "0000000000001:event",
    occurredAt: "2026-09-05T10:00:00.000Z",
    ...overrides,
  };
}

function legacy(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    workspace_id: "workspace-1",
    user_id: "user-1",
    recordKey: "legacy-key",
    rowKey: "row-1",
    itemFabricId: "item-1",
    principalRef: "Analyst",
    status: "reviewed",
    reviewedAt: "2026-09-04T10:00:00.000Z",
    updatedAt: "2026-09-04T10:00:00.000Z",
    ...overrides,
  };
}

describe("access review history", () => {
  beforeEach(() => {
    mocks.legacyRows.length = 0;
    mocks.eventRows.length = 0;
    [
      mocks.legacySelect,
      mocks.eventSelect,
      mocks.legacyWhere,
      mocks.eventWhere,
      mocks.legacyExecute,
      mocks.eventExecute,
      mocks.eventCreate,
    ].forEach((mock) => mock.mockReset());
    configureQuery(
      mocks.legacySelect,
      mocks.legacyWhere,
      mocks.legacyExecute,
      mocks.legacyRows,
    );
    configureQuery(
      mocks.eventSelect,
      mocks.eventWhere,
      mocks.eventExecute,
      mocks.eventRows,
    );
    mocks.eventCreate.mockImplementation(
      async (value: Record<string, unknown>) => {
        const row = { id: crypto.randomUUID(), ...value };
        mocks.eventRows.push(row);
        return row;
      },
    );
  });

  it("loads only the requested workspace and user scope", async () => {
    mocks.eventRows.push(
      event(),
      event({ id: "other-user", user_id: "user-2", rowKey: "row-2" }),
      event({
        id: "other-workspace",
        workspace_id: "workspace-2",
        rowKey: "row-3",
      }),
    );

    const reviews = await loadAccessReviewHistories(
      false,
      "workspace-1",
      "user-1",
      new Map([["row-1", "evidence-1"]]),
    );

    expect(reviews).toHaveLength(1);
    expect(reviews[0].rowKey).toBe("row-1");
    expect(mocks.eventWhere).toHaveBeenCalledWith({
      workspace_id: { eq: "workspace-1" },
      user_id: { eq: "user-1" },
    });
    expect(mocks.legacyWhere).toHaveBeenCalledWith({
      workspace_id: { eq: "workspace-1" },
      user_id: { eq: "user-1" },
    });
  });

  it("keeps legacy decisions as history and requires revalidation", async () => {
    mocks.legacyRows.push(
      legacy({ note: "Imported decision" }),
    );

    const [review] = await loadAccessReviewHistories(
      false,
      "workspace-1",
      "user-1",
      new Map([["row-1", "current-evidence"]]),
    );

    expect(review.decision).toMatchObject({
      status: "reviewed",
      note: "Imported decision",
      needsReview: true,
      source: "legacy",
    });
    expect(review.history).toEqual([
      expect.objectContaining({ source: "legacy" }),
    ]);
    expect(review.history[0].evidenceKey).toBeUndefined();
  });

  it("uses the latest event and distinguishes unchanged from changed evidence", () => {
    const entries: AccessReviewHistoryEntry[] = [
      {
        id: "legacy",
        rowKey: "row-1",
        itemFabricId: "item-1",
        principalRef: "Analyst",
        status: "reviewed",
        occurredAt: "2026-09-04T10:00:00.000Z",
        source: "legacy",
      },
      {
        id: "newer",
        rowKey: "row-1",
        itemFabricId: "item-1",
        principalRef: "Analyst",
        status: "accepted",
        evidenceKey: "evidence-2",
        eventOrder: "0000000000002:newer",
        occurredAt: "2026-09-05T11:00:00.000Z",
        source: "event",
      },
      {
        id: "older",
        rowKey: "row-1",
        itemFabricId: "item-1",
        principalRef: "Analyst",
        status: "needsAction",
        evidenceKey: "evidence-1",
        eventOrder: "0000000000001:older",
        occurredAt: "2026-09-05T10:00:00.000Z",
        source: "event",
      },
    ];

    expect(
      buildAccessReviewHistories(
        entries,
        new Map([["row-1", "evidence-2"]]),
      )[0].decision,
    ).toMatchObject({ status: "accepted", needsReview: false });
    expect(
      buildAccessReviewHistories(
        entries,
        new Map([["row-1", "changed-evidence"]]),
      )[0].decision,
    ).toMatchObject({ status: "accepted", needsReview: true });
  });

  it("appends decisions and clears without deleting personal history", async () => {
    const accepted = await saveAccessReview(
      false,
      "workspace-1",
      "user-1",
      {
        rowKey: "row-1",
        itemFabricId: "item-1",
        principalRef: "Analyst",
        status: "accepted",
        evidenceKey: "evidence-1",
        note: "Validated",
      },
    );
    const cleared = await clearAccessReview(
      false,
      "workspace-1",
      "user-1",
      {
        rowKey: "row-1",
        itemFabricId: "item-1",
        principalRef: "Analyst",
        evidenceKey: "evidence-1",
      },
    );
    const reviews = appendAccessReviewEvent(
      appendAccessReviewEvent(
        [],
        accepted,
        new Map([["row-1", "evidence-1"]]),
      ),
      cleared,
      new Map([["row-1", "evidence-1"]]),
    );

    expect(mocks.eventCreate).toHaveBeenCalledTimes(2);
    expect(mocks.eventCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspace_id: "workspace-1",
        user_id: "user-1",
        status: "accepted",
      }),
    );
    expect(mocks.eventCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        workspace_id: "workspace-1",
        user_id: "user-1",
        status: "cleared",
      }),
    );
    expect(reviews[0].decision).toBeUndefined();
    expect(reviews[0].history.map((entry) => entry.status)).toEqual([
      "cleared",
      "accepted",
    ]);
  });

  it("surfaces load and save failures", async () => {
    mocks.eventExecute.mockRejectedValueOnce(new Error("load failed"));
    await expect(
      loadAccessReviewHistories(false, "workspace-1", "user-1"),
    ).rejects.toThrow("load failed");

    mocks.eventCreate.mockRejectedValueOnce(new Error("save failed"));
    await expect(
      saveAccessReview(false, "workspace-1", "user-1", {
        rowKey: "row-1",
        itemFabricId: "item-1",
        principalRef: "Analyst",
        status: "accepted",
        evidenceKey: "evidence-1",
      }),
    ).rejects.toThrow("save failed");
  });
});
