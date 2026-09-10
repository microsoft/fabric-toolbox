import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SAMPLE_DATA, type AtlasData, type Comment } from "./model";
import {
  loadCommentsFromDb,
  loadFromDb,
  loadHistoryFromDb,
  loadHistoricalSnapshotFromDb,
  persistComment,
  runFabricSync,
} from "./backend";
import { ATLAS_CONFIG, isSyncConfigured } from "./config";
import {
  DEPLOYMENT_ID,
  sameDeploymentGeneration,
} from "./release";
import {
  buildAtlasHistory,
  snapshotFromData,
  type AtlasHistory,
} from "./history";
import {
  createSavedView,
  deleteSavedView,
  loadSavedViews,
  type SavedView,
  type SavedViewFilters,
  type SavedViewSection,
} from "./saved-views";
import {
  deleteFindingAck,
  loadFindingAcks,
  saveFindingAck,
  type FindingAcknowledgement,
  type FindingAckStatus,
} from "./finding-acks";
import {
  deleteGovernancePolicy,
  loadGovernancePolicy,
  saveGovernancePolicy,
  type GovernancePolicyRecord,
  type GovernanceTargets,
} from "./governance-policy";
import {
  deleteGovernanceException,
  loadGovernanceExceptions,
  saveGovernanceException,
  type GovernanceException,
} from "./governance-exceptions";
import { POSTURE_TARGETS } from "./posture";

export interface CurrentUser {
  id: string;
  name: string;
  email?: string;
}

export interface AtlasContextValue {
  data: AtlasData;
  history: AtlasHistory;
  hydrating: boolean;
  historyLoading: boolean;
  historyError?: string;
  historyFailedSnapshotIds: Set<string>;
  savedViews: SavedView[];
  savedViewsLoading: boolean;
  savedViewsError?: string;
  findingAcks: FindingAcknowledgement[];
  findingAcksLoading: boolean;
  findingAcksError?: string;
  findingAckPendingIds: Set<string>;
  governanceTargets: GovernanceTargets;
  governancePolicyLoading: boolean;
  governancePolicyError?: string;
  governanceExceptions: GovernanceException[];
  governanceExceptionsLoading: boolean;
  governanceExceptionsError?: string;
  governanceExceptionPendingIds: Set<string>;
  commentsLoading: boolean;
  commentsError?: string;
  syncing: boolean;
  syncProgress: number;
  syncStage: string;
  syncStartedAt?: number;
  lastSyncedAt?: string;
  isPreview: boolean;
  configured: boolean;
  canSync: boolean;
  hasData: boolean;
  requiresDeploymentSync: boolean;
  syncError?: string;
  currentUser: CurrentUser;
  sync: () => Promise<void>;
  cancelSync: () => void;
  reloadComments: () => Promise<void>;
  addComment: (body: string, itemFabricId?: string) => Promise<void>;
  addSavedView: (input: {
    name: string;
    section: SavedViewSection;
    filters: SavedViewFilters;
  }) => Promise<void>;
  removeSavedView: (id: string) => Promise<void>;
  saveFindingAcknowledgement: (input: {
    findingId: string;
    occurrenceSnapshotId?: string;
    status: FindingAckStatus;
    note?: string;
  }) => Promise<void>;
  removeFindingAcknowledgement: (id: string) => Promise<void>;
  reloadGovernancePolicy: () => Promise<void>;
  saveGovernanceTargets: (targets: GovernanceTargets) => Promise<void>;
  resetGovernanceTargets: () => Promise<void>;
  reloadGovernanceExceptions: () => Promise<void>;
  saveGovernanceException: (input: {
    findingId: string;
    reason: string;
    expiresAt: string;
  }) => Promise<void>;
  removeGovernanceException: (id: string) => Promise<void>;
  loadHistorySnapshot: (snapshotId: string) => Promise<void>;
}

const AtlasContext = createContext<AtlasContextValue | null>(null);

function clone(d: AtlasData): AtlasData {
  return JSON.parse(JSON.stringify(d));
}

function historyAfterSync(
  previous: AtlasHistory,
  currentData: AtlasData,
): AtlasHistory {
  const snapshotId = currentData.workspace.snapshotId;
  if (!snapshotId) return previous;
  const limit = ATLAS_CONFIG.snapshotRetentionCount;
  const current = snapshotFromData(currentData, snapshotId);
  return buildAtlasHistory(
    [
      current,
      ...previous.snapshots.filter(
        (snapshot) => snapshot.snapshotId !== snapshotId,
      ),
    ].slice(0, limit),
    previous.summaries
      .filter((summary) => summary.snapshotId !== snapshotId)
      .slice(0, Math.max(0, limit - 1)),
  );
}

const EMPTY_DATA: AtlasData = {
  workspace: {
    fabricId: ATLAS_CONFIG.workspaceId,
    displayName: ATLAS_CONFIG.workspaceName,
    capacity: "",
    region: "",
  },
  items: [],
  edges: [],
  principals: [],
  grants: [],
  jobs: [],
  config: [],
  comments: [],
  syncRuns: [],
  schema: {},
};

const EMPTY_HISTORY = buildAtlasHistory([]);
const PREVIEW_HISTORY = buildAtlasHistory([
  snapshotFromData(SAMPLE_DATA, "preview-current"),
]);

export function AtlasProvider({
  children,
  isPreview = true,
  currentUser = { id: "preview-user", name: "You (preview)" },
}: {
  children: ReactNode;
  isPreview?: boolean;
  currentUser?: CurrentUser;
}) {
  // Preview shows the sample estate; deployed starts empty and is filled by the
  // first Sync (or by re-reading a previous sync from the database on open).
  const [data, setData] = useState<AtlasData>(() =>
    isPreview ? clone(SAMPLE_DATA) : clone(EMPTY_DATA),
  );
  const [history, setHistory] = useState<AtlasHistory>(() =>
    isPreview ? PREVIEW_HISTORY : EMPTY_HISTORY,
  );
  const [hydrating, setHydrating] = useState(!isPreview);
  const [historyLoading, setHistoryLoading] = useState(!isPreview);
  const [historyError, setHistoryError] = useState<string | undefined>();
  const [historyFailedSnapshotIds, setHistoryFailedSnapshotIds] = useState(
    new Set<string>(),
  );
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewsLoading, setSavedViewsLoading] = useState(!isPreview);
  const [savedViewsError, setSavedViewsError] = useState<string | undefined>();
  const [findingAcks, setFindingAcks] = useState<FindingAcknowledgement[]>([]);
  const [findingAcksLoading, setFindingAcksLoading] = useState(!isPreview);
  const [findingAcksError, setFindingAcksError] = useState<string | undefined>();
  const [findingAckPendingIds, setFindingAckPendingIds] = useState(
    new Set<string>(),
  );
  const [governancePolicy, setGovernancePolicy] =
    useState<GovernancePolicyRecord>({
      targets: { ...POSTURE_TARGETS },
      source: "default",
    });
  const [governancePolicyLoading, setGovernancePolicyLoading] =
    useState(!isPreview);
  const [governancePolicyError, setGovernancePolicyError] = useState<
    string | undefined
  >();
  const [governanceExceptions, setGovernanceExceptions] = useState<
    GovernanceException[]
  >([]);
  const [governanceExceptionsLoading, setGovernanceExceptionsLoading] =
    useState(!isPreview);
  const [governanceExceptionsError, setGovernanceExceptionsError] = useState<
    string | undefined
  >();
  const [governanceExceptionPendingIds, setGovernanceExceptionPendingIds] =
    useState(new Set<string>());
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStage, setSyncStage] = useState("Ready to sync");
  const [syncStartedAt, setSyncStartedAt] = useState<number | undefined>();
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>(
    isPreview ? SAMPLE_DATA.syncRuns[0]?.finishedAt : undefined,
  );
  const [configured] = useState<boolean>(isSyncConfigured());
  const canSync =
    isPreview ||
    (!!currentUser.id &&
      currentUser.id.trim() === ATLAS_CONFIG.syncAdminSubject.trim());
  const [requiresDeploymentSync, setRequiresDeploymentSync] = useState(
    !isPreview,
  );
  const [syncError, setSyncError] = useState<string | undefined>();
  const [commentsLoading, setCommentsLoading] = useState(!isPreview);
  const [commentsError, setCommentsError] = useState<string | undefined>();
  const progressResetTimer = useRef<number | undefined>(undefined);
  const syncAbortController = useRef<AbortController | undefined>(undefined);
  const operationGeneration = useRef(0);
  const dataRef = useRef(data);
  const historyRef = useRef(history);
  const historyLoadCount = useRef(0);
  const historyLoads = useRef(new Set<string>());
  const findingAcksRef = useRef(findingAcks);
  const findingAckQueues = useRef(new Map<string, Promise<void>>());
  const findingAckGeneration = useRef(0);
  const findingAcksLoadingRef = useRef(findingAcksLoading);
  const governancePolicyGeneration = useRef(0);
  const governancePolicyLoadingRef = useRef(governancePolicyLoading);
  const governanceExceptionGeneration = useRef(0);
  const governanceExceptionsLoadingRef = useRef(
    governanceExceptionsLoading,
  );

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    findingAcksRef.current = findingAcks;
  }, [findingAcks]);

  useEffect(() => {
    findingAcksLoadingRef.current = findingAcksLoading;
  }, [findingAcksLoading]);

  useEffect(() => {
    governancePolicyLoadingRef.current = governancePolicyLoading;
  }, [governancePolicyLoading]);

  useEffect(() => {
    governanceExceptionsLoadingRef.current = governanceExceptionsLoading;
  }, [governanceExceptionsLoading]);

  const reloadComments = useCallback(async () => {
    if (isPreview) return;
    setCommentsLoading(true);
    setCommentsError(undefined);
    try {
      const comments = await loadCommentsFromDb(false);
      setData((current) => ({ ...current, comments }));
    } catch (error) {
      setCommentsError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCommentsLoading(false);
    }
  }, [isPreview]);

  useEffect(
    () => () => {
      if (progressResetTimer.current != null) {
        window.clearTimeout(progressResetTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!syncing) return;
    const preventRefresh = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventRefresh);
    return () => window.removeEventListener("beforeunload", preventRefresh);
  }, [syncing]);

  useEffect(() => {
    if (isPreview) return;
    let alive = true;
    void loadSavedViews(
      false,
      data.workspace.fabricId,
      currentUser.id,
    )
      .then((views) => {
        if (alive) setSavedViews(views);
      })
      .catch((error) => {
        if (alive) {
          setSavedViewsError(
            error instanceof Error ? error.message : String(error),
          );
        }
      })
      .finally(() => {
        if (alive) setSavedViewsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [currentUser.id, data.workspace.fabricId, isPreview]);

  const reloadGovernancePolicy = useCallback(async () => {
    const generation = governancePolicyGeneration.current + 1;
    governancePolicyGeneration.current = generation;
    governancePolicyLoadingRef.current = true;
    setGovernancePolicy({
      targets: { ...POSTURE_TARGETS },
      source: "default",
    });
    setGovernancePolicyLoading(true);
    setGovernancePolicyError(undefined);
    try {
      const policy = await loadGovernancePolicy(
        isPreview,
        data.workspace.fabricId,
      );
      if (governancePolicyGeneration.current === generation) {
        setGovernancePolicy(policy);
      }
    } catch (error) {
      if (governancePolicyGeneration.current === generation) {
        setGovernancePolicyError(
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    } finally {
      if (governancePolicyGeneration.current === generation) {
        governancePolicyLoadingRef.current = false;
        setGovernancePolicyLoading(false);
      }
    }
  }, [data.workspace.fabricId, isPreview]);

  useEffect(() => {
    if (isPreview) return;
    let alive = true;
    window.queueMicrotask(() => {
      if (alive) void reloadGovernancePolicy().catch(() => undefined);
    });
    return () => {
      alive = false;
      governancePolicyGeneration.current += 1;
    };
  }, [isPreview, reloadGovernancePolicy]);

  const reloadGovernanceExceptions = useCallback(async () => {
    const generation = governanceExceptionGeneration.current + 1;
    governanceExceptionGeneration.current = generation;
    governanceExceptionsLoadingRef.current = true;
    setGovernanceExceptions([]);
    setGovernanceExceptionPendingIds(new Set());
    setGovernanceExceptionsLoading(true);
    setGovernanceExceptionsError(undefined);
    try {
      const exceptions = await loadGovernanceExceptions(
        isPreview,
        data.workspace.fabricId,
      );
      if (governanceExceptionGeneration.current === generation) {
        setGovernanceExceptions(exceptions);
      }
    } catch (error) {
      if (governanceExceptionGeneration.current === generation) {
        setGovernanceExceptionsError(
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    } finally {
      if (governanceExceptionGeneration.current === generation) {
        governanceExceptionsLoadingRef.current = false;
        setGovernanceExceptionsLoading(false);
      }
    }
  }, [data.workspace.fabricId, isPreview]);

  useEffect(() => {
    if (isPreview) return;
    let alive = true;
    window.queueMicrotask(() => {
      if (alive) void reloadGovernanceExceptions().catch(() => undefined);
    });
    return () => {
      alive = false;
      governanceExceptionGeneration.current += 1;
    };
  }, [isPreview, reloadGovernanceExceptions]);

  useEffect(() => {
    if (isPreview) return;
    const generation = findingAckGeneration.current + 1;
    findingAckGeneration.current = generation;
    findingAcksLoadingRef.current = true;
    let alive = true;
    window.queueMicrotask(() => {
      if (!alive || findingAckGeneration.current !== generation) return;
      findingAckQueues.current.clear();
      setFindingAcks([]);
      setFindingAcksError(undefined);
      setFindingAcksLoading(!isPreview);
      setFindingAckPendingIds(new Set());
    });
    void loadFindingAcks(
      false,
      data.workspace.fabricId,
      currentUser.id,
    )
      .then((acknowledgements) => {
        if (alive && findingAckGeneration.current === generation) {
          setFindingAcks(acknowledgements);
        }
      })
      .catch((error) => {
        if (alive && findingAckGeneration.current === generation) {
          setFindingAcksError(
            error instanceof Error ? error.message : String(error),
          );
        }
      })
      .finally(() => {
        if (alive && findingAckGeneration.current === generation) {
          findingAcksLoadingRef.current = false;
          setFindingAcksLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [currentUser.id, data.workspace.fabricId, isPreview]);

  // On open (deployed): remember the workspace id and re-hydrate from the DB.
  useEffect(() => {
    if (isPreview) return;
    (window as unknown as { __atlasWorkspaceId?: string }).__atlasWorkspaceId =
      (import.meta.env.VITE_FABRIC_WORKSPACE_ID as string) ?? ATLAS_CONFIG.workspaceId;
    let alive = true;
    const generation = operationGeneration.current;
    void loadFromDb(false)
      .then((db) => {
        if (!alive || operationGeneration.current !== generation) return;
        if (!db) {
          setHistoryLoading(false);
          void reloadComments();
          return;
        }
        setData(db);
        void reloadComments();
        setLastSyncedAt(
          db.workspace.syncedAt ?? db.syncRuns[0]?.finishedAt,
        );
        setRequiresDeploymentSync(
          !sameDeploymentGeneration(
            db.workspace.deploymentId,
            DEPLOYMENT_ID,
          ),
        );
        setHydrating(false);
        setHistoryLoading(true);
        setHistoryError(undefined);
        void loadHistoryFromDb(false, db)
          .then((loadedHistory) => {
            if (alive && operationGeneration.current === generation) {
              setHistory(loadedHistory);
            }
          })
          .catch((error) => {
            if (alive && operationGeneration.current === generation) {
              setHistoryError(
                error instanceof Error ? error.message : String(error),
              );
            }
          })
          .finally(() => {
            if (alive && operationGeneration.current === generation) {
              setHistoryLoading(false);
            }
          });
      })
      .catch(() => {
        if (alive && operationGeneration.current === generation) {
          setHistoryLoading(false);
        }
      })
      .finally(() => {
        if (alive) setHydrating(false);
      });
    return () => {
      alive = false;
    };
  }, [isPreview, reloadComments]);

  const sync = useCallback(async () => {
    if (!canSync) {
      setSyncError(
        "Only the configured Atlas sync administrator can synchronize this workspace.",
      );
      return;
    }
    const generation = operationGeneration.current + 1;
    operationGeneration.current = generation;
    historyLoads.current.clear();
    historyLoadCount.current = 0;
    setHistoryFailedSnapshotIds(new Set());
    if (progressResetTimer.current != null) {
      window.clearTimeout(progressResetTimer.current);
    }
    setSyncing(true);
    setSyncProgress(3);
    setSyncStage("Starting workspace sync");
    const syncStartedAtMs = Date.now();
    setSyncStartedAt(syncStartedAtMs);
    setSyncError(undefined);
    setHistoryLoading(false);
    const abortController = new AbortController();
    syncAbortController.current = abortController;
    const startedAt = new Date(syncStartedAtMs).toISOString();
    let succeeded = false;
    let reportedProgress = 3;
    try {
      const fresh = await runFabricSync(
        isPreview,
        currentUser,
        (progress, stage) => {
          if (operationGeneration.current !== generation) return;
          reportedProgress = Math.max(reportedProgress, progress);
          setSyncProgress(reportedProgress);
          setSyncStage(stage);
        },
        abortController.signal,
      );
      if (operationGeneration.current !== generation) return;
      const previous = dataRef.current;
      const next = fresh ?? clone(previous);
      if (fresh) {
        const comments = new Map(
          [...fresh.comments, ...previous.comments].map((comment) => [
            [
              comment.itemFabricId ?? "",
              comment.authorId,
              comment.body,
              comment.createdAt,
            ].join("\u0000"),
            comment,
          ]),
        );
        next.comments = [...comments.values()];
      }
      const finishedAt =
        next.workspace.syncedAt ?? new Date().toISOString();
      if (!fresh) {
        next.syncRuns = [
          {
            id: `s-${Date.now()}`,
            startedAt,
            finishedAt,
            status: "completed" as const,
            itemsSynced: next.items.length,
            triggeredBy: currentUser.name,
            summary: `${next.items.length} items · ${next.edges.length} lineage edges · ${next.principals.length} principals · ${next.jobs.length} jobs`,
          },
          ...next.syncRuns,
        ].slice(0, 20);
      }
      setData(next);
      setHistory((previousHistory) =>
        historyAfterSync(previousHistory, next),
      );
      setLastSyncedAt(finishedAt);
      setHistoryError(undefined);
      setHistoryLoading(true);
      void loadHistoryFromDb(isPreview, next)
        .then((loadedHistory) => {
          if (operationGeneration.current === generation) {
            setHistory(loadedHistory);
          }
        })
        .catch((error) => {
          if (operationGeneration.current === generation) {
            setHistoryError(
              error instanceof Error ? error.message : String(error),
            );
          }
        })
        .finally(() => {
          if (operationGeneration.current === generation) {
            setHistoryLoading(false);
          }
        });
      setSyncProgress(100);
      setSyncStage("Workspace is ready");
      if (!isPreview) {
        setRequiresDeploymentSync(false);
      }
      succeeded = true;
    } catch (err) {
      if (operationGeneration.current !== generation) return;
      setSyncError(err instanceof Error ? err.message : String(err));
      setSyncProgress(0);
      setSyncStage("Sync failed");
      setSyncStartedAt(undefined);
    } finally {
      if (operationGeneration.current === generation) {
        setSyncing(false);
      }
      if (syncAbortController.current === abortController) {
        syncAbortController.current = undefined;
      }
      if (succeeded && operationGeneration.current === generation) {
        progressResetTimer.current = window.setTimeout(() => {
          setSyncProgress(0);
          setSyncStage("Ready to sync");
          setSyncStartedAt(undefined);
        }, 1200);
      }
    }
  }, [canSync, isPreview, currentUser]);

  const cancelSync = useCallback(() => {
    syncAbortController.current?.abort();
  }, []);

  const addComment = useCallback(
    async (body: string, itemFabricId?: string) => {
      const text = body.trim();
      if (!text) return;
      const comment: Comment = {
        id: `c-${Date.now()}`,
        itemFabricId,
        authorId: currentUser.id,
        authorName: (
          currentUser.email ??
          currentUser.name ??
          "Authenticated user"
        ).slice(0, 160),
        authorEmail: currentUser.email,
        body: text,
        createdAt: new Date().toISOString(),
      };
      await persistComment(isPreview, comment);
      setData((prev) => ({ ...prev, comments: [...prev.comments, comment] }));
    },
    [currentUser, isPreview],
  );

  const addSavedView = useCallback(
    async (input: {
      name: string;
      section: SavedViewSection;
      filters: SavedViewFilters;
    }) => {
      setSavedViewsError(undefined);
      try {
        const view = await createSavedView(
          isPreview,
          data.workspace.fabricId,
          currentUser.id,
          input,
        );
        setSavedViews((previous) => [
          view,
          ...previous.filter((candidate) => candidate.id !== view.id),
        ]);
      } catch (error) {
        setSavedViewsError(
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    },
    [currentUser.id, data.workspace.fabricId, isPreview],
  );

  const removeSavedView = useCallback(
    async (id: string) => {
      setSavedViewsError(undefined);
      try {
        await deleteSavedView(isPreview, id);
        setSavedViews((previous) =>
          previous.filter((candidate) => candidate.id !== id),
        );
      } catch (error) {
        setSavedViewsError(
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    },
    [isPreview],
  );

  const saveFindingAcknowledgement = useCallback(
    async (input: {
      findingId: string;
      occurrenceSnapshotId?: string;
      status: FindingAckStatus;
      note?: string;
    }) => {
      if (findingAcksLoadingRef.current) {
        const error = new Error(
          "Personal acknowledgement state is still loading.",
        );
        setFindingAcksError(error.message);
        throw error;
      }
      const generation = findingAckGeneration.current;
      const previous =
        findingAckQueues.current.get(input.findingId) ??
        Promise.resolve();
      const operation = previous
        .catch(() => undefined)
        .then(async () => {
          setFindingAcksError(undefined);
          const current = findingAcksRef.current.find(
            (acknowledgement) =>
              acknowledgement.findingId === input.findingId,
          );
          const saved = await saveFindingAck(
            isPreview,
            data.workspace.fabricId,
            currentUser.id,
            { ...input, current },
          );
          if (findingAckGeneration.current !== generation) return;
          setFindingAcks((existing) => [
            saved,
            ...existing.filter(
              (acknowledgement) =>
                acknowledgement.findingId !== saved.findingId,
            ),
          ]);
        });
      findingAckQueues.current.set(input.findingId, operation);
      setFindingAckPendingIds((pending) => {
        const next = new Set(pending);
        next.add(input.findingId);
        return next;
      });
      try {
        await operation;
      } catch (error) {
        if (findingAckGeneration.current !== generation) return;
        setFindingAcksError(
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      } finally {
        if (findingAckQueues.current.get(input.findingId) === operation) {
          findingAckQueues.current.delete(input.findingId);
          setFindingAckPendingIds((pending) => {
            const next = new Set(pending);
            next.delete(input.findingId);
            return next;
          });
        }
      }
    },
    [currentUser.id, data.workspace.fabricId, isPreview],
  );

  const removeFindingAcknowledgement = useCallback(
    async (id: string) => {
      if (findingAcksLoadingRef.current) {
        const error = new Error(
          "Personal acknowledgement state is still loading.",
        );
        setFindingAcksError(error.message);
        throw error;
      }
      const generation = findingAckGeneration.current;
      setFindingAcksError(undefined);
      try {
        await deleteFindingAck(isPreview, id);
        if (findingAckGeneration.current !== generation) return;
        setFindingAcks((previous) =>
          previous.filter((acknowledgement) => acknowledgement.id !== id),
        );
      } catch (error) {
        if (findingAckGeneration.current !== generation) return;
        setFindingAcksError(
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    },
    [isPreview],
  );

  const saveGovernanceTargets = useCallback(
    async (targets: GovernanceTargets) => {
      if (!canSync) {
        const error = new Error(
          "Only the configured Atlas sync administrator can change governance targets.",
        );
        setGovernancePolicyError(error.message);
        throw error;
      }
      if (governancePolicyLoadingRef.current) {
        const error = new Error("Governance targets are still loading.");
        setGovernancePolicyError(error.message);
        throw error;
      }
      setGovernancePolicyError(undefined);
      setGovernancePolicyLoading(true);
      governancePolicyLoadingRef.current = true;
      try {
        const saved = await saveGovernancePolicy(
          isPreview,
          data.workspace.fabricId,
          currentUser,
          targets,
          governancePolicy,
        );
        setGovernancePolicy(saved);
      } catch (error) {
        setGovernancePolicyError(
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      } finally {
        governancePolicyLoadingRef.current = false;
        setGovernancePolicyLoading(false);
      }
    },
    [
      canSync,
      currentUser,
      data.workspace.fabricId,
      governancePolicy,
      isPreview,
    ],
  );

  const resetGovernanceTargets = useCallback(async () => {
    if (!canSync) {
      const error = new Error(
        "Only the configured Atlas sync administrator can reset governance targets.",
      );
      setGovernancePolicyError(error.message);
      throw error;
    }
    if (governancePolicyLoadingRef.current) {
      const error = new Error("Governance targets are still loading.");
      setGovernancePolicyError(error.message);
      throw error;
    }
    setGovernancePolicyError(undefined);
    setGovernancePolicyLoading(true);
    governancePolicyLoadingRef.current = true;
    try {
      await deleteGovernancePolicy(isPreview, governancePolicy.id);
      setGovernancePolicy({
        targets: { ...POSTURE_TARGETS },
        source: "default",
      });
    } catch (error) {
      setGovernancePolicyError(
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      governancePolicyLoadingRef.current = false;
      setGovernancePolicyLoading(false);
    }
  }, [canSync, governancePolicy.id, isPreview]);

  const saveSharedGovernanceException = useCallback(
    async (input: {
      findingId: string;
      reason: string;
      expiresAt: string;
    }) => {
      if (!canSync) {
        const error = new Error(
          "Only the configured Atlas sync administrator can change governance exceptions.",
        );
        setGovernanceExceptionsError(error.message);
        throw error;
      }
      if (governanceExceptionsLoadingRef.current) {
        const error = new Error("Governance exceptions are still loading.");
        setGovernanceExceptionsError(error.message);
        throw error;
      }
      const generation = governanceExceptionGeneration.current;
      setGovernanceExceptionsError(undefined);
      setGovernanceExceptionPendingIds((pending) => {
        const next = new Set(pending);
        next.add(input.findingId);
        return next;
      });
      try {
        const current = governanceExceptions.find(
          (exception) => exception.findingId === input.findingId,
        );
        const saved = await saveGovernanceException(
          isPreview,
          data.workspace.fabricId,
          currentUser,
          { ...input, current },
        );
        if (governanceExceptionGeneration.current !== generation) return;
        setGovernanceExceptions((existing) => [
          saved,
          ...existing.filter(
            (exception) => exception.findingId !== saved.findingId,
          ),
        ]);
      } catch (error) {
        if (governanceExceptionGeneration.current === generation) {
          setGovernanceExceptionsError(
            error instanceof Error ? error.message : String(error),
          );
        }
        throw error;
      } finally {
        if (governanceExceptionGeneration.current === generation) {
          setGovernanceExceptionPendingIds((pending) => {
            const next = new Set(pending);
            next.delete(input.findingId);
            return next;
          });
        }
      }
    },
    [
      canSync,
      currentUser,
      data.workspace.fabricId,
      governanceExceptions,
      isPreview,
    ],
  );

  const removeSharedGovernanceException = useCallback(
    async (id: string) => {
      if (!canSync) {
        const error = new Error(
          "Only the configured Atlas sync administrator can remove governance exceptions.",
        );
        setGovernanceExceptionsError(error.message);
        throw error;
      }
      const current = governanceExceptions.find(
        (exception) => exception.id === id,
      );
      if (!current) {
        const error = new Error("The selected governance exception is unavailable.");
        setGovernanceExceptionsError(error.message);
        throw error;
      }
      setGovernanceExceptionsError(undefined);
      setGovernanceExceptionPendingIds((pending) => {
        const next = new Set(pending);
        next.add(current.findingId);
        return next;
      });
      try {
        await deleteGovernanceException(isPreview, id);
        setGovernanceExceptions((existing) =>
          existing.filter((exception) => exception.id !== id),
        );
      } catch (error) {
        setGovernanceExceptionsError(
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      } finally {
        setGovernanceExceptionPendingIds((pending) => {
          const next = new Set(pending);
          next.delete(current.findingId);
          return next;
        });
      }
    },
    [canSync, governanceExceptions, isPreview],
  );

  const loadHistorySnapshot = useCallback(
    async (snapshotId: string) => {
      if (
        !snapshotId ||
        historyRef.current.snapshots.some(
          (snapshot) => snapshot.snapshotId === snapshotId,
        ) ||
        historyLoads.current.has(snapshotId)
      ) {
        return;
      }
      historyLoads.current.add(snapshotId);
      historyLoadCount.current += 1;
      const generation = operationGeneration.current;
      setHistoryLoading(true);
      setHistoryError(undefined);
      setHistoryFailedSnapshotIds((previous) => {
        if (!previous.has(snapshotId)) return previous;
        const next = new Set(previous);
        next.delete(snapshotId);
        return next;
      });
      try {
        const snapshot = await loadHistoricalSnapshotFromDb(
          isPreview,
          snapshotId,
        );
        if (generation !== operationGeneration.current) return;
        if (!snapshot) {
          throw new Error("The selected snapshot is no longer available.");
        }
        setHistory((previous) =>
          buildAtlasHistory(
            [...previous.snapshots, snapshot],
            previous.summaries,
          ),
        );
      } catch (error) {
        if (generation !== operationGeneration.current) return;
        setHistoryFailedSnapshotIds((previous) => {
          const next = new Set(previous);
          next.add(snapshotId);
          return next;
        });
        setHistoryError(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        if (generation === operationGeneration.current) {
          historyLoads.current.delete(snapshotId);
          historyLoadCount.current -= 1;
          if (historyLoadCount.current === 0) setHistoryLoading(false);
        }
      }
    },
    [isPreview],
  );

  const hasData = data.items.length > 0 || !!data.workspace.snapshotId;

  const value = useMemo<AtlasContextValue>(
    () => ({
      data,
      history,
      hydrating,
      historyLoading,
      historyError,
      historyFailedSnapshotIds,
      savedViews,
      savedViewsLoading,
      savedViewsError,
      findingAcks,
      findingAcksLoading,
      findingAcksError,
      findingAckPendingIds,
      governanceTargets: governancePolicy.targets,
      governancePolicyLoading,
      governancePolicyError,
      governanceExceptions,
      governanceExceptionsLoading,
      governanceExceptionsError,
      governanceExceptionPendingIds,
      commentsLoading,
      commentsError,
      syncing,
      syncProgress,
      syncStage,
      syncStartedAt,
      lastSyncedAt,
      isPreview,
      configured,
      canSync,
      hasData,
      requiresDeploymentSync,
      syncError,
      currentUser,
      sync,
      cancelSync,
      reloadComments,
      addComment,
      addSavedView,
      removeSavedView,
      saveFindingAcknowledgement,
      removeFindingAcknowledgement,
      reloadGovernancePolicy,
      saveGovernanceTargets,
      resetGovernanceTargets,
      reloadGovernanceExceptions,
      saveGovernanceException: saveSharedGovernanceException,
      removeGovernanceException: removeSharedGovernanceException,
      loadHistorySnapshot,
    }),
    [data, history, hydrating, historyLoading, historyError, historyFailedSnapshotIds, savedViews, savedViewsLoading, savedViewsError, findingAcks, findingAcksLoading, findingAcksError, findingAckPendingIds, governancePolicy.targets, governancePolicyLoading, governancePolicyError, governanceExceptions, governanceExceptionsLoading, governanceExceptionsError, governanceExceptionPendingIds, commentsLoading, commentsError, syncing, syncProgress, syncStage, syncStartedAt, lastSyncedAt, isPreview, configured, canSync, hasData, requiresDeploymentSync, syncError, currentUser, sync, cancelSync, reloadComments, addComment, addSavedView, removeSavedView, saveFindingAcknowledgement, removeFindingAcknowledgement, reloadGovernancePolicy, saveGovernanceTargets, resetGovernanceTargets, reloadGovernanceExceptions, saveSharedGovernanceException, removeSharedGovernanceException, loadHistorySnapshot],
  );

  return <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>;
}

export function useAtlas(): AtlasContextValue {
  const ctx = useContext(AtlasContext);
  if (!ctx) throw new Error("useAtlas must be used within an AtlasProvider");
  return ctx;
}
