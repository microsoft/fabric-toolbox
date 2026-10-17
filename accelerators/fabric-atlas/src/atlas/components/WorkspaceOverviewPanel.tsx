import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { relativeTime } from "../model";
import { useAtlas } from "../store";
import { Card } from "../ui";
import { formatRunStart } from "../workspace-sync";

function portalWorkspaceUrl(workspaceId: string): string {
  const portal = (
    (import.meta.env.VITE_FABRIC_PORTAL_URL as string | undefined) ??
    "https://app.fabric.microsoft.com"
  ).replace(/\/$/, "");
  return `${portal}/groups/${encodeURIComponent(workspaceId)}/list?experience=power-bi`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-xxs border-b border-border py-m last:border-b-0 sm:flex-row sm:gap-m">
      <dt className="text-300 text-muted-foreground sm:w-2/5 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words text-300 font-semibold">{children}</dd>
    </div>
  );
}

export function WorkspaceOverviewPanel() {
  const {
    data,
    lastSyncedAt,
    workspaceScopes,
    activeWorkspaceId,
    hydrating,
  } = useAtlas();
  const { workspace } = data;
  const scope = workspaceScopes.find((entry) => entry.id === activeWorkspaceId);
  const inventory = [
    { label: "Fabric items", value: data.items.length },
    { label: "Lineage links", value: data.edges.length },
    { label: "Principals", value: data.principals.length },
    { label: "Access grants", value: data.grants.length },
    { label: "Job runs", value: data.jobs.length },
    { label: "Configuration entries", value: data.config.length },
    { label: "Team notes", value: data.comments.length },
  ];

  return (
    <div className="grid gap-l lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Card className="flex min-w-0 flex-col">
        <header className="border-b border-border p-l">
          <h2 className="text-400 font-semibold leading-400">Active workspace</h2>
          <p className="mt-xxs text-200 leading-200 text-muted-foreground">
            Every Atlas page reads the snapshot of this workspace.{" "}
            {workspaceScopes.length > 1
              ? "Switch workspaces from the header."
              : "Only one workspace is in the shared Atlas scope."}
          </p>
        </header>
        <div className="flex flex-col gap-l p-l">
          <dl>
            <Field label="Name">{workspace.displayName}</Field>
            <Field label="Fabric workspace ID">
              <span className="font-monospace font-normal">{workspace.fabricId}</span>
            </Field>
            <Field label="Capacity">
              {workspace.capacity?.trim() || (
                <span className="font-normal text-muted-foreground">Not reported</span>
              )}
            </Field>
            <Field label="Region">
              {workspace.region?.trim() || (
                <span className="font-normal text-muted-foreground">Not reported</span>
              )}
            </Field>
            <Field label="Scope">
              {scope?.persisted
                ? `Saved in the shared scope ${scope.selectedAt ? relativeTime(scope.selectedAt) : ""}`.trim()
                : "Configured deployment workspace"}
            </Field>
          </dl>
          {workspace.fabricId && (
            <a
              href={portalWorkspaceUrl(workspace.fabricId)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[var(--atlas-touch-target)] items-center gap-s self-start rounded-md border border-input bg-card px-l text-300 font-semibold hover:bg-accent sm:min-h-[var(--atlas-control-height)]"
            >
              <ExternalLink className="icon-size-200" aria-hidden="true" />
              Open workspace in Fabric
            </a>
          )}
        </div>
      </Card>

      <Card className="flex min-w-0 flex-col">
        <header className="border-b border-border p-l">
          <h2 className="text-400 font-semibold leading-400">
            Latest validated snapshot
          </h2>
          <p className="mt-xxs text-200 leading-200 text-muted-foreground">
            Metadata counts from the published manifest. Business data is never
            stored.
          </p>
        </header>
        {hydrating ? (
          <p role="status" className="p-l text-200 text-muted-foreground">
            Loading the workspace snapshot…
          </p>
        ) : (
          <div className="flex flex-col gap-l p-l">
            <dl>
              <Field label="Published">
                {lastSyncedAt ? (
                  <>
                    {formatRunStart(lastSyncedAt)}
                    <span className="ml-s font-normal text-muted-foreground">
                      {relativeTime(lastSyncedAt)}
                    </span>
                  </>
                ) : (
                  <span className="font-normal text-muted-foreground">
                    No snapshot published yet
                  </span>
                )}
              </Field>
              <Field label="Snapshot ID">
                {workspace.snapshotId ? (
                  <span className="font-monospace font-normal">{workspace.snapshotId}</span>
                ) : (
                  <span className="font-normal text-muted-foreground">Not recorded</span>
                )}
              </Field>
            </dl>
            <div>
              <h3 className="text-300 font-semibold">Inventory</h3>
              <ul className="mt-s grid grid-cols-1 gap-x-l sm:grid-cols-2">
                {inventory.map(({ label, value }) => (
                  <li
                    key={label}
                    className="flex items-baseline justify-between gap-m border-b border-border py-s"
                  >
                    <span className="text-300 text-muted-foreground">{label}</span>
                    <span className="font-numeric text-400 font-semibold tabular-nums">
                      {value.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
