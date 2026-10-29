import { useEffect, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { PageHeader } from "../components/PageHeader";
import {
  DEFAULT_WORKSPACE_SECTION,
  isWorkspaceSection,
  type AtlasFocusRequest,
  type AtlasNavigation,
  type WorkspaceSection,
} from "../navigation";
import { WorkspaceOverviewPanel } from "../components/WorkspaceOverviewPanel";
import { WorkspaceSynchronizationPanel } from "../components/WorkspaceSynchronizationPanel";
import { CommentsView } from "./Comments";
import { ConfigView } from "./Config";

const HUB_TABS: { id: WorkspaceSection; label: string }[] = [
  { id: "workspace", label: "Workspace" },
  { id: "synchronization", label: "Synchronization" },
  { id: "configuration", label: "Configuration" },
  { id: "notes", label: "Team notes" },
];

const PANEL_CLASS =
  "rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";

export function WorkspaceHubView({
  focus,
  section: initialSection,
  onStateChange,
}: {
  focus?: AtlasFocusRequest;
  /** Last section reported by this view, restored after a workspace switch remounts it. */
  section?: WorkspaceSection;
  onStateChange?: (navigation: AtlasNavigation) => void;
} = {}) {
  const [section, setSection] = useState<WorkspaceSection>(
    initialSection ?? focus?.workspaceSection ?? DEFAULT_WORKSPACE_SECTION,
  );
  const [itemId, setItemId] = useState(focus?.itemId ?? "");
  const commentId = focus?.commentId;

  useEffect(() => {
    onStateChange?.({
      tab: "workspace",
      focus: {
        requestId: "workspace-view-state",
        workspaceSection: section,
        itemId: itemId || undefined,
        commentId,
      },
    });
  }, [commentId, itemId, onStateChange, section]);

  return (
    <Tabs.Root
      value={section}
      onValueChange={(value) => {
        if (isWorkspaceSection(value)) setSection(value);
      }}
      asChild
    >
      <div className="atlas-content-frame flex min-w-0 flex-col gap-l">
        <PageHeader title="Workspace Hub" purpose="Manage scope, synchronization and team notes." />

        <Tabs.List
          aria-label="Workspace Hub sections"
          className="atlas-line-tabs"
        >
          {HUB_TABS.map(({ id, label }) => (
            <Tabs.Trigger
              key={id}
              value={id}
              className="atlas-line-tab focus-visible:ring-inset focus-visible:ring-offset-0"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="workspace" className={PANEL_CLASS}>
          <WorkspaceOverviewPanel />
        </Tabs.Content>
        <Tabs.Content value="synchronization" className={PANEL_CLASS}>
          <WorkspaceSynchronizationPanel />
        </Tabs.Content>
        <Tabs.Content value="configuration" className={PANEL_CLASS}>
          <ConfigView
            embedded
            focus={{
              ...focus,
              requestId: focus?.requestId ?? "workspace-local",
              itemId,
            }}
            onSelectedItemChange={setItemId}
          />
        </Tabs.Content>
        <Tabs.Content value="notes" className={PANEL_CLASS}>
          <CommentsView
            embedded
            focus={{
              ...focus,
              requestId: focus?.requestId ?? "workspace-local",
              itemId,
              commentId,
            }}
            onTargetChange={setItemId}
          />
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}
