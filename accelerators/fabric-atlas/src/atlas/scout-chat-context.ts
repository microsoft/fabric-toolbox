import { createContext, useContext } from "react";
import type { ScoutEvidence, ScoutPhase } from "./scout";

export interface ScoutChatTurn {
  id: number;
  question: string;
  phase: ScoutPhase;
  startedAt: number;
  answer?: string;
  evidence?: ScoutEvidence;
  error?: string;
  durationMs?: number;
}

export interface ScoutChat {
  /** True when a Data Agent is configured and the app runs against live data. */
  available: boolean;
  configured: boolean;
  turns: ScoutChatTurn[];
  busy: boolean;
  ask: (question: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
  /** Whether the floating Scout dock is expanded; shared so any view can open it. */
  dockOpen: boolean;
  setDockOpen: (open: boolean) => void;
}

export const ScoutChatContext = createContext<ScoutChat | null>(null);

/** Shared Atlas Scout conversation used by the Scout tab and the floating dock. */
export function useScoutChat(): ScoutChat {
  const chat = useContext(ScoutChatContext);
  if (!chat) throw new Error("useScoutChat must be used inside ScoutChatProvider.");
  return chat;
}
