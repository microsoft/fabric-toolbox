import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionInventoryUnavailableError,
  defaultConnectionStoreApi,
  readConnectionInventory,
  readLatestConnectionInventory,
  type ConnectionInventorySummary,
  type ConnectionStoreApi,
} from "./connection-inventory-store";
import type { ConnectionInventoryView } from "./connections";
import { previewConnectionInventory, previewPreviousConnectionInventory } from "./connections-demo";

export interface ConnectionCollectionIssue {
  reason: "invalid-response" | "unsupported" | "failed";
  code?: string;
  /** Error text, only known in the browser that ran the collection. */
  message?: string;
  /** False when no delegated Fabric token was available for the admin API. */
  delegated?: boolean;
  at: string;
}

const ISSUE_STORAGE_KEY = "atlas.connections.lastIssue.v1";

function storedIssue(): ConnectionCollectionIssue | undefined {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(ISSUE_STORAGE_KEY) ?? "null");
    if (!value || typeof value !== "object") return undefined;
    const issue = value as Partial<ConnectionCollectionIssue>;
    const reasons = ["invalid-response", "unsupported", "failed"];
    if (!reasons.includes(issue.reason ?? "") || typeof issue.at !== "string" || !Number.isFinite(Date.parse(issue.at))) {
      return undefined;
    }
    return {
      reason: issue.reason as ConnectionCollectionIssue["reason"],
      at: issue.at,
      ...(typeof issue.code === "string" ? { code: issue.code.slice(0, 80) } : {}),
      ...(typeof issue.message === "string" ? { message: issue.message.slice(0, 240) } : {}),
      ...(typeof issue.delegated === "boolean" ? { delegated: issue.delegated } : {}),
    };
  } catch {
    return undefined;
  }
}

function storeIssue(issue: ConnectionCollectionIssue | undefined): void {
  try {
    if (issue) window.localStorage.setItem(ISSUE_STORAGE_KEY, JSON.stringify(issue));
    else window.localStorage.removeItem(ISSUE_STORAGE_KEY);
  } catch {
    // Storage can be unavailable; the issue still shows for this session.
  }
}

const time = (value: string | undefined) => (value ? Date.parse(value) : Number.NaN);

/** The newest explanation that is more recent than the inventory on screen. */
function latestIssue(
  candidates: Array<ConnectionCollectionIssue | undefined>,
  inventory: ConnectionInventoryView | undefined,
): ConnectionCollectionIssue | undefined {
  const shown = time(inventory?.collectedAt);
  return candidates
    .filter((issue): issue is ConnectionCollectionIssue => !!issue)
    .filter((issue) => !Number.isFinite(shown) || time(issue.at) > shown)
    .sort((left, right) => time(right.at) - time(left.at))[0];
}

export interface ConnectionInventoryState {
  inventory?: ConnectionInventoryView;
  /** Why the latest collection, newer than the inventory shown, stored nothing. */
  issue?: ConnectionCollectionIssue;
  loading: boolean;
  error?: string;
  /** True when the connection entities are not deployed. */
  unavailable: boolean;
  previous?: ConnectionInventoryView;
  previousLoading: boolean;
  /** Reading the earlier inventory failed; it is not retried until the next reload. */
  previousError?: string;
  /** An earlier inventory exists to compare with. */
  previousAvailable: boolean;
  reload: () => Promise<void>;
  loadPrevious: () => Promise<void>;
  /** Replaces the latest inventory after a synchronization stored a new one. */
  setLatest: (inventory: ConnectionInventoryView) => void;
  /** Records why a synchronization kept the previous inventory. */
  reportIssue: (issue: ConnectionCollectionIssue) => void;
}

/** Latest tenant connection inventory for the live view; preview uses sample data. */
export function useConnectionInventoryState(
  isPreview: boolean,
  storeFactory: () => Promise<ConnectionStoreApi> = defaultConnectionStoreApi,
): ConnectionInventoryState {
  const [inventory, setInventory] = useState<ConnectionInventoryView | undefined>(() =>
    isPreview ? previewConnectionInventory() : undefined,
  );
  const [loading, setLoading] = useState(!isPreview);
  const [error, setError] = useState<string>();
  const [unavailable, setUnavailable] = useState(false);
  const [previousSummary, setPreviousSummary] = useState<ConnectionInventorySummary>();
  const [previous, setPrevious] = useState<ConnectionInventoryView>();
  const [previousLoading, setPreviousLoading] = useState(false);
  const [previousError, setPreviousError] = useState<string>();
  const [issue, setIssue] = useState<ConnectionCollectionIssue>();
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const current = ++generation.current;
    if (isPreview) {
      setInventory(previewConnectionInventory());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const api = await storeFactory();
      const result = await readLatestConnectionInventory(api);
      if (generation.current !== current) return;
      setUnavailable(false);
      setInventory(result.latest);
      setPreviousSummary(result.previous);
      setPrevious(undefined);
      setPreviousError(undefined);
      const attempt = result.lastAttempt;
      const recorded: ConnectionCollectionIssue | undefined = attempt
        ? {
            reason: attempt.status === "unsupported" ? "unsupported" : "failed",
            at: attempt.collectedAt,
            ...(attempt.code ? { code: attempt.code } : {}),
          }
        : undefined;
      const local = storedIssue();
      // The browser that ran the collection also knows the error text.
      const detailed = local && recorded && Math.abs(time(local.at) - time(recorded.at)) < 10 * 60_000
        ? { ...recorded, ...local }
        : undefined;
      setIssue(latestIssue([detailed ?? recorded, detailed ? undefined : local], result.latest));
    } catch (reason) {
      if (generation.current !== current) return;
      if (reason instanceof ConnectionInventoryUnavailableError) {
        setUnavailable(true);
      } else {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [isPreview, storeFactory]);

  useEffect(() => {
    let alive = true;
    window.queueMicrotask(() => {
      if (alive) void reload();
    });
    return () => {
      alive = false;
    };
  }, [reload]);

  const loadPrevious = useCallback(async () => {
    if (previous || previousLoading || previousError) return;
    if (isPreview) {
      setPrevious(previewPreviousConnectionInventory());
      return;
    }
    if (!previousSummary) return;
    const current = generation.current;
    setPreviousLoading(true);
    try {
      const api = await storeFactory();
      const loaded = await readConnectionInventory(api, previousSummary);
      if (generation.current === current) setPrevious(loaded);
    } catch (reason) {
      if (generation.current === current) setPreviousError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPreviousLoading(false);
    }
  }, [isPreview, previous, previousError, previousLoading, previousSummary, storeFactory]);

  const inventoryRef = useRef(inventory);
  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  const setLatest = useCallback((next: ConnectionInventoryView) => {
    generation.current += 1;
    const current = inventoryRef.current;
    // The inventory that was current becomes the comparison baseline.
    if (current?.id && current.id !== next.id) {
      setPrevious(current);
      setPreviousSummary(undefined);
      setPreviousError(undefined);
    }
    inventoryRef.current = next;
    setInventory(next);
    setUnavailable(false);
    setError(undefined);
    setIssue(undefined);
    storeIssue(undefined);
    setLoading(false);
  }, []);

  const reportIssue = useCallback((next: ConnectionCollectionIssue) => {
    storeIssue(next);
    setIssue(next);
  }, []);

  return {
    inventory,
    issue,
    loading,
    error,
    unavailable,
    previous,
    previousLoading,
    previousError,
    previousAvailable: isPreview || !!previous || !!previousSummary,
    reload,
    loadPrevious,
    setLatest,
    reportIssue,
  };
}
