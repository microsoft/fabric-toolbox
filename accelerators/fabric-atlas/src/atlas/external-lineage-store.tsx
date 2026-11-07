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
import {
  buildFabricIndex,
  deleteImport,
  EMPTY_EXTERNAL_LINEAGE,
  externalRepoFor,
  importOpenLineageFile,
  loadExternalLineage,
  setLink,
  type ExternalLineage,
  type ExternalRepo,
  type ImportOutcome,
  type LinkState,
} from "./external-lineage";
import { seedPreviewExternalLineage } from "./external-lineage-demo";
import { useAtlas } from "./store";

export interface ExternalLineageContextValue {
  externalLineage: ExternalLineage;
  loading: boolean;
  error?: string;
  busy: boolean;
  reload: () => Promise<void>;
  importFile: (file: File, label?: string) => Promise<ImportOutcome>;
  removeImport: (importId: string) => Promise<void>;
  setDatasetLink: (
    datasetId: string,
    decision: { state: LinkState; fabricItemId?: string; fabricObjectName?: string },
  ) => Promise<void>;
}

const ExternalLineageContext = createContext<ExternalLineageContextValue | null>(null);

/** Imported OpenLineage files, kept outside the Fabric snapshot. */
export function ExternalLineageProvider({
  children,
  repo,
}: {
  children: ReactNode;
  repo?: ExternalRepo;
}) {
  const { data, isPreview, currentUser } = useAtlas();
  const workspaceId = data.workspace.fabricId;
  const store = useMemo(() => repo ?? externalRepoFor(isPreview), [repo, isPreview]);
  const [externalLineage, setExternalLineage] = useState<ExternalLineage>(EMPTY_EXTERNAL_LINEAGE);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const generation = useRef(0);
  const latest = useRef(externalLineage);
  const dataRef = useRef(data);
  useEffect(() => {
    latest.current = externalLineage;
  }, [externalLineage]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const seedDemo = isPreview && !repo;

  const reload = useCallback(async () => {
    const gen = ++generation.current;
    if (!workspaceId) {
      setExternalLineage(EMPTY_EXTERNAL_LINEAGE);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      if (seedDemo) await seedPreviewExternalLineage(store, dataRef.current);
      const next = await loadExternalLineage(store, workspaceId);
      if (generation.current === gen) setExternalLineage(next);
    } catch (e) {
      if (generation.current === gen) {
        setExternalLineage(EMPTY_EXTERNAL_LINEAGE);
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (generation.current === gen) setLoading(false);
    }
  }, [seedDemo, store, workspaceId]);

  useEffect(() => {
    let alive = true;
    window.queueMicrotask(() => {
      if (alive) void reload();
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  const actor = useMemo(
    () => ({
      id: currentUser.id,
      email: currentUser.email?.trim().toLowerCase() || (isPreview ? "preview@local.invalid" : ""),
    }),
    [currentUser.email, currentUser.id, isPreview],
  );

  const mutate = useCallback(
    async <T,>(run: () => Promise<T>): Promise<T> => {
      if (!actor.email) throw new Error("An authenticated email is required.");
      setBusy(true);
      try {
        return await run();
      } finally {
        await reload().catch(() => undefined);
        setBusy(false);
      }
    },
    [actor.email, reload],
  );

  const importFile = useCallback(
    (file: File, label?: string) =>
      mutate(async () =>
        importOpenLineageFile(
          store,
          workspaceId,
          actor,
          { name: file.name, label, size: file.size, text: await file.text() },
          buildFabricIndex(data),
          latest.current,
        ),
      ),
    [actor, data, mutate, store, workspaceId],
  );

  const removeImport = useCallback(
    (importId: string) => mutate(() => deleteImport(store, importId, latest.current)),
    [mutate, store],
  );

  const setDatasetLink = useCallback<ExternalLineageContextValue["setDatasetLink"]>(
    (datasetId, decision) => mutate(() => setLink(store, datasetId, decision, actor)),
    [actor, mutate, store],
  );

  const value = useMemo<ExternalLineageContextValue>(
    () => ({ externalLineage, loading, error, busy, reload, importFile, removeImport, setDatasetLink }),
    [externalLineage, loading, error, busy, reload, importFile, removeImport, setDatasetLink],
  );
  return <ExternalLineageContext.Provider value={value}>{children}</ExternalLineageContext.Provider>;
}

const NOOP_CONTEXT: ExternalLineageContextValue = {
  externalLineage: EMPTY_EXTERNAL_LINEAGE,
  loading: false,
  busy: false,
  reload: async () => undefined,
  importFile: async () => {
    throw new Error("External lineage is unavailable.");
  },
  removeImport: async () => undefined,
  setDatasetLink: async () => undefined,
};

// eslint-disable-next-line react-refresh/only-export-components
export function useExternalLineage(): ExternalLineageContextValue {
  return useContext(ExternalLineageContext) ?? NOOP_CONTEXT;
}
