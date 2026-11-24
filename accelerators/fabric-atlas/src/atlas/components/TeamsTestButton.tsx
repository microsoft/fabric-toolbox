import { useState } from "react";
import { Send } from "lucide-react";
import { buildTestCard, invokeTeamsNotify, TEAMS_NOTIFY_STATUS_LABEL } from "../teams-notify";

/** Sends a test card through the server-side Teams webhook; the URL never reaches the browser. */
export function TeamsTestButton({ workspaceName }: { workspaceName: string }) {
  const [state, setState] = useState<{ busy: boolean; message?: string }>({ busy: false });
  return (
    <span className="inline-flex items-center gap-s">
      <button
        type="button"
        disabled={state.busy}
        title="Send a test card through the ATLAS_TEAMS_WEBHOOK_URL secret"
        onClick={async () => {
          setState({ busy: true });
          try {
            const result = await invokeTeamsNotify(buildTestCard(workspaceName));
            setState({ busy: false, message: TEAMS_NOTIFY_STATUS_LABEL[result.status] });
          } catch {
            setState({ busy: false, message: "Teams test unavailable in this session." });
          }
        }}
        className="atlas-control inline-flex items-center gap-s rounded-lg border border-border bg-card px-m text-200 font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Send className="icon-size-100" aria-hidden="true" />
        Send test
      </button>
      {state.message && (
        <span role="status" className="text-200 text-muted-foreground">
          {state.message}
        </span>
      )}
    </span>
  );
}
