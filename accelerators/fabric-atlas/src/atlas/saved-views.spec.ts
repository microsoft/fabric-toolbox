import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSavedView,
  deleteSavedView,
  loadSavedViews,
  updateSavedView,
} from "./saved-views";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/rayfin-client", () => ({
  getRayfinClient: () => ({
    data: {
      SavedView: {
        select: mocks.select,
        create: mocks.create,
        update: mocks.update,
        delete: mocks.delete,
      },
    },
  }),
}));

describe("saved views", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    const query = {
      where: mocks.where,
      orderBy: mocks.orderBy,
      execute: mocks.execute,
    };
    mocks.select.mockReturnValue(query);
    mocks.where.mockReturnValue(query);
    mocks.orderBy.mockReturnValue(query);
    mocks.execute.mockResolvedValue([]);
  });

  it("loads only the current user and workspace views", async () => {
    mocks.execute.mockResolvedValue([
      {
        id: "view-1",
        workspace_id: "workspace-1",
        user_id: "user-1",
        name: "External access",
        section: "access",
        filtersJson: '{"risk":"external"}',
        createdAt: "2026-08-29T20:00:00.000Z",
        updatedAt: "2026-08-29T21:00:00.000Z",
      },
    ]);

    await expect(
      loadSavedViews(false, "workspace-1", "user-1"),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "view-1",
        name: "External access",
        filters: { risk: "external" },
      }),
    ]);
    expect(mocks.where).toHaveBeenCalledWith({
      workspace_id: { eq: "workspace-1" },
      user_id: { eq: "user-1" },
    });
  });

  it("supports preview creation without calling Rayfin", async () => {
    const view = await createSavedView(true, "workspace-1", "user-1", {
      name: "Failed jobs",
      section: "jobs",
      filters: { status: "failed" },
    });

    expect(view).toMatchObject({
      name: "Failed jobs",
      section: "jobs",
      filters: { status: "failed" },
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates, updates and deletes deployed views", async () => {
    mocks.create.mockImplementation(async (value) => ({
      id: "view-2",
      ...value,
    }));
    mocks.update.mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue(undefined);

    const created = await createSavedView(false, "workspace-1", "user-1", {
      name: "Unlabeled assets",
      section: "governance",
      filters: { section: "coverage", metric: "sensitivity" },
    });
    const updated = await updateSavedView(false, created, {
      name: "Sensitivity gaps",
    });
    await deleteSavedView(false, created.id);

    expect(created.id).toBe("view-2");
    expect(updated.name).toBe("Sensitivity gaps");
    expect(mocks.update).toHaveBeenCalledWith(
      { id: "view-2" },
      expect.objectContaining({ name: "Sensitivity gaps" }),
    );
    expect(mocks.delete).toHaveBeenCalledWith({ id: "view-2" });
  });

  it("rejects malformed persisted filters", async () => {
    mocks.execute.mockResolvedValue([
      {
        id: "view-bad",
        workspace_id: "workspace-1",
        user_id: "user-1",
        name: "Broken",
        section: "access",
        filtersJson: "{",
        createdAt: "2026-08-29T20:00:00.000Z",
        updatedAt: "2026-08-29T21:00:00.000Z",
      },
    ]);

    await expect(
      loadSavedViews(false, "workspace-1", "user-1"),
    ).rejects.toThrow("invalid filter data");
  });
});
