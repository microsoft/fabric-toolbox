import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ATLAS_CONFIG } from "./config";
import { acquireScoutToken } from "./live-sync";
import { createScoutClient, isScoutConfigured, ScoutError, type ScoutClient } from "./scout";
import { ScoutChatContext, type ScoutChat, type ScoutChatTurn } from "./scout-chat-context";
import { useAtlas } from "./store";

const clockNow = () => Date.now();

function errorMessage(error: unknown, aborted: boolean): string {
  if (aborted) return "Stopped.";
  if (error instanceof ScoutError) return error.message;
  if (error instanceof Error && /consent|AADSTS65001|interaction_required|popup/i.test(error.message)) {
    return "Consent to DataAgent.Execute.All is required. Allow pop-ups for Atlas and retry, or ask an Entra admin to grant tenant-wide consent.";
  }
  return error instanceof Error ? error.message : "Atlas Scout failed.";
}

/** Owns the Atlas Scout conversation so the tab and the floating dock share one thread. */
export function ScoutChatProvider({ children }: { children: ReactNode }) {
  const { currentUser, isPreview } = useAtlas();
  const configured = isScoutConfigured({ workspaceId: ATLAS_CONFIG.scoutWorkspaceId, agentId: ATLAS_CONFIG.scoutAgentId });
  const [turns, setTurns] = useState<ScoutChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const threadRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const nextId = useRef(1);

  // The provider may pass a fresh currentUser object on every render; key the client on the
  // identity values so re-renders never abort an in-flight question.
  const { id: userId, name: userName, email: userEmail } = currentUser;
  const client = useMemo<ScoutClient | null>(
    () =>
      configured && !isPreview
        ? createScoutClient({
            endpoint: { workspaceId: ATLAS_CONFIG.scoutWorkspaceId, agentId: ATLAS_CONFIG.scoutAgentId },
            getToken: (signal) => acquireScoutToken({ id: userId, name: userName, email: userEmail }, signal),
          })
        : null,
    [configured, isPreview, userId, userName, userEmail],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (threadRef.current) void client?.endThread(threadRef.current);
      threadRef.current = undefined;
    },
    [client],
  );

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!client || !text || busyRef.current) return;
      const id = nextId.current++;
      const startedAt = clockNow();
      const update = (patch: Partial<ScoutChatTurn>) =>
        setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
      setTurns((current) => [...current, { id, question: text, phase: "connecting", startedAt }]);
      busyRef.current = true;
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const answer = await client.ask(text, threadRef.current, controller.signal, (phase) => update({ phase }));
        threadRef.current = answer.threadId;
        update({ answer: answer.text, evidence: answer.evidence, durationMs: clockNow() - startedAt });
      } catch (error) {
        update({ error: errorMessage(error, controller.signal.aborted) });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    },
    [client],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (threadRef.current) void client?.endThread(threadRef.current);
    threadRef.current = undefined;
    busyRef.current = false;
    setTurns([]);
    setBusy(false);
  }, [client]);

  const value = useMemo<ScoutChat>(
    () => ({ available: client !== null, configured, turns, busy, ask, stop, reset, dockOpen, setDockOpen }),
    [client, configured, turns, busy, ask, stop, reset, dockOpen],
  );

  return <ScoutChatContext.Provider value={value}>{children}</ScoutChatContext.Provider>;
}
