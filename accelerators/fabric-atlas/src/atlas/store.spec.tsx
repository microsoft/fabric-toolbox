import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ATLAS_CONFIG } from "./config";
import { buildAtlasHistory, snapshotFromData } from "./history";
import { SAMPLE_DATA } from "./model";
import { AtlasProvider, useAtlas } from "./store";

const backend = vi.hoisted(() => ({
  loadCommentsFromDb: vi.fn(),
  loadFromDb: vi.fn(),
  loadHistoryFromDb: vi.fn(),
  loadHistoricalSnapshotFromDb: vi.fn(),
  persistComment: vi.fn(),
  runFabricSync: vi.fn(),
}));
const savedViewBackend = vi.hoisted(() => ({
  loadSavedViews: vi.fn(),
  createSavedView: vi.fn(),
  deleteSavedView: vi.fn(),
}));
const findingAckBackend = vi.hoisted(() => ({
  loadFindingAcks: vi.fn(),
  saveFindingAck: vi.fn(),
  deleteFindingAck: vi.fn(),
}));
const governancePolicyBackend = vi.hoisted(() => ({
  loadGovernancePolicy: vi.fn(),
  saveGovernancePolicy: vi.fn(),
  deleteGovernancePolicy: vi.fn(),
}));
const governanceExceptionBackend = vi.hoisted(() => ({
  loadGovernanceExceptions: vi.fn(),
  saveGovernanceException: vi.fn(),
  deleteGovernanceException: vi.fn(),
}));
const currentUser = {
  id: "user-1",
  name: "admin@example.com",
  email: "admin@example.com",
};

vi.mock("./backend", () => backend);
vi.mock("./saved-views", () => savedViewBackend);
vi.mock("./finding-acks", () => findingAckBackend);
vi.mock("./governance-policy", () => governancePolicyBackend);
vi.mock("./governance-exceptions", () => governanceExceptionBackend);

function Harness() {
  const atlas = useAtlas();
  return (
    <div>
      <button type="button" onClick={() => void atlas.sync()}>
        Sync
      </button>
      <button type="button" onClick={atlas.cancelSync}>
        Cancel sync
      </button>
      <button type="button" onClick={() => void atlas.addComment("New note")}>
        Add comment
      </button>
      <button
        type="button"
        onClick={() => void atlas.loadHistorySnapshot("older-snapshot")}
      >
        Load older snapshot
      </button>
      <button
        type="button"
        onClick={() =>
          void atlas.saveFindingAcknowledgement({
            findingId: "finding-queue",
            occurrenceSnapshotId:
              "11111111-1111-4111-8111-111111111111",
            status: "acked",
          }).catch(() => undefined)
        }
      >
        Acknowledge finding
      </button>
      <button
        type="button"
        onClick={() =>
          void atlas.saveFindingAcknowledgement({
            findingId: "finding-queue",
            occurrenceSnapshotId:
              "11111111-1111-4111-8111-111111111111",
            status: "muted",
          }).catch(() => undefined)
        }
      >
        Mute finding
      </button>
      <button
        type="button"
        onClick={() =>
          void atlas.saveGovernanceTargets({
            ...atlas.governanceTargets,
            access: 85,
          }).catch(() => undefined)
        }
      >
        Save governance targets
      </button>
      <button
        type="button"
        onClick={() =>
          void atlas.saveGovernanceException({
            findingId: "finding-shared",
            reason: "Accepted until the migration completes.",
            expiresAt: "2099-09-05T12:00:00.000Z",
          }).catch(() => undefined)
        }
      >
        Save governance exception
      </button>
      <span data-testid="hydrating">{String(atlas.hydrating)}</span>
      <span data-testid="history-loading">{String(atlas.historyLoading)}</span>
      <span data-testid="history-count">{atlas.history.snapshots.length}</span>
      <span data-testid="history-current">
        {atlas.history.current?.snapshotId ?? ""}
      </span>
      <span data-testid="history-error">{atlas.historyError ?? ""}</span>
      <span data-testid="history-failed">
        {String(atlas.historyFailedSnapshotIds.has("older-snapshot"))}
      </span>
      <span data-testid="finding-ack-count">{atlas.findingAcks.length}</span>
      <span data-testid="finding-ack-loading">
        {String(atlas.findingAcksLoading)}
      </span>
      <span data-testid="finding-ack-status">
        {atlas.findingAcks[0]?.status ?? ""}
      </span>
      <span data-testid="finding-ack-pending">
        {String(atlas.findingAckPendingIds.has("finding-queue"))}
      </span>
      <span data-testid="governance-target-access">
        {atlas.governanceTargets.access}
      </span>
      <span data-testid="governance-policy-loading">
        {String(atlas.governancePolicyLoading)}
      </span>
      <span data-testid="governance-policy-error">
        {atlas.governancePolicyError ?? ""}
      </span>
      <span data-testid="governance-exception-count">
        {atlas.governanceExceptions.length}
      </span>
      <span data-testid="governance-exception-error">
        {atlas.governanceExceptionsError ?? ""}
      </span>
      <span data-testid="has-data">{String(atlas.hasData)}</span>
      <span data-testid="syncing">{String(atlas.syncing)}</span>
      <span data-testid="item-count">{atlas.data.items.length}</span>
      <span data-testid="comment-author">
        {atlas.data.comments.at(-1)?.authorName ?? ""}
      </span>
      <span data-testid="workspace-name">{atlas.data.workspace.displayName}</span>
      <span data-testid="requires-sync">
        {String(atlas.requiresDeploymentSync)}
      </span>
      <span data-testid="progress">{atlas.syncProgress}</span>
      <span data-testid="stage">{atlas.syncStage}</span>
      <span data-testid="comments-error">{atlas.commentsError ?? ""}</span>
    </div>
  );
}

describe("AtlasProvider synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    ATLAS_CONFIG.syncAdminEmail = currentUser.email;
    ATLAS_CONFIG.syncAdminSubject = currentUser.id;
    ATLAS_CONFIG.previousSyncWriters = [];
    backend.loadFromDb.mockReset();
    backend.loadCommentsFromDb.mockReset().mockResolvedValue([]);
    backend.loadHistoryFromDb.mockReset();
    backend.loadHistoricalSnapshotFromDb.mockReset();
    backend.persistComment.mockReset();
    backend.runFabricSync.mockReset();
    backend.loadFromDb.mockResolvedValue(null);
    savedViewBackend.loadSavedViews.mockReset().mockResolvedValue([]);
    savedViewBackend.createSavedView.mockReset();
    savedViewBackend.deleteSavedView.mockReset();
    findingAckBackend.loadFindingAcks.mockReset().mockResolvedValue([]);
    findingAckBackend.saveFindingAck.mockReset().mockImplementation(
      async (
        _preview: boolean,
        _workspaceId: string,
        _userId: string,
        input: { findingId: string; status: "acked" | "muted" },
      ) => ({
        id: "ack-created",
        findingId: input.findingId,
        status: input.status,
        updatedAt: "2026-08-30T12:00:00.000Z",
      }),
    );
    findingAckBackend.deleteFindingAck.mockReset();
    governancePolicyBackend.loadGovernancePolicy.mockReset().mockResolvedValue({
      targets: {
        documentation: 70,
        ownership: 70,
        sensitivity: 70,
        access: 70,
        lineage: 70,
        operations: 70,
      },
      source: "default",
    });
    governancePolicyBackend.saveGovernancePolicy.mockReset().mockImplementation(
      async (
        _preview: boolean,
        _workspaceId: string,
        _user: unknown,
        targets: Record<string, number>,
      ) => ({
        id: "policy-1",
        targets,
        source: "persisted",
      }),
    );
    governancePolicyBackend.deleteGovernancePolicy
      .mockReset()
      .mockResolvedValue(undefined);
    governanceExceptionBackend.loadGovernanceExceptions
      .mockReset()
      .mockResolvedValue([]);
    governanceExceptionBackend.saveGovernanceException
      .mockReset()
      .mockImplementation(
        async (
          _preview: boolean,
          _workspaceId: string,
          _user: unknown,
          input: {
            findingId: string;
            reason: string;
            expiresAt: string;
          },
        ) => ({
          id: "exception-1",
          ...input,
          authorId: "user-1",
          authorName: "Admin",
          authorEmail: "admin@example.com",
          createdAt: "2026-09-05T12:00:00.000Z",
          updatedAt: "2026-09-05T12:00:00.000Z",
        }),
      );
    governanceExceptionBackend.deleteGovernanceException
      .mockReset()
      .mockResolvedValue(undefined);
    backend.loadHistoryFromDb.mockImplementation(
      async (_isPreview: boolean, current: typeof SAMPLE_DATA) =>
        buildAtlasHistory([
          snapshotFromData(
            current,
            current.workspace.snapshotId ?? "preview-current",
          ),
        ]),
    );
  });

  it("reports staged progress and exposes data after the first sync", async () => {
    backend.runFabricSync.mockImplementation(
      async (
        _isPreview: boolean,
        _user: unknown,
        report: (progress: number, stage: string) => void,
      ) => {
        report(48, "Workspace metadata received");
        report(94, "Writing object metadata");
        return structuredClone(SAMPLE_DATA);
      },
    );

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("hydrating")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("has-data")).toHaveTextContent("false");
    expect(screen.getByTestId("requires-sync")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    await waitFor(() =>
      expect(screen.getByTestId("has-data")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("syncing")).toHaveTextContent("false");
    expect(screen.getByTestId("requires-sync")).toHaveTextContent("false");
    expect(screen.getByTestId("progress")).toHaveTextContent("100");
    expect(screen.getByTestId("stage")).toHaveTextContent("Workspace is ready");
  });

  it("warns before a refresh while resumable synchronization is active", async () => {
    let finishSync: ((value: typeof SAMPLE_DATA) => void) | undefined;
    backend.runFabricSync.mockImplementation(
      async (
        _isPreview: boolean,
        _user: unknown,
        report: (progress: number, stage: string) => void,
      ) => {
        report(20, "Workspace topology received");
        return new Promise<typeof SAMPLE_DATA>((resolve) => {
          finishSync = resolve;
        });
      },
    );

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("hydrating")).toHaveTextContent("false"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() =>
      expect(screen.getByTestId("syncing")).toHaveTextContent("true"),
    );

    const duringSync = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(duringSync);
    expect(duringSync.defaultPrevented).toBe(true);

    await act(async () => {
      finishSync?.(structuredClone(SAMPLE_DATA));
    });
    await waitFor(() =>
      expect(screen.getByTestId("syncing")).toHaveTextContent("false"),
    );

    const afterSync = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterSync);
    expect(afterSync.defaultPrevented).toBe(false);
  });

  it("cancels an active synchronization through its abort signal", async () => {
    let aborted = false;
    backend.runFabricSync.mockImplementation(
      async (
        _isPreview: boolean,
        _user: unknown,
        _report: unknown,
        signal: AbortSignal,
      ) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("Synchronization cancelled."));
            },
            { once: true },
          );
        }),
    );

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("hydrating")).toHaveTextContent("false"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() =>
      expect(screen.getByTestId("syncing")).toHaveTextContent("true"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel sync" }));

    await waitFor(() =>
      expect(screen.getByTestId("syncing")).toHaveTextContent("false"),
    );
    expect(aborted).toBe(true);
    expect(screen.getByTestId("stage")).toHaveTextContent("Sync failed");
  });

  it("uses the authenticated email as the persisted comment identity", async () => {
    const principal = SAMPLE_DATA.principals.find(
      (candidate) => candidate.kind === "user" && candidate.email,
    )!;
    render(
      <AtlasProvider
        isPreview
        currentUser={{
          id: principal.principalId,
          name: principal.email!,
          email: principal.email,
        }}
      >
        <Harness />
      </AtlasProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    await waitFor(() =>
      expect(screen.getByTestId("comment-author")).toHaveTextContent(
        principal.displayName,
      ),
    );
    expect(backend.persistComment).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        authorId: principal.principalId,
        authorName: principal.email,
        authorEmail: principal.email,
      }),
    );
  });

  it("keeps a valid catalog visible when team notes fail to load", async () => {
    backend.loadFromDb.mockResolvedValue(structuredClone(SAMPLE_DATA));
    backend.loadCommentsFromDb.mockRejectedValue(
      new Error("notes unavailable"),
    );

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("has-data")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("item-count")).toHaveTextContent(
      String(SAMPLE_DATA.items.length),
    );
    await waitFor(() =>
      expect(screen.getByTestId("comments-error")).toHaveTextContent(
        "notes unavailable",
      ),
    );
  });

  it("refreshes current data and history before background reconciliation", async () => {
    const first = structuredClone(SAMPLE_DATA);
    first.workspace.snapshotId = "first-snapshot";
    first.workspace.syncedAt = "2026-08-30T12:00:00.000Z";
    first.workspace.deploymentId = "1.9.1:test";
    const second = structuredClone(first);
    second.workspace.snapshotId = "second-snapshot";
    second.workspace.syncedAt = "2026-08-30T13:00:00.000Z";
    second.items.push({
      ...second.items[0],
      fabricId: "new-warehouse",
      displayName: "New warehouse",
      itemType: "Warehouse",
    });
    let resolveReconciliation: (
      value: ReturnType<typeof buildAtlasHistory>,
    ) => void = () => undefined;
    backend.loadFromDb.mockResolvedValue(first);
    backend.loadHistoryFromDb
      .mockResolvedValueOnce(
        buildAtlasHistory([snapshotFromData(first)]),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveReconciliation = resolve;
        }),
      );
    backend.runFabricSync.mockResolvedValue(second);

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("history-current")).toHaveTextContent(
        "first-snapshot",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() =>
      expect(screen.getByTestId("item-count")).toHaveTextContent(
        String(second.items.length),
      ),
    );
    expect(screen.getByTestId("history-current")).toHaveTextContent(
      "second-snapshot",
    );
    expect(screen.getByTestId("history-count")).toHaveTextContent("2");

    await act(async () => {
      resolveReconciliation(
        buildAtlasHistory([
          snapshotFromData(second),
          snapshotFromData(first),
        ]),
      );
    });
  });

  it("hydrates user-scoped finding acknowledgements", async () => {
    findingAckBackend.loadFindingAcks.mockResolvedValue([
      {
        id: "ack-1",
        findingId: "finding-1",
        status: "muted",
        updatedAt: "2026-08-30T12:00:00.000Z",
      },
    ]);

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("finding-ack-count")).toHaveTextContent("1"),
    );
    expect(findingAckBackend.loadFindingAcks).toHaveBeenCalledWith(
      false,
      expect.any(String),
      currentUser.id,
    );
  });

  it("hydrates shared governance targets and exceptions by workspace", async () => {
    governancePolicyBackend.loadGovernancePolicy.mockResolvedValue({
      id: "policy-1",
      targets: {
        documentation: 75,
        ownership: 76,
        sensitivity: 77,
        access: 78,
        lineage: 79,
        operations: 80,
      },
      source: "persisted",
    });
    governanceExceptionBackend.loadGovernanceExceptions.mockResolvedValue([
      {
        id: "exception-1",
        findingId: "finding-1",
        reason: "Temporary",
        expiresAt: "2099-09-05T12:00:00.000Z",
        authorId: "admin-1",
        authorName: "Admin",
        authorEmail: "admin@example.com",
        createdAt: "2026-09-05T12:00:00.000Z",
        updatedAt: "2026-09-05T12:00:00.000Z",
      },
    ]);

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("governance-target-access")).toHaveTextContent(
        "78",
      ),
    );
    expect(screen.getByTestId("governance-exception-count")).toHaveTextContent(
      "1",
    );
    expect(
      governancePolicyBackend.loadGovernancePolicy,
    ).toHaveBeenCalledWith(false, expect.any(String));
    expect(
      governanceExceptionBackend.loadGovernanceExceptions,
    ).toHaveBeenCalledWith(false, expect.any(String));
  });

  it("surfaces policy load failures instead of presenting defaults as loaded", async () => {
    governancePolicyBackend.loadGovernancePolicy.mockRejectedValue(
      new Error("policy unavailable"),
    );

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("governance-policy-loading")).toHaveTextContent(
        "false",
      ),
    );
    expect(screen.getByTestId("governance-policy-error")).toHaveTextContent(
      "policy unavailable",
    );
  });

  it("saves shared targets and exceptions through the administrator path", async () => {
    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("governance-policy-loading")).toHaveTextContent(
        "false",
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Save governance targets" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("governance-target-access")).toHaveTextContent(
        "85",
      ),
    );
    expect(governancePolicyBackend.saveGovernancePolicy).toHaveBeenCalledWith(
      false,
      expect.any(String),
      currentUser,
      expect.objectContaining({ access: 85 }),
      expect.objectContaining({ source: "default" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Save governance exception" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("governance-exception-count")).toHaveTextContent(
        "1",
      ),
    );
    expect(
      governanceExceptionBackend.saveGovernanceException,
    ).toHaveBeenCalledWith(
      false,
      expect.any(String),
      currentUser,
      expect.objectContaining({ findingId: "finding-shared" }),
    );
  });

  it("blocks acknowledgement changes until hydration completes", async () => {
    let resolveAcknowledgements: (
      value: Array<{
        id: string;
        findingId: string;
        status: "acked" | "muted";
        updatedAt: string;
      }>,
    ) => void = () => undefined;
    findingAckBackend.loadFindingAcks.mockReturnValue(
      new Promise((resolve) => {
        resolveAcknowledgements = resolve;
      }),
    );

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );

    expect(screen.getByTestId("finding-ack-loading")).toHaveTextContent("true");
    fireEvent.click(
      screen.getByRole("button", { name: "Acknowledge finding" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("finding-ack-status")).toHaveTextContent(""),
    );
    expect(findingAckBackend.saveFindingAck).not.toHaveBeenCalled();

    resolveAcknowledgements([]);
    await waitFor(() =>
      expect(screen.getByTestId("finding-ack-loading")).toHaveTextContent(
        "false",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Acknowledge finding" }),
    );
    await waitFor(() =>
      expect(findingAckBackend.saveFindingAck).toHaveBeenCalledTimes(1),
    );
  });

  it("serializes acknowledgement actions for the same finding", async () => {
    const resolvers: Array<() => void> = [];
    findingAckBackend.saveFindingAck.mockImplementation(
      async (
        _preview: boolean,
        _workspaceId: string,
        _userId: string,
        input: { findingId: string; status: "acked" | "muted" },
      ) => {
        await new Promise<void>((resolve) => resolvers.push(resolve));
        return {
          id: `ack-${input.status}`,
          findingId: input.findingId,
          status: input.status,
          updatedAt: "2026-08-30T12:00:00.000Z",
        };
      },
    );
    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("hydrating")).toHaveTextContent("false"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Acknowledge finding" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Mute finding" }));
    await waitFor(() =>
      expect(findingAckBackend.saveFindingAck).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByTestId("finding-ack-pending")).toHaveTextContent(
      "true",
    );

    resolvers.shift()?.();
    await waitFor(() =>
      expect(findingAckBackend.saveFindingAck).toHaveBeenCalledTimes(2),
    );
    resolvers.shift()?.();
    await waitFor(() =>
      expect(screen.getByTestId("finding-ack-status")).toHaveTextContent(
        "muted",
      ),
    );
    expect(screen.getByTestId("finding-ack-pending")).toHaveTextContent(
      "false",
    );
  });

  it("accepts a synchronized workspace with no Fabric items", async () => {
    const empty = structuredClone(SAMPLE_DATA);
    empty.workspace.snapshotId =
      "56565656-5656-4656-8656-565656565656";
    empty.workspace.syncedAt = "2026-08-30T08:00:00.000Z";
    empty.items = [];
    empty.edges = [];
    empty.schema = {};
    backend.runFabricSync.mockResolvedValue(empty);

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("hydrating")).toHaveTextContent("false"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    await waitFor(() =>
      expect(screen.getByTestId("has-data")).toHaveTextContent("true"),
    );
    expect(screen.getByTestId("item-count")).toHaveTextContent("0");
    expect(screen.getByTestId("requires-sync")).toHaveTextContent("false");
  });

  it("does not let late hydration overwrite a completed sync", async () => {
    let resolveHydration: (value: typeof SAMPLE_DATA) => void = () => undefined;
    backend.loadFromDb.mockReturnValue(
      new Promise((resolve) => {
        resolveHydration = resolve;
      }),
    );
    backend.runFabricSync.mockResolvedValue(structuredClone(SAMPLE_DATA));

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() =>
      expect(screen.getByTestId("stage")).toHaveTextContent("Workspace is ready"),
    );

    const stale = structuredClone(SAMPLE_DATA);
    stale.workspace.displayName = "Stale hydration";
    stale.items = [];
    resolveHydration(stale);

    await waitFor(() =>
      expect(screen.getByTestId("hydrating")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("workspace-name")).toHaveTextContent(
      SAMPLE_DATA.workspace.displayName,
    );
    expect(screen.getByTestId("item-count")).toHaveTextContent(
      String(SAMPLE_DATA.items.length),
    );
  });

  it("keeps hydrated data when a sync fails", async () => {
    backend.loadFromDb.mockResolvedValue(structuredClone(SAMPLE_DATA));
    backend.runFabricSync.mockRejectedValue(new Error("incomplete scan"));

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("item-count")).toHaveTextContent(
        String(SAMPLE_DATA.items.length),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    await waitFor(() =>
      expect(screen.getByTestId("stage")).toHaveTextContent("Sync failed"),
    );
    expect(screen.getByTestId("item-count")).toHaveTextContent(
      String(SAMPLE_DATA.items.length),
    );
  });

  it("exposes current data before a slower history request completes", async () => {
    const current = structuredClone(SAMPLE_DATA);
    current.workspace.snapshotId = "current-snapshot";
    current.workspace.syncedAt = "2026-08-29T20:00:00.000Z";
    let resolveHistory: (
      value: ReturnType<typeof buildAtlasHistory>,
    ) => void = () => undefined;
    backend.loadFromDb.mockResolvedValue(current);
    backend.loadHistoryFromDb.mockReturnValue(
      new Promise((resolve) => {
        resolveHistory = resolve;
      }),
    );

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("hydrating")).toHaveTextContent("false"),
    );
    expect(screen.getByTestId("item-count")).toHaveTextContent(
      String(current.items.length),
    );
    expect(screen.getByTestId("history-loading")).toHaveTextContent("true");

    resolveHistory(
      buildAtlasHistory([
        snapshotFromData(
          current,
          current.workspace.snapshotId,
          current.workspace.syncedAt,
        ),
      ]),
    );
    await waitFor(() =>
      expect(screen.getByTestId("history-current")).toHaveTextContent(
        "current-snapshot",
      ),
    );
    expect(screen.getByTestId("history-loading")).toHaveTextContent("false");
  });

  it("lazily loads a selected historical catalog once", async () => {
    const older = structuredClone(SAMPLE_DATA);
    older.workspace.snapshotId = "older-snapshot";
    older.workspace.syncedAt = "2026-08-28T20:00:00.000Z";
    backend.loadHistoricalSnapshotFromDb.mockResolvedValue(
      snapshotFromData(
        older,
        older.workspace.snapshotId,
        older.workspace.syncedAt,
      ),
    );

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("hydrating")).toHaveTextContent("false"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Load older snapshot" }),
    );
    await waitFor(() =>
      expect(backend.loadHistoricalSnapshotFromDb).toHaveBeenCalledWith(
        false,
        "older-snapshot",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("history-count")).toHaveTextContent("1"),
    );
    expect(backend.loadHistoricalSnapshotFromDb).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Load older snapshot" }),
    );
    expect(backend.loadHistoricalSnapshotFromDb).toHaveBeenCalledTimes(1);
  });

  it("marks unavailable snapshots and clears the marker after retry", async () => {
    const older = structuredClone(SAMPLE_DATA);
    older.workspace.snapshotId = "older-snapshot";
    older.workspace.syncedAt = "2026-08-28T20:00:00.000Z";
    backend.loadHistoricalSnapshotFromDb
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        snapshotFromData(
          older,
          older.workspace.snapshotId,
          older.workspace.syncedAt,
        ),
      );

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("hydrating")).toHaveTextContent("false"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Load older snapshot" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("history-failed")).toHaveTextContent("true"),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Load older snapshot" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("history-count")).toHaveTextContent("1"),
    );
    expect(screen.getByTestId("history-failed")).toHaveTextContent("false");
  });

  it("refreshes history after sync and keeps a history failure separate from sync", async () => {
    const fresh = structuredClone(SAMPLE_DATA);
    fresh.workspace.snapshotId = "fresh-snapshot";
    fresh.workspace.syncedAt = "2026-08-29T21:00:00.000Z";
    backend.runFabricSync.mockResolvedValue(fresh);
    backend.loadHistoryFromDb.mockRejectedValueOnce(
      new Error("history unavailable"),
    );

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("hydrating")).toHaveTextContent("false"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    await waitFor(() =>
      expect(screen.getByTestId("stage")).toHaveTextContent("Workspace is ready"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("history-error")).toHaveTextContent(
        "history unavailable",
      ),
    );
    expect(screen.getByTestId("syncing")).toHaveTextContent("false");
    expect(screen.getByTestId("requires-sync")).toHaveTextContent("false");
  });

  it("does not let late history overwrite history from a newer sync", async () => {
    const hydrated = structuredClone(SAMPLE_DATA);
    hydrated.workspace.snapshotId = "hydrated-snapshot";
    hydrated.workspace.syncedAt = "2026-08-29T20:00:00.000Z";
    const fresh = structuredClone(SAMPLE_DATA);
    fresh.workspace.snapshotId = "fresh-snapshot";
    fresh.workspace.syncedAt = "2026-08-29T21:00:00.000Z";
    let resolveOldHistory: (
      value: ReturnType<typeof buildAtlasHistory>,
    ) => void = () => undefined;
    backend.loadFromDb.mockResolvedValue(hydrated);
    backend.loadHistoryFromDb
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOldHistory = resolve;
        }),
      )
      .mockResolvedValueOnce(
        buildAtlasHistory([
          snapshotFromData(
            fresh,
            fresh.workspace.snapshotId,
            fresh.workspace.syncedAt,
          ),
        ]),
      );
    backend.runFabricSync.mockResolvedValue(fresh);

    render(
      <AtlasProvider isPreview={false} currentUser={currentUser}>
        <Harness />
      </AtlasProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("history-loading")).toHaveTextContent("true"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() =>
      expect(screen.getByTestId("history-current")).toHaveTextContent(
        "fresh-snapshot",
      ),
    );

    resolveOldHistory(
      buildAtlasHistory([
        snapshotFromData(
          hydrated,
          hydrated.workspace.snapshotId,
          hydrated.workspace.syncedAt,
        ),
      ]),
    );
    await Promise.resolve();
    expect(screen.getByTestId("history-current")).toHaveTextContent(
      "fresh-snapshot",
    );
  });
});
