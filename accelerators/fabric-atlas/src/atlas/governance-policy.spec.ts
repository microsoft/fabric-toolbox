import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteGovernancePolicy,
  loadGovernancePolicy,
  saveGovernancePolicy,
  validateGovernanceTargets,
} from "./governance-policy";
import { POSTURE_TARGETS } from "./posture";

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
      GovernancePolicy: {
        select: mocks.select,
        create: mocks.create,
        update: mocks.update,
        delete: mocks.delete,
      },
    },
  }),
}));

describe("governance policy persistence", () => {
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
    mocks.update.mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue(undefined);
  });

  it("uses 70 percent defaults only when no workspace row exists", async () => {
    await expect(
      loadGovernancePolicy(false, "workspace-1"),
    ).resolves.toEqual({
      targets: POSTURE_TARGETS,
      source: "default",
    });
    expect(mocks.where).toHaveBeenCalledWith({
      workspace_id: { eq: "workspace-1" },
    });
  });

  it("rejects out-of-range and fractional targets", () => {
    expect(() =>
      validateGovernanceTargets({ ...POSTURE_TARGETS, access: 101 }),
    ).toThrow(/0 to 100/);
    expect(() =>
      validateGovernanceTargets({ ...POSTURE_TARGETS, access: 70.5 }),
    ).toThrow(/whole number/);
  });

  it("creates and updates the single workspace policy", async () => {
    mocks.create.mockImplementation(async (value) => value);
    const created = await saveGovernancePolicy(
      false,
      "workspace-1",
      { id: "admin-1", name: "Admin", email: "ADMIN@example.com" },
      { ...POSTURE_TARGETS, lineage: 85 },
    );

    expect(created).toMatchObject({
      source: "persisted",
      targets: { ...POSTURE_TARGETS, lineage: 85 },
      updatedByEmail: "admin@example.com",
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "workspace-1",
        writerEmail: "admin@example.com",
        lineageTarget: 85,
      }),
    );

    await saveGovernancePolicy(
      false,
      "workspace-1",
      { id: "admin-1", name: "Admin", email: "admin@example.com" },
      { ...POSTURE_TARGETS, access: 80 },
      created,
    );
    expect(mocks.update).toHaveBeenCalledWith(
      { id: created.id },
      expect.objectContaining({ accessTarget: 80 }),
    );

    await deleteGovernancePolicy(false, created.id);
    expect(mocks.delete).toHaveBeenCalledWith({ id: created.id });
  });

  it("surfaces malformed persisted targets instead of masking them as defaults", async () => {
    mocks.execute.mockResolvedValue([
      {
        id: "policy-1",
        workspace_id: "workspace-1",
        recordKey: "workspace-1",
        writerEmail: "admin@example.com",
        documentationTarget: 70,
        ownershipTarget: 70,
        sensitivityTarget: 70,
        accessTarget: -1,
        lineageTarget: 70,
        operationsTarget: 70,
        updatedById: "admin-1",
        updatedByName: "Admin",
        updatedByEmail: "admin@example.com",
        updatedAt: "2026-09-05T10:00:00.000Z",
      },
    ]);

    await expect(
      loadGovernancePolicy(false, "workspace-1"),
    ).rejects.toThrow(/0 to 100/);
  });
});
