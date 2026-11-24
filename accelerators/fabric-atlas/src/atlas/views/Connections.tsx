import { useEffect, useMemo, useState, type ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Cable, ChevronDown, Clock3, Download, History, Info, RefreshCw, Search, ShieldAlert, UserRound } from "lucide-react";
import { Card, cn } from "../ui";
import { PageHelp } from "../components/PageHeader";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/button-styles";
import { useAtlas } from "../store";
import type { AtlasFocusRequest, AtlasNavigation } from "../navigation";
import {
  DEFAULT_POLICY_DRAFT,
  OWNERSHIP_FLAGS,
  STALE_CREDENTIAL_DAYS,
  authenticationLabel,
  connectionBadges,
  connectionFlags,
  connectionKpis,
  connectionRiskScore,
  connectionsCsv,
  connectivityLabel,
  endpointLabel,
  evaluateReadiness,
  mergePrincipalDirectories,
  ownerSummary,
  usedByLabel,
  type ConnectionBadge,
  type ConnectionFlag,
  type ConnectionInventoryView,
  type FabricConnectionRecord,
  type PolicyDraft,
} from "../connections";
import type { ConnectionCollectionIssue } from "../connection-inventory-state";
import { ConnectionDirectoryContext, useConnectionUsages, useInventoryChanges } from "../connection-usage-state";
import { configuredSyncWriters } from "../config";
import { downloadText } from "../download";
import { Note } from "./ExternalLineageParts";
import {
  BadgeList,
  ChangesTab,
  ConnectionDetail,
  ConnectionNameCell,
  OwnerCellView,
  OwnershipTab,
  ReadinessTab,
  SMALL_BUTTON,
} from "./ConnectionsParts";

type Section = "inventory" | "ownership" | "readiness" | "changes";
type Scope = "used" | "tenant";

const SECTIONS: readonly Section[] = ["inventory", "ownership", "readiness", "changes"];
const PAGE_SIZE = 25;

const FLAG_FILTERS: Array<[string, string]> = [
  ["no-owner", "No owner"],
  ["pending-owner", "Pending owner"],
  ["single-owner", "Single owner"],
  ["user-owners-only", "Users only as owners"],
  ["owners-unknown", "Owners unknown"],
  ["credentials-unused", `Credentials unused ${STALE_CREDENTIAL_DAYS}+ days`],
  ["not-encrypted", "Not encrypted"],
  ["not-bound", "Not bound"],
  ["readiness-fail", "Fails the draft allowlist"],
  ["readiness-check", "To check against the draft"],
];

const PURPOSE: Record<Section, string> = {
  inventory:
    "Every Fabric connection in the tenant: who owns it, how it authenticates and which synchronized items use it. Read-only. Atlas never changes a connection, an owner or a credential.",
  ownership:
    "Connections at risk when someone leaves: one owner, a pending owner only, or owners that are all individual users.",
  readiness:
    "Simulate the data connection policies before you turn on Restrict to allowlist in the admin portal.",
  changes: "What changed between the last two connection inventories.",
};

interface ConnectionRow {
  connection: FabricConnectionRecord;
  flags: ConnectionFlag[];
  badges: ConnectionBadge[];
  score: number;
  used: number;
}

function filterText(focus: AtlasFocusRequest | undefined, key: string): string | undefined {
  const value = focus?.filters?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function shortDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const FAILURE_CAUSES: Record<string, string> = {
  "invoke-failed": "Atlas could not call its tenantCollectConnections Function",
  "invalid-response": "the Function returned an unexpected response",
  "store-failed": "the connections could not be written to the Atlas database",
  "not-deployed": "the tenantCollectConnections Function or the connection tables are not deployed. Run npx rayfin up",
  "not-synchronizer": "only the configured Atlas synchronizer can collect the inventory",
};

/** Explains a collection that stored nothing, with the cause Atlas can tell apart. */
function collectionIssueText(
  issue: ConnectionCollectionIssue,
  inventory: ConnectionInventoryView | undefined,
): string {
  const when = shortDateTime(issue.at);
  const kept = inventory ? ` Atlas still shows the inventory of ${shortDateTime(inventory.collectedAt)}.` : "";
  const error = issue.message ? ` Error: ${issue.message}` : "";
  if (issue.reason === "unsupported") {
    if (issue.code === "endpoint-unsupported") {
      return `The connection collection of ${when} stored nothing: the admin connections API is not available in this tenant.${kept}`;
    }
    const cause = issue.delegated === false
      ? "this browser could not get a delegated Fabric token (Tenant.Read.All), and the Atlas app identity is not allowed on Fabric admin APIs. Collect again and complete the Microsoft sign-in window"
      : issue.delegated === true
        ? "Fabric refused the synchronizer's token. The synchronizer must be a Fabric administrator and Tenant.Read.All must be granted to Atlas"
        : "Fabric refused the admin connections API. The synchronizer must be a Fabric administrator and grant Atlas a delegated Fabric token (Tenant.Read.All)";
    return `The connection collection of ${when} stored nothing: ${cause}.${kept}`;
  }
  const code = issue.code ?? (issue.reason === "invalid-response" ? "invalid-response" : undefined);
  const cause = (code && FAILURE_CAUSES[code])
    ?? (code ? `the admin connections API call failed (${code})` : "the collection failed");
  return `The connection collection of ${when} stored nothing: ${cause}.${error}${kept}`;
}

function Kpi({
  icon: Icon, label, value, detail, alert,
}: {
  icon: typeof Cable; label: string; value: number; detail: string; alert?: boolean;
}) {
  return (
    <Card className="min-w-0 px-l py-[13px]">
      <div className="flex items-center gap-[6px] text-200 text-muted-foreground">
        <Icon className="size-[14px] shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          "mt-xs font-numeric text-[28px] font-semibold leading-[34px] tabular-nums",
          alert && value > 0 && "text-signal-danger-foreground",
        )}
      >
        {value}
      </div>
      <div className="truncate text-200 text-muted-foreground">{detail}</div>
    </Card>
  );
}

function PillSelect({
  label, value, options, onChange, anyLabel = "All",
}: {
  label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void; anyLabel?: string;
}) {
  const current = options.find(([optionValue]) => optionValue === value)?.[1] ?? anyLabel;
  return (
    <label className="relative inline-flex h-[30px] max-w-full items-center gap-[6px] whitespace-nowrap rounded-md border border-input bg-card pl-[10px] pr-s text-[12.5px] focus-within:ring-2 focus-within:ring-ring max-sm:h-11">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[160px] truncate text-foreground">{current}</span>
      <ChevronDown className="size-[14px] shrink-0 text-muted-foreground" aria-hidden="true" />
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        <option value="all">{anyLabel}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}

function ScopeToggle({
  scope, used, total, onChange,
}: {
  scope: Scope; used: number; total: number; onChange: (scope: Scope) => void;
}) {
  const options: Array<[Scope, string, number]> = [["used", "Used by synced items", used], ["tenant", "Whole tenant", total]];
  return (
    <div role="group" aria-label="Connection scope" className="inline-flex overflow-hidden rounded-md border border-input bg-card">
      {options.map(([value, label, count]) => (
        <button
          key={value}
          type="button"
          aria-pressed={scope === value}
          onClick={() => onChange(value)}
          className={cn(
            "inline-flex h-[30px] items-center gap-[6px] border-r border-input px-[10px] text-200 font-semibold last:border-r-0",
            scope === value ? "bg-primary/10 text-brand-foreground" : "text-muted-foreground hover:bg-accent",
          )}
        >
          {label}
          <span className="font-numeric font-bold">{count}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyCard({ children }: { children: ReactNode }) {
  return <Card className="flex flex-col items-center px-xl py-xxxl text-center">{children}</Card>;
}

export function ConnectionsView({
  focus,
  onNavigate,
  onStateChange,
}: {
  focus?: AtlasFocusRequest;
  onNavigate?: (navigation: AtlasNavigation) => void;
  onStateChange?: (navigation: AtlasNavigation) => void;
} = {}) {
  const { data, isPreview, connectionInventory, workspaceScopes, workspaceSyncStatuses, currentUser } = useAtlas();
  const inventory = connectionInventory.inventory;
  const initialSection = filterText(focus, "section");
  const [section, setSection] = useState<Section>(
    SECTIONS.includes(initialSection as Section) ? (initialSection as Section) : "inventory",
  );
  const [scope, setScope] = useState<Scope>(filterText(focus, "scope") === "used" ? "used" : "tenant");
  const [query, setQuery] = useState(focus?.query ?? filterText(focus, "search") ?? "");
  const [connector, setConnector] = useState("all");
  const [connectivity, setConnectivity] = useState("all");
  const [authentication, setAuthentication] = useState("all");
  const [flag, setFlag] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | undefined>(filterText(focus, "connection"));
  const [draft, setDraft] = useState<PolicyDraft>(DEFAULT_POLICY_DRAFT);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    onStateChange?.({
      tab: "connections",
      focus: {
        requestId: "connections-view-state",
        query: query.trim() || undefined,
        filters: { section, scope, search: query, ...(selectedId ? { connection: selectedId } : {}) },
      },
    });
  }, [onStateChange, query, scope, section, selectedId]);

  const workspaceRefs = useMemo(
    () => workspaceScopes.map((workspace) => ({ id: workspace.id, snapshotId: workspaceSyncStatuses[workspace.id]?.snapshotId })),
    [workspaceScopes, workspaceSyncStatuses],
  );
  const usageState = useConnectionUsages(
    isPreview,
    {
      workspaceId: data.workspace.fabricId,
      workspaceName: data.workspace.displayName,
      config: data.config,
      items: data.items,
      principals: data.principals,
    },
    workspaceRefs,
  );
  const usages = usageState.usages;
  // The admin API returns owners as bare IDs: name them from workspace members, the signed-in user and synchronizers.
  const userId = currentUser?.id;
  const userEmail = currentUser?.email;
  const principals = useMemo(() => {
    const known: Array<{ principalId: string; displayName: string }> = [];
    if (userId && userEmail) known.push({ principalId: userId, displayName: userEmail });
    for (const writer of configuredSyncWriters()) known.push({ principalId: writer.subject, displayName: writer.email });
    return mergePrincipalDirectories(usageState.principals, known);
  }, [userEmail, userId, usageState.principals]);
  const inventoryChanges = useInventoryChanges();

  const connections = useMemo(() => inventory?.connections ?? [], [inventory]);
  const rows = useMemo<ConnectionRow[]>(
    () => connections.map((connection) => {
      const flags = connectionFlags(connection, now);
      const badges = connectionBadges(connection, flags, evaluateReadiness(connection, draft), now);
      return { connection, flags, badges, score: connectionRiskScore(badges), used: usages.get(connection.id)?.length ?? 0 };
    }),
    [connections, draft, now, usages],
  );
  const usedCount = rows.filter((row) => row.used > 0).length;
  const scoped = useMemo(() => (scope === "used" ? rows.filter((row) => row.used > 0) : rows), [rows, scope]);
  const scopedConnections = useMemo(() => scoped.map((row) => row.connection), [scoped]);
  const flagsById = useMemo(() => new Map(rows.map((row) => [row.connection.id, row.flags])), [rows]);
  const kpis = useMemo(() => connectionKpis(scopedConnections, draft, usages, now), [draft, now, scopedConnections, usages]);

  const options = useMemo(() => {
    const unique = (values: Array<string | undefined>) =>
      [...new Set(values.filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b));
    return {
      connectors: unique(connections.map((connection) => connection.connectorType)).map((value) => [value, value] as [string, string]),
      connectivity: unique(connections.map((connection) => connection.connectivityType))
        .map((value) => [value, connectivityLabel(value)] as [string, string]),
      authentication: unique(connections.map((connection) => connection.credentialType))
        .map((value) => [value, authenticationLabel({ credentialType: value })] as [string, string]),
    };
  }, [connections]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scoped
      .filter(({ connection }) => connector === "all" || connection.connectorType === connector)
      .filter(({ connection }) => connectivity === "all" || connection.connectivityType === connectivity)
      .filter(({ connection }) => authentication === "all" || connection.credentialType === authentication)
      .filter(({ badges }) => flag === "all" || badges.some((badge) => badge.id === flag))
      .filter(({ connection }) => {
        if (!needle) return true;
        return [
          connection.displayName,
          connection.id,
          connection.connectorType,
          connection.path,
          ownerSummary(connection, principals),
        ].some((value) => value?.toLowerCase().includes(needle));
      })
      .sort((left, right) => right.score - left.score || left.connection.displayName.localeCompare(right.connection.displayName));
  }, [authentication, connectivity, connector, flag, principals, query, scoped]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selected = filtered.find((row) => row.connection.id === selectedId) ?? filtered[0];
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };
  const select = (id: string) => {
    setSelectedId(id);
    setSection("inventory");
  };

  const ownershipCount = scoped.filter((row) => row.flags.some((entry) => OWNERSHIP_FLAGS.includes(entry))).length;
  const tabs: Array<{ id: Section; label: string; count?: number }> = [
    { id: "inventory", label: "Inventory", count: scoped.length },
    { id: "ownership", label: "Ownership", count: ownershipCount },
    { id: "readiness", label: "Policy readiness", count: kpis.failDraft },
    { id: "changes", label: "Changes", count: inventoryChanges.previous ? inventoryChanges.changes.length : undefined },
  ];

  const exportCsv = () =>
    downloadText(
      connectionsCsv(filtered.map((row) => row.connection), { usages, draft, principals, now }),
      "text/csv;charset=utf-8",
      `fabric-connections-${new Date().toISOString().slice(0, 10)}.csv`,
    );

  const statusNote = (() => {
    if (connectionInventory.unavailable) {
      return { tone: "warning" as const, text: "The connection inventory tables are not deployed yet. Deploy Fabric Atlas 2.8 or later." };
    }
    if (connectionInventory.error && !inventory) {
      return { tone: "warning" as const, text: `The connection inventory could not be read: ${connectionInventory.error}` };
    }
    if (connectionInventory.collecting) {
      return { tone: "info" as const, text: `${connectionInventory.collectStage ?? "Collecting tenant connections"}…` };
    }
    const issue = connectionInventory.issue;
    if (issue) return { tone: "warning" as const, text: collectionIssueText(issue, inventory) };
    if (!inventory) return undefined;
    if (inventory.status === "unsupported") {
      return {
        tone: "warning" as const,
        text: "The admin connections API refused the synchronizer. Synchronize as a Fabric administrator to collect the tenant inventory.",
      };
    }
    if (inventory.status === "failed") {
      return { tone: "warning" as const, text: `The last collection failed (${inventory.code ?? "unknown error"}). Atlas shows what it stored.` };
    }
    const parts: string[] = [];
    if (inventory.truncated) parts.push("the inventory reached the collection limit and is partial");
    if (inventory.roleLookups.skipped || inventory.roleLookups.failed) {
      parts.push(`${inventory.roleLookups.skipped + inventory.roleLookups.failed} connections have unknown owners (lookups skipped or failed)`);
    }
    return parts.length ? { tone: "info" as const, text: `Note: ${parts.join("; ")}.` } : undefined;
  })();

  const collectButton = (className: string) =>
    connectionInventory.canCollect || connectionInventory.collecting ? (
      <button
        type="button"
        className={className}
        onClick={() => void connectionInventory.collect()}
        disabled={connectionInventory.collecting || !connectionInventory.canCollect}
      >
        <RefreshCw
          className={cn("size-4", connectionInventory.collecting && "motion-safe:animate-spin")}
          aria-hidden="true"
        />
        {connectionInventory.collecting ? "Collecting…" : "Collect connections"}
      </button>
    ) : null;

  const first = filtered.length ? currentPage * PAGE_SIZE + 1 : 0;
  const last = Math.min(filtered.length, (currentPage + 1) * PAGE_SIZE);

  return (
    <ConnectionDirectoryContext.Provider value={principals}>
      <Tabs.Root value={section} onValueChange={(value) => setSection(value as Section)} asChild>
        <div className="atlas-content-frame flex flex-col gap-l">
          <header className="relative flex flex-wrap items-start gap-l">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-s">
                <h1 className="font-heading text-500 font-semibold leading-500">Connections</h1>
                <PageHelp title="Connections">
                  Atlas reads the Fabric admin connections API (Preview) once per synchronization, or on demand with
                  Collect connections. It stores names,
                  connector types, endpoints without query strings, authentication methods, recency and role
                  assignments. Fabric never returns secrets. Links to items come from the shortcut and mirroring
                  evidence of every synchronized workspace.
                </PageHelp>
              </div>
              <p className="mt-xxs max-w-[760px] text-200 leading-200 text-muted-foreground">{PURPOSE[section]}</p>
            </div>
            {inventory && (
              <div className="flex flex-wrap items-center gap-s">
                <ScopeToggle scope={scope} used={usedCount} total={rows.length} onChange={resetPage(setScope)} />
                {collectButton(SECONDARY_BUTTON)}
                <button type="button" className={SECONDARY_BUTTON} onClick={exportCsv} disabled={!filtered.length}>
                  <Download className="size-4" aria-hidden="true" />
                  Export CSV
                </button>
              </div>
            )}
          </header>

          <div className="-mt-xs flex flex-wrap items-end gap-x-l border-b border-border">
            <Tabs.List aria-label="Connection sections" className="flex min-w-0 overflow-x-auto">
              {tabs.map(({ id, label, count }) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  className="atlas-line-tab px-m font-semibold focus-visible:ring-inset focus-visible:ring-offset-0"
                >
                  {label}
                  {count !== undefined && (
                    <span className="rounded-full bg-muted px-[6px] font-numeric text-[11px] font-semibold text-muted-foreground">
                      {count}
                    </span>
                  )}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {inventory && (
              <p className="ml-auto flex items-center gap-[6px] pb-s text-[11.5px] text-muted-foreground">
                <Info className="size-[14px] shrink-0" aria-hidden="true" />
                Fabric admin connections API (Preview) · Tenant.Read.All token · {shortDateTime(inventory.collectedAt)}
                {" "}· no secret is returned{isPreview ? " · sample data" : ""}
              </p>
            )}
          </div>

          {statusNote && (
            <div role="status">
              <Note tone={statusNote.tone}>{statusNote.text}</Note>
            </div>
          )}

          {connectionInventory.loading && !inventory ? (
            <Card className="p-xl text-300 text-muted-foreground">
              <div role="status">Loading the connection inventory…</div>
            </Card>
          ) : !inventory ? (
            !connectionInventory.unavailable && !connectionInventory.error && (
              <EmptyCard>
                <Cable className="icon-size-500 text-muted-foreground" aria-hidden="true" />
                <h2 className="mt-l text-400 font-semibold">No connection inventory yet</h2>
                <p className="mt-s max-w-[560px] text-300 text-muted-foreground">
                  {connectionInventory.canCollect || connectionInventory.collecting
                    ? "Collect it now, or let the next synchronization collect it. "
                    : "The synchronizer collects it during the next synchronization. "}
                  The synchronizer must be a Fabric administrator: the admin connections API refuses other accounts.
                </p>
                {collectButton(cn(PRIMARY_BUTTON, "mt-xl"))}
              </EmptyCard>
            )
          ) : (
            <>
              <section aria-label="Connection summary" className="grid gap-l sm:grid-cols-2 xl:grid-cols-5">
                <Kpi icon={Cable} label="Connections" value={kpis.total} detail={`${kpis.cloud} cloud · ${kpis.gateway} through a gateway`} />
                <Kpi icon={UserRound} label="Single owner" value={kpis.singleOwner} detail={`${kpis.singleOwnerUsed} used by synchronized items`} />
                <Kpi icon={Clock3} label="Pending owner" value={kpis.pendingOwner} detail="Credentials not re-entered yet" />
                <Kpi
                  icon={History}
                  label={`Credentials unused ${STALE_CREDENTIAL_DAYS}+ days`}
                  value={kpis.credentialsUnused}
                  detail="Check dependencies before deleting"
                />
                <Kpi icon={ShieldAlert} label="Fail the draft allowlist" value={kpis.failDraft} alert detail="Cloud connections only, not enforced" />
              </section>

              <Tabs.Content value="inventory" className="outline-none">
                <div className="grid items-start gap-l xl:grid-cols-[minmax(0,1fr)_404px]">
                  <Card className="min-w-0 overflow-hidden">
                    <div className="flex flex-wrap items-center gap-s border-b border-border px-[14px] py-m">
                      <label className="relative w-full sm:w-[250px]">
                        <span className="sr-only">Search connections</span>
                        <Search
                          className="pointer-events-none absolute left-[10px] top-1/2 size-[14px] -translate-y-1/2 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={query}
                          onChange={(event) => resetPage(setQuery)(event.target.value)}
                          placeholder="Search name, endpoint or owner"
                          className="h-[30px] w-full rounded-md border border-input bg-card pl-[30px] pr-[10px] text-[12.5px] placeholder:text-muted-foreground max-sm:h-11"
                        />
                      </label>
                      <PillSelect label="Connector" value={connector} options={options.connectors} onChange={resetPage(setConnector)} />
                      <PillSelect label="Connectivity" value={connectivity} options={options.connectivity} onChange={resetPage(setConnectivity)} />
                      <PillSelect label="Authentication" value={authentication} options={options.authentication} onChange={resetPage(setAuthentication)} />
                      <PillSelect label="Flag" value={flag} options={FLAG_FILTERS} onChange={resetPage(setFlag)} anyLabel="Any" />
                      <span className="ml-auto text-200 text-muted-foreground">Sorted by flags</span>
                    </div>
                    {filtered.length === 0 ? (
                      <div className="px-xl py-xxxl text-center text-300 text-muted-foreground">
                        {scoped.length
                          ? "No connection matches these filters."
                          : scope === "used"
                            ? usageState.loading
                              ? "Reading the synchronized workspaces…"
                              : "No synchronized item uses a connection Atlas can see (shortcuts and mirroring)."
                            : "The inventory is empty."}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[880px] table-fixed border-collapse text-left text-[12.5px]">
                          <colgroup>
                            <col style={{ width: "24%" }} />
                            <col style={{ width: "25%" }} />
                            <col style={{ width: "11%" }} />
                            <col style={{ width: "15%" }} />
                            <col style={{ width: "7%" }} />
                            <col style={{ width: "18%" }} />
                          </colgroup>
                          <thead>
                            <tr>
                              {["Connection", "Endpoint", "Authentication", "Owners", "Used by", "Flags"].map((heading) => (
                                <th
                                  key={heading}
                                  scope="col"
                                  className="whitespace-nowrap border-b border-border bg-secondary px-[10px] py-s text-200 font-semibold text-muted-foreground"
                                >
                                  {heading}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {pageRows.map(({ connection, badges, used }) => {
                              const active = selected?.connection.id === connection.id;
                              const cell = "overflow-hidden border-b border-border px-[10px] py-s align-middle";
                              return (
                                <tr
                                  key={connection.id}
                                  data-selected={active || undefined}
                                  onClick={() => select(connection.id)}
                                  className={cn(
                                    "cursor-pointer [&:last-child>td]:border-b-0",
                                    active ? "bg-primary/[0.06]" : "hover:bg-accent/60",
                                  )}
                                >
                                  <td className={cn(cell, active && "shadow-[inset_3px_0_0_var(--color-primary)]")}>
                                    <ConnectionNameCell connection={connection} onSelect={select} current={active} />
                                  </td>
                                  <td className={cell}>
                                    {connection.path ? (
                                      <span className="block truncate font-monospace text-[11.5px]" title={connection.path}>
                                        {endpointLabel(connection.path)}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">Not reported</span>
                                    )}
                                  </td>
                                  <td className={cn(cell, "truncate")}>{authenticationLabel({ credentialType: connection.credentialType })}</td>
                                  <td className={cell}><OwnerCellView connection={connection} /></td>
                                  <td className={cn(cell, used ? "font-numeric" : "text-muted-foreground")}>{usedByLabel(used)}</td>
                                  <td className={cell}><BadgeList badges={badges} /></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-s border-t border-border px-[14px] py-[9px] text-200 text-muted-foreground">
                      <span>
                        {filtered.length ? `${first} to ${last} of ${filtered.length} connections` : "0 connections"}
                      </span>
                      <span className="flex items-center gap-s">
                        <button
                          type="button"
                          className={SMALL_BUTTON}
                          disabled={currentPage === 0}
                          onClick={() => setPage(currentPage - 1)}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className={SMALL_BUTTON}
                          disabled={currentPage >= pageCount - 1}
                          onClick={() => setPage(currentPage + 1)}
                        >
                          Next
                        </button>
                      </span>
                    </div>
                  </Card>
                  {selected && (
                    <ConnectionDetail
                      connection={selected.connection}
                      flags={selected.flags}
                      usages={usages.get(selected.connection.id) ?? []}
                      usagesLoading={usageState.loading}
                      draft={draft}
                      now={now}
                      onNavigate={onNavigate}
                    />
                  )}
                </div>
              </Tabs.Content>
              <Tabs.Content value="ownership" className="outline-none">
                <OwnershipTab connections={scopedConnections} flagsById={flagsById} usages={usages} onSelect={select} />
              </Tabs.Content>
              <Tabs.Content value="readiness" className="outline-none">
                <ReadinessTab
                  connections={scopedConnections}
                  draft={draft}
                  onDraftChange={setDraft}
                  usages={usages}
                  onSelect={select}
                />
              </Tabs.Content>
              <Tabs.Content value="changes" className="outline-none">
                <ChangesTab
                  changes={inventoryChanges.changes}
                  previousCollectedAt={inventoryChanges.previous?.collectedAt}
                  previousAvailable={inventoryChanges.previousAvailable}
                  error={inventoryChanges.previousError}
                  loading={inventoryChanges.loading}
                  onSelect={select}
                />
              </Tabs.Content>
            </>
          )}
        </div>
      </Tabs.Root>
    </ConnectionDirectoryContext.Provider>
  );
}
