import { ExternalLink, Layers3 } from "lucide-react";
import { useMemo } from "react";
import { NO_DOMAIN_KEY, domainKey, workspaceDomainGroups } from "../domain-governance";
import { setDomainFilter } from "../domain-filter";
import { fabricGovernanceSurfaceUrl } from "../fabric-portal";
import { domainIndex } from "../governance-evidence";
import { useAtlas } from "../store";

/** Active workspace's Fabric domain, its parent and workspace counts (Overview header). */
export function WorkspaceDomainBanner() {
  const { data, workspaceScopes, workspaceSyncStatuses } = useAtlas();
  const domainId = data.workspace.fabricDomainId;
  const groups = useMemo(
    () => workspaceDomainGroups(workspaceScopes, workspaceSyncStatuses, data),
    [data, workspaceScopes, workspaceSyncStatuses],
  );
  if (!domainId) return null;
  const key = domainKey(domainId);
  if (key === NO_DOMAIN_KEY) {
    return (
      <div className="flex flex-wrap items-center gap-s rounded-lg border border-signal-warning-foreground/30 bg-signal-warning-background px-l py-s text-200 text-signal-warning-foreground">
        <Layers3 className="icon-size-100" aria-hidden="true" />
        <span className="font-semibold">No Fabric domain</span>
        <span>This workspace is not assigned to a domain; domain-level governance does not apply.</span>
      </div>
    );
  }
  const index = domainIndex(data.governanceEvidence);
  const domain = index.get(key);
  const parent = domain?.parentDomainId ? index.get(domain.parentDomainId.toLowerCase()) : undefined;
  const inScope = groups.find((group) => group.key === key)?.workspaceIds.length ?? 1;
  const name = domain?.displayName ?? `Unknown name (${domainId.slice(0, 8)}…)`;
  const counts = [
    `${domain?.workspaceCount ?? inScope} workspace${(domain?.workspaceCount ?? inScope) === 1 ? "" : "s"} in ${name}`,
    parent?.workspaceCount != null ? `${parent.workspaceCount} in ${parent.displayName}` : undefined,
    domain?.workspaceCount != null ? `${inScope} in Atlas scope` : undefined,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-x-m gap-y-xs rounded-lg border border-border bg-secondary/55 px-l py-s text-200">
      <Layers3 className="icon-size-100 text-brand-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">Domain</span>
      {parent && (
        <>
          <span className="text-muted-foreground">{parent.displayName}</span>
          <span aria-hidden="true" className="text-muted-foreground">›</span>
        </>
      )}
      <button
        type="button"
        className="font-semibold text-brand-foreground hover:underline"
        title="Filter the whole app on this domain"
        onClick={() => setDomainFilter(key)}
      >
        {name}
      </button>
      {parent && <span className="text-muted-foreground">Sub-domain of {parent.displayName}</span>}
      <span className="text-muted-foreground">· {counts.join(" · ")}</span>
      <a
        className="ml-auto inline-flex items-center gap-xs font-semibold text-brand-foreground hover:underline"
        href={fabricGovernanceSurfaceUrl("/admin-portal/domains?experience=fabric-developer")}
        target="_blank"
        rel="noreferrer"
      >
        Open domain in Fabric
        <ExternalLink className="icon-size-100" aria-hidden="true" />
      </a>
    </div>
  );
}