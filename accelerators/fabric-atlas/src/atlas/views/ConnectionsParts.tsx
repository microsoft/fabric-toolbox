import { useMemo, useState, type ReactNode } from "react";
import {
  AppWindow,
  Copy,
  Database,
  ExternalLink,
  GitCompareArrows,
  ListChecks,
  UserRound,
  Users,
  Waypoints,
} from "lucide-react";
import { Card, cn } from "../ui";
import { SavedViewsMenu } from "../components/SavedViewsMenu";
import { SECONDARY_BUTTON } from "../components/button-styles";
import { useAtlas } from "../store";
import type { AtlasNavigation } from "../navigation";
import { typeMeta } from "../model";
import { createLineageIndex, getLineageImpact } from "../lineage";
import {
  AUTHENTICATION_METHODS,
  CONNECTION_FLAG_LABEL,
  DEFAULT_POLICY_DRAFT,
  OWNERSHIP_FLAGS,
  authenticationDetail,
  authenticationLabel,
  connectionBadges,
  connectivityDetail,
  connectivityLabel,
  connectorGlyph,
  evaluateReadiness,
  isGatewayConnection,
  normalizePolicyDraft,
  ownerAssignmentRequest,
  ownerCell,
  ownerSummary,
  principalLabel,
  principalTypeLabel,
  readinessBadges,
  roleLabel,
  usageSourceLabel,
  usedByLabel,
  type BadgeTone,
  type ConnectionBadge,
  type ConnectionChange,
  type ConnectionChangeKind,
  type ConnectionFlag,
  type ConnectionUsage,
  type FabricConnectionRecord,
  type PolicyDraft,
  type ReadinessStatus,
} from "../connections";
import { useConnectionDirectory } from "../connection-usage-state";
import { Note } from "./ExternalLineageParts";

const MANAGE_CONNECTIONS_URL = "https://app.fabric.microsoft.com/groups/me/gateways";

export const SMALL_BUTTON =
  "inline-flex h-7 items-center justify-center gap-[6px] whitespace-nowrap rounded-md border border-input bg-card px-[10px] text-200 font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";

const BADGE_TONE: Record<BadgeTone, string> = {
  warning: "bg-signal-warning-background text-signal-warning-foreground",
  danger: "bg-signal-danger-background text-signal-danger-foreground",
  info: "bg-signal-info-background text-signal-info-foreground",
  success: "bg-signal-success-background text-signal-success-foreground",
  muted: "bg-muted text-muted-foreground",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-[6px] py-[1px] text-[11px] font-semibold leading-[16px]",
        BADGE_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

export function BadgeList({ badges }: { badges: readonly ConnectionBadge[] }) {
  if (!badges.length) return <span className="text-200 text-muted-foreground">None</span>;
  return (
    <div className="flex flex-wrap gap-xs">
      {badges.map((badge) => <Badge key={badge.id} tone={badge.tone}>{badge.label}</Badge>)}
    </div>
  );
}

/** Connector abbreviation; the connector name is always written next to it. */
export function ConnectionGlyph({ connectorType, large }: { connectorType?: string; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-muted font-bold tracking-[0.02em] text-muted-foreground",
        large ? "h-[30px] w-9 text-[10.5px]" : "h-6 w-[30px] text-[9.5px]",
      )}
    >
      {connectorGlyph(connectorType)}
    </span>
  );
}

export function OwnerCellView({ connection }: { connection: FabricConnectionRecord }) {
  const principals = useConnectionDirectory();
  const cell = ownerCell(connection, principals);
  return (
    <span
      title={ownerSummary(connection, principals)}
      className={cn(
        "block truncate",
        cell.tone === "muted" && "text-muted-foreground",
        cell.tone === "danger" && "font-semibold text-signal-danger-foreground",
      )}
    >
      {cell.text}
      {cell.suffix && <small className="ml-xs text-[11px] text-muted-foreground">{cell.suffix}</small>}
    </span>
  );
}

function formatDate(value: string | undefined, withTime = false): string {
  if (!value) return "Not reported";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not reported";
  return withTime
    ? date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

const ENCRYPTION_LABEL: Record<string, string> = {
  Encrypted: "Encrypted",
  NotEncrypted: "Not encrypted",
  Any: "Encrypted when the source supports it",
};

function SectionTitle({ children, tail }: { children: string; tail?: string }) {
  return (
    <h3 className="mb-[7px] mt-[14px] flex items-center gap-[6px] text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
      {tail && <span className="ml-auto font-medium normal-case tracking-normal">{tail}</span>}
    </h3>
  );
}

const ROLE_ORDER = ["Owner", "PendingOwner", "UserWithReshare", "User"];
const ROLE_TONE: Record<string, BadgeTone> = { Owner: "success", PendingOwner: "warning" };

function PrincipalIcon({ type }: { type: string }) {
  const Icon = type === "User" ? UserRound : type === "Group" ? Users : AppWindow;
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <Icon className="size-[14px]" aria-hidden="true" />
    </span>
  );
}

/** Usages without a workspace come from the active workspace's loaded data. */
function inWorkspace(usage: ConnectionUsage, workspaceId: string): boolean {
  return (usage.workspaceId ?? workspaceId).toLowerCase() === workspaceId.toLowerCase();
}

function handoverCheck(usages: readonly ConnectionUsage[]): string {
  if (!usages.length) {
    return "Check the items that use this connection after the change. Atlas sees shortcuts and mirroring only.";
  }
  const shortcuts = usages.every((usage) => usage.relation.endsWith("shortcut"));
  const mirroring = usages.every((usage) => usage.relation.startsWith("mirroring"));
  const noun = shortcuts
    ? `shortcut${usages.length === 1 ? "" : "s"}`
    : mirroring
      ? `mirrored database${usages.length === 1 ? "" : "s"}`
      : `item${usages.length === 1 ? "" : "s"}`;
  return `Check the ${usages.length} ${noun} above after the change.`;
}

export function ConnectionDetail({
  connection,
  flags,
  usages,
  usagesLoading,
  draft,
  now,
  onNavigate,
}: {
  connection: FabricConnectionRecord;
  flags: ConnectionFlag[];
  usages: ConnectionUsage[];
  usagesLoading?: boolean;
  draft: PolicyDraft;
  now: number;
  onNavigate?: (navigation: AtlasNavigation) => void;
}) {
  const { data } = useAtlas();
  const principals = useConnectionDirectory();
  const [copied, setCopied] = useState<"ok" | "failed">();
  const badges = useMemo(() => {
    const readiness = evaluateReadiness(connection, draft);
    const flagBadges = connectionBadges(connection, flags, { status: "pass", reasons: [] }, now);
    return [...flagBadges, ...readinessBadges(readiness)];
  }, [connection, draft, flags, now]);
  const roles = useMemo(
    () => [...connection.roles].sort((left, right) =>
      (ROLE_ORDER.indexOf(left.role) + 1 || 99) - (ROLE_ORDER.indexOf(right.role) + 1 || 99)
      || principalLabel(left, principals).localeCompare(principalLabel(right, principals))),
    [connection.roles, principals],
  );
  const activeWorkspace = data.workspace.fabricId;
  const rows = useMemo(
    () => [...usages].sort((left, right) =>
      Number(inWorkspace(right, activeWorkspace)) - Number(inWorkspace(left, activeWorkspace))
      || (left.workspaceName ?? "").localeCompare(right.workspaceName ?? "")
      || (left.itemName ?? left.itemId).localeCompare(right.itemName ?? right.itemId)),
    [activeWorkspace, usages],
  );
  const lineageIndex = useMemo(() => createLineageIndex(data.edges), [data.edges]);
  const downstream = useMemo(() => {
    const consumers = [...new Set(rows.filter((usage) => inWorkspace(usage, activeWorkspace)).map((usage) => usage.itemId))];
    const ids = new Set<string>();
    for (const id of consumers) for (const next of getLineageImpact(lineageIndex, id).downstream.ids) ids.add(next);
    for (const id of consumers) ids.delete(id);
    return { count: ids.size, focus: consumers[0] };
  }, [activeWorkspace, lineageIndex, rows]);
  // Fabric reports an encryption setting for every connection, but it only applies through a gateway.
  const encryption = connection.connectionEncryption && isGatewayConnection(connection)
    ? (ENCRYPTION_LABEL[connection.connectionEncryption] ?? connection.connectionEncryption)
    : undefined;
  const details: Array<[string, ReactNode]> = [
    ["Authentication", authenticationDetail(connection)],
    ["Privacy level", connection.privacyLevel ?? "Not reported"],
    ...(encryption ? [["Encryption", encryption] as [string, ReactNode]] : []),
    ["Created", formatDate(connection.createdAt)],
    ["Last bound to an item", formatDate(connection.lastBoundAt)],
    ["Credentials last used", formatDate(connection.lastCredentialUsedAt, true)],
    ["Connection ID", <span key="id" className="break-all font-monospace text-[11px]">{connection.id}</span>],
  ];

  const copyRequest = async () => {
    try {
      await navigator.clipboard.writeText(ownerAssignmentRequest(connection.id));
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <Card className="min-w-0 overflow-hidden p-l">
      <section aria-label={`Connection ${connection.displayName}`}>
        <div className="flex items-start gap-[10px]">
          <ConnectionGlyph connectorType={connection.connectorType} large />
          <div className="min-w-0">
            <h2 className="break-words text-[15px] font-semibold leading-[20px]">{connection.displayName}</h2>
            <p className="text-200 text-muted-foreground">
              {connection.connectorType ?? "Unknown connector"} · {connectivityDetail(connection.connectivityType)}
            </p>
          </div>
        </div>
        <div className="mt-[10px] flex flex-wrap gap-[6px]">
          {badges.map((badge) => <Badge key={badge.id} tone={badge.tone}>{badge.label}</Badge>)}
        </div>

        <SectionTitle>Endpoint</SectionTitle>
        <div className="break-all rounded-md border border-border bg-secondary px-[10px] py-[7px] font-monospace text-200">
          {connection.path ?? "Not reported"}
        </div>

        <SectionTitle>Connection</SectionTitle>
        <dl className="m-0 grid grid-cols-[minmax(0,142px)_minmax(0,1fr)] gap-x-[10px] gap-y-[5px] text-200">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="m-0 min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>

        <SectionTitle tail="admin API">Role assignments</SectionTitle>
        {connection.rolesStatus === "personal" ? (
          <p className="text-200 text-muted-foreground">Personal connection: only its creator can use it.</p>
        ) : connection.rolesStatus !== "complete" ? (
          <p className="text-200 text-muted-foreground">
            Not collected in the last synchronization ({connection.rolesStatus === "failed" ? "lookup failed" : "lookup skipped"}).
          </p>
        ) : roles.length === 0 ? (
          <p className="text-200 text-muted-foreground">No role assignment returned.</p>
        ) : (
          <ul>
            {roles.map((role) => (
              <li
                key={`${role.principalId}:${role.role}`}
                className="flex items-center gap-s border-b border-dashed border-border py-[5px] text-200 last:border-b-0"
              >
                <PrincipalIcon type={role.principalType} />
                <span className="min-w-0 flex-1 truncate" title={role.principalId}>
                  <span className="font-semibold">{principalLabel(role, principals)}</span>
                  <span className="text-muted-foreground"> · {principalTypeLabel(role.principalType)}</span>
                </span>
                <Badge tone={ROLE_TONE[role.role] ?? "muted"}>{roleLabel(role.role)}</Badge>
              </li>
            ))}
          </ul>
        )}

        <SectionTitle tail={usages.length ? usageSourceLabel(usages) : undefined}>Used by synchronized items</SectionTitle>
        {rows.length === 0 ? (
          <p className="text-200 text-muted-foreground">
            {usagesLoading
              ? "Reading the other synchronized workspaces…"
              : "No synchronized item uses it, as far as shortcut and mirroring evidence shows."}
          </p>
        ) : (
          <ul>
            {rows.map((usage) => {
              const local = inWorkspace(usage, activeWorkspace);
              const name = usage.itemName ?? usage.itemId;
              return (
                <li
                  key={`${usage.workspaceId ?? ""}:${usage.itemId}:${usage.relation}:${usage.location ?? ""}`}
                  className="flex items-center gap-s border-b border-dashed border-border py-[5px] text-200 last:border-b-0"
                >
                  <span
                    title={typeMeta(usage.itemType).label}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-brand-foreground"
                  >
                    <Database className="size-[14px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {local && onNavigate && usage.itemName ? (
                      <button
                        type="button"
                        className="font-semibold hover:underline"
                        onClick={() => onNavigate({ tab: "catalog", focus: { requestId: crypto.randomUUID(), itemId: usage.itemId } })}
                      >
                        {name}
                      </button>
                    ) : (
                      <span className="font-semibold">{name}</span>
                    )}
                    <span className="text-muted-foreground"> · {usage.workspaceName ?? data.workspace.displayName}</span>
                  </span>
                  {usage.location && (
                    <span className="max-w-[45%] truncate font-monospace text-[11px] text-muted-foreground" title={usage.location}>
                      {usage.location}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {downstream.count > 0 && downstream.focus && onNavigate && (
          <button
            type="button"
            className="mt-[6px] inline-flex items-center gap-xs text-200 font-semibold text-brand-foreground hover:underline"
            onClick={() => onNavigate({ tab: "map", focus: { requestId: crypto.randomUUID(), itemId: downstream.focus } })}
          >
            <Waypoints className="size-[14px]" aria-hidden="true" />
            {downstream.count} downstream item{downstream.count === 1 ? "" : "s"} in Map &amp; lineage
          </button>
        )}

        <SectionTitle>Before a handover</SectionTitle>
        <ol className="m-0 list-decimal pl-[18px] text-200 leading-[18px]">
          <li className="mb-[2px]">Add a second owner, ideally a group or a service principal.</li>
          <li className="mb-[2px]">The new owner re-enters the credentials. The Owner role does not move them.</li>
          <li>{handoverCheck(usages)}</li>
        </ol>
        <div className="mt-[10px] flex flex-wrap items-center gap-s">
          <button type="button" className={SMALL_BUTTON} onClick={() => void copyRequest()}>
            <Copy className="size-[14px]" aria-hidden="true" />
            Copy admin API request
          </button>
          <a href={MANAGE_CONNECTIONS_URL} target="_blank" rel="noreferrer" className={SMALL_BUTTON}>
            <ExternalLink className="size-[14px]" aria-hidden="true" />
            Manage connections
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
        {copied && (
          <p role="status" className="mt-xs text-200 text-muted-foreground">
            {copied === "ok"
              ? "Request copied. Atlas never sends it: run it yourself as a Fabric administrator."
              : "The clipboard is not available in this browser."}
          </p>
        )}
      </section>
    </Card>
  );
}

const TH = "whitespace-nowrap border-b border-border bg-secondary px-[10px] py-s text-left text-200 font-semibold text-muted-foreground";
const TD = "overflow-hidden border-b border-border px-[10px] py-s align-middle";

export function ConnectionNameCell({
  connection,
  onSelect,
  current,
}: {
  connection: FabricConnectionRecord;
  onSelect: (id: string) => void;
  current?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-[9px]">
      <ConnectionGlyph connectorType={connection.connectorType} />
      <div className="min-w-0">
        <button
          type="button"
          aria-current={current ? "true" : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(connection.id);
          }}
          className="block max-w-full truncate text-left text-[12.5px] font-semibold hover:underline"
        >
          {connection.displayName}
        </button>
        <div className="truncate text-[11px] text-muted-foreground">
          {connection.connectorType ?? "Unknown connector"} · {connectivityLabel(connection.connectivityType)}
        </div>
      </div>
    </div>
  );
}

function ConnectionRows({
  connections,
  usages,
  onSelect,
  extra,
}: {
  connections: FabricConnectionRecord[];
  usages: ReadonlyMap<string, ConnectionUsage[]>;
  onSelect: (id: string) => void;
  extra?: (connection: FabricConnectionRecord) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-[12.5px]">
        <colgroup>
          <col style={{ width: extra ? "30%" : "38%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: extra ? "18%" : "28%" }} />
          <col style={{ width: extra ? "10%" : "18%" }} />
          {extra && <col style={{ width: "26%" }} />}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH}>Connection</th>
            <th scope="col" className={TH}>Authentication</th>
            <th scope="col" className={TH}>Owners</th>
            <th scope="col" className={TH}>Used by</th>
            {extra && <th scope="col" className={TH}>Why</th>}
          </tr>
        </thead>
        <tbody>
          {connections.map((connection) => {
            const used = usages.get(connection.id)?.length ?? 0;
            return (
              <tr key={connection.id} className="[&:last-child>td]:border-b-0">
                <td className={TD}><ConnectionNameCell connection={connection} onSelect={onSelect} /></td>
                <td className={cn(TD, "truncate")}>{authenticationLabel(connection)}</td>
                <td className={TD}><OwnerCellView connection={connection} /></td>
                <td className={cn(TD, used ? "font-numeric" : "text-muted-foreground")}>{usedByLabel(used)}</td>
                {extra && <td className={cn(TD, "whitespace-normal text-200 text-muted-foreground")}>{extra(connection)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const OWNERSHIP_TEXT: Partial<Record<ConnectionFlag, string>> = {
  "no-owner": "Nobody can update the credentials.",
  "pending-owner": "The new owner has not re-entered the credentials, so ownership is not effective yet.",
  "single-owner": "One person leaving blocks every credential update.",
  "user-owners-only": "Several owners, but all individual users: prefer a group or a service principal.",
  "owners-unknown": "Role assignments were not collected: lookup skipped or failed.",
};

function GroupHeader({ title, count, text }: { title: string; count: number; text?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-s border-b border-border px-l py-m">
      <h2 className="text-400 font-semibold">{title}</h2>
      <span className="rounded-full bg-muted px-[6px] text-[11px] font-semibold text-muted-foreground">{count}</span>
      {text && <p className="w-full text-200 text-muted-foreground">{text}</p>}
    </div>
  );
}

export function OwnershipTab({
  connections,
  flagsById,
  usages,
  onSelect,
}: {
  connections: FabricConnectionRecord[];
  flagsById: ReadonlyMap<string, ConnectionFlag[]>;
  usages: ReadonlyMap<string, ConnectionUsage[]>;
  onSelect: (id: string) => void;
}) {
  const groups = OWNERSHIP_FLAGS.map((flag) => ({
    flag,
    connections: connections.filter((connection) => (flagsById.get(connection.id) ?? []).includes(flag)),
  })).filter((group) => group.connections.length > 0);
  if (!groups.length) {
    return (
      <Card className="px-xl py-xxxl text-center text-300 text-muted-foreground">
        No ownership risk in this scope: every shared connection has at least two owners.
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-l">
      {groups.map((group) => (
        <Card key={group.flag} className="overflow-hidden">
          <GroupHeader title={CONNECTION_FLAG_LABEL[group.flag]} count={group.connections.length} text={OWNERSHIP_TEXT[group.flag]} />
          <ConnectionRows connections={group.connections} usages={usages} onSelect={onSelect} />
        </Card>
      ))}
    </div>
  );
}

const READINESS_LABEL: Record<ReadinessStatus, string> = {
  fail: "Fail the draft",
  check: "To check",
  pass: "Pass the draft",
  "not-applicable": "Gateways, not evaluated",
};

export function ReadinessTab({
  connections,
  draft,
  onDraftChange,
  usages,
  onSelect,
}: {
  connections: FabricConnectionRecord[];
  draft: PolicyDraft;
  onDraftChange: (draft: PolicyDraft) => void;
  usages: ReadonlyMap<string, ConnectionUsage[]>;
  onSelect: (id: string) => void;
}) {
  const { savedViews, savedViewsLoading, savedViewsError, addSavedView, removeSavedView } = useAtlas();
  const [kindToBlock, setKindToBlock] = useState("");
  const results = useMemo(
    () => connections.map((connection) => ({ connection, result: evaluateReadiness(connection, draft) })),
    [connections, draft],
  );
  const counts = results.reduce<Record<ReadinessStatus, number>>(
    (total, entry) => ({ ...total, [entry.result.status]: total[entry.result.status] + 1 }),
    { fail: 0, check: 0, pass: 0, "not-applicable": 0 },
  );
  const failing = results.filter((entry) => entry.result.status === "fail" || entry.result.status === "check");
  const kinds = [...new Set(connections.map((connection) => connection.connectorType).filter((kind): kind is string => !!kind))]
    .filter((kind) => !draft.blockedKinds.some((entry) => entry.kind === kind))
    .sort((left, right) => left.localeCompare(right));

  const toggleMethod = (id: string) =>
    onDraftChange({
      ...draft,
      methods: draft.methods.includes(id) ? draft.methods.filter((method) => method !== id) : [...draft.methods, id],
    });

  return (
    <div className="grid items-start gap-l lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="p-l">
        <div className="flex flex-wrap items-center justify-between gap-s">
          <h2 className="text-400 font-semibold">Draft policy</h2>
          <SavedViewsMenu
            views={savedViews.filter((view) => view.section === "connections")}
            loading={savedViewsLoading}
            error={savedViewsError}
            activeSection="connections"
            currentFilters={{ section: "readiness", methods: draft.methods, blockedKinds: JSON.stringify(draft.blockedKinds) }}
            onCreate={addSavedView}
            onApply={(view) => {
              let blockedKinds: unknown = [];
              try {
                blockedKinds = typeof view.filters.blockedKinds === "string" ? JSON.parse(view.filters.blockedKinds) : [];
              } catch {
                blockedKinds = [];
              }
              onDraftChange(normalizePolicyDraft({ methods: view.filters.methods, blockedKinds }));
            }}
            onDelete={removeSavedView}
          />
        </div>
        <p className="mt-xs text-200 text-muted-foreground">
          A draft, not the tenant's policy: no API reads the data connection policies.
        </p>

        <fieldset className="mt-m">
          <legend className="text-200 font-semibold">Authentication allowlist</legend>
          <div className="mt-s grid gap-xs">
            {AUTHENTICATION_METHODS.map((method) => (
              <label key={method.id} className="flex items-center gap-s text-300">
                <input type="checkbox" checked={draft.methods.includes(method.id)} onChange={() => toggleMethod(method.id)} />
                {method.label}
              </label>
            ))}
          </div>
          {!draft.methods.length && (
            <p className="mt-xs text-200 text-muted-foreground">Nothing selected: the allowlist is not evaluated.</p>
          )}
        </fieldset>

        <fieldset className="mt-l">
          <legend className="text-200 font-semibold">Blocked connection kinds</legend>
          <div className="mt-s flex gap-s">
            <select
              aria-label="Connection kind to block"
              value={kindToBlock}
              onChange={(event) => setKindToBlock(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-m text-300"
            >
              <option value="">Choose a connector</option>
              {kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={!kindToBlock}
              onClick={() => {
                onDraftChange({ ...draft, blockedKinds: [...draft.blockedKinds, { kind: kindToBlock, allowedEndpoints: [] }] });
                setKindToBlock("");
              }}
            >
              Block
            </button>
          </div>
          <ul className="mt-s flex flex-col gap-s">
            {draft.blockedKinds.map((entry) => (
              <li key={entry.kind} className="rounded-md border border-border p-s">
                <div className="flex items-center justify-between gap-s text-300 font-semibold">
                  {entry.kind}
                  <button
                    type="button"
                    className="text-200 font-semibold text-brand-foreground hover:underline"
                    onClick={() => onDraftChange({ ...draft, blockedKinds: draft.blockedKinds.filter((other) => other.kind !== entry.kind) })}
                  >
                    Remove
                  </button>
                </div>
                <label className="mt-xs block text-200 text-muted-foreground">
                  Allowed endpoints (comma separated prefixes)
                  <input
                    value={entry.allowedEndpoints.join(", ")}
                    onChange={(event) =>
                      onDraftChange({
                        ...draft,
                        blockedKinds: draft.blockedKinds.map((other) =>
                          other.kind === entry.kind
                            ? { ...other, allowedEndpoints: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) }
                            : other),
                      })}
                    className="mt-xs h-9 w-full rounded-md border border-input bg-card px-m font-monospace text-200 text-foreground"
                  />
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <button type="button" className={cn(SECONDARY_BUTTON, "mt-l")} onClick={() => onDraftChange(DEFAULT_POLICY_DRAFT)}>
          Reset to the default draft
        </button>
      </Card>

      <div className="flex min-w-0 flex-col gap-l">
        <section aria-label="Readiness summary" className="grid gap-l sm:grid-cols-4">
          {(["fail", "check", "pass", "not-applicable"] as const).map((status) => (
            <Card key={status} className="px-l py-[13px]">
              <div className="text-200 text-muted-foreground">{READINESS_LABEL[status]}</div>
              <div
                className={cn(
                  "mt-xs font-numeric text-[28px] font-semibold leading-[34px] tabular-nums",
                  status === "fail" && counts.fail > 0 && "text-signal-danger-foreground",
                )}
              >
                {counts[status]}
              </div>
            </Card>
          ))}
        </section>
        <Note>
          Policies apply to cloud connections only. The Entra tenant allowlist cannot be simulated: the API does not
          return the tenant behind a credential. Enforcement affects existing connections too and can take up to one hour.
        </Note>
        <Card className="overflow-hidden">
          <div className="flex items-center gap-s border-b border-border px-l py-m">
            <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-400 font-semibold">Would fail or need a check</h2>
          </div>
          {failing.length === 0 ? (
            <p className="px-l py-xl text-300 text-muted-foreground">Every cloud connection in this scope passes the draft.</p>
          ) : (
            <ConnectionRows
              connections={failing.map((entry) => entry.connection)}
              usages={usages}
              onSelect={onSelect}
              extra={(connection) => evaluateReadiness(connection, draft).reasons.join(" ")}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

const CHANGE_LABEL: Record<ConnectionChangeKind, string> = {
  added: "New connections",
  removed: "Removed connections",
  owners: "Owner changes",
  authentication: "Authentication changes",
  endpoint: "Endpoint changes",
  renamed: "Renamed connections",
};

export function ChangesTab({
  changes,
  previousCollectedAt,
  previousAvailable,
  error,
  loading,
  onSelect,
}: {
  changes: readonly ConnectionChange[];
  previousCollectedAt?: string;
  previousAvailable: boolean;
  error?: string;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  if (!previousAvailable) {
    return (
      <Card className="flex flex-col items-center px-xl py-xxxl text-center">
        <GitCompareArrows className="icon-size-500 text-muted-foreground" aria-hidden="true" />
        <p className="mt-m text-300 text-muted-foreground">Changes appear after the second synchronization that collects connections.</p>
      </Card>
    );
  }
  if (error && !previousCollectedAt) {
    return (
      <div role="status">
        <Note tone="warning">The previous inventory could not be read: {error}</Note>
      </div>
    );
  }
  if (loading || !previousCollectedAt) {
    return <Card className="p-xl text-300 text-muted-foreground"><div role="status">Loading the previous inventory…</div></Card>;
  }
  const grouped = (Object.keys(CHANGE_LABEL) as ConnectionChangeKind[])
    .map((kind) => ({ kind, entries: changes.filter((change) => change.kind === kind) }))
    .filter((group) => group.entries.length);
  return (
    <div className="flex flex-col gap-l">
      <p className="text-200 text-muted-foreground">
        Compared with the inventory of {formatDate(previousCollectedAt, true)}.
      </p>
      {grouped.length === 0 ? (
        <Card className="px-xl py-xxxl text-center text-300 text-muted-foreground">No change between the two inventories.</Card>
      ) : (
        grouped.map((group) => (
          <Card key={group.kind} className="overflow-hidden">
            <GroupHeader title={CHANGE_LABEL[group.kind]} count={group.entries.length} />
            <ul>
              {group.entries.map((change) => (
                <li
                  key={`${change.kind}:${change.connectionId}`}
                  className="border-b border-border px-l py-s text-300 last:border-b-0"
                >
                  {change.kind === "removed" ? (
                    <span className="font-semibold">{change.displayName}</span>
                  ) : (
                    <button type="button" className="font-semibold hover:underline" onClick={() => onSelect(change.connectionId)}>
                      {change.displayName}
                    </button>
                  )}
                  <span className="block break-words text-200 text-muted-foreground">{change.detail}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
