import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeExceptionForFinding,
  deleteGovernanceException,
  governanceExceptionStatus,
  loadGovernanceExceptions,
  saveGovernanceException,
} from "./governance-exceptions";

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
      GovernanceException: {
        select: mocks.select,
        create: mocks.create,
        update: mocks.update,
        delete: mocks.delete,
      },
    },
  }),
}));

const author = {
  id: "admin-1",
  name: "Workspace Admin",
  email: "ADMIN@example.com",
};

describe("governance exceptions", () => {
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
    mocks.create.mockImplementation(async (value) => value);
    mocks.update.mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue(undefined);
  });

  it("loads shared workspace exceptions", async () => {
    mocks.execute.mockResolvedValue([
      {
        id: "exception-1",
        workspace_id: "workspace-1",
        recordKey: "key",
        writerEmail: "admin@example.com",
        findingId: "finding-1",
        reason: "Accepted until migration completes.",
        expiresAt: "2026-09-10T12:00:00.000Z",
        authorId: "admin-1",
        authorName: "Workspace Admin",
        authorEmail: "admin@example.com",
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
      },
    ]);

    await expect(
      loadGovernanceExceptions(false, "workspace-1"),
    ).resolves.toEqual([
      expect.objectContaining({
        findingId: "finding-1",
        authorEmail: "admin@example.com",
      }),
    ]);
    expect(mocks.where).toHaveBeenCalledWith({
      workspace_id: { eq: "workspace-1" },
    });
  });

  it("distinguishes active, expired and invalid exceptions", () => {
    const base = {
      findingId: "finding-1",
      expiresAt: "2026-09-05T12:00:00.000Z",
    };
    expect(
      governanceExceptionStatus(base, Date.parse("2026-09-05T11:00:00.000Z")),
    ).toBe("active");
    expect(
      governanceExceptionStatus(base, Date.parse("2026-09-05T13:00:00.000Z")),
    ).toBe("expired");
    expect(
      governanceExceptionStatus({ ...base, expiresAt: "not-a-date" }),
    ).toBe("invalid");
    expect(
      activeExceptionForFinding(
        [
          {
            id: "exception-1",
            reason: "Temporary",
            authorId: "admin-1",
            authorName: "Admin",
            authorEmail: "admin@example.com",
            createdAt: "2026-09-01T12:00:00.000Z",
            updatedAt: "2026-09-01T12:00:00.000Z",
            ...base,
          },
        ],
        "finding-1",
        Date.parse("2026-09-05T13:00:00.000Z"),
      ),
    ).toBeUndefined();
  });

  it("requires a real subject, reason and future expiry", async () => {
    await expect(
      saveGovernanceException(true, "workspace-1", author, {
        findingId: " ",
        reason: "Temporary",
        expiresAt: "2099-09-05T12:00:00.000Z",
      }),
    ).rejects.toThrow(/finding identity/);
    await expect(
      saveGovernanceException(true, "workspace-1", author, {
        findingId: "finding-1",
        reason: " ",
        expiresAt: "2099-09-05T12:00:00.000Z",
      }),
    ).rejects.toThrow(/reason/);
    await expect(
      saveGovernanceException(true, "workspace-1", author, {
        findingId: "finding-1",
        reason: "Temporary",
        expiresAt: "not-a-date",
      }),
    ).rejects.toThrow(/expiry/);
  });

  it("creates, updates and deletes a stable finding exception", async () => {
    const created = await saveGovernanceException(
      false,
      "workspace-1",
      author,
      {
        findingId: "finding-1",
        reason: "Accepted until the source migration completes.",
        expiresAt: "2099-09-05T12:00:00.000Z",
      },
    );
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "workspace-1",
        findingId: "finding-1",
        authorEmail: "admin@example.com",
      }),
    );

    await saveGovernanceException(false, "workspace-1", author, {
      current: created,
      findingId: "finding-1",
      reason: "Extended for the final cutover.",
      expiresAt: "2099-09-12T12:00:00.000Z",
    });
    expect(mocks.update).toHaveBeenCalledWith(
      { id: created.id },
      expect.objectContaining({
        reason: "Extended for the final cutover.",
      }),
    );

    await deleteGovernanceException(false, created.id);
    expect(mocks.delete).toHaveBeenCalledWith({ id: created.id });
  });
});
