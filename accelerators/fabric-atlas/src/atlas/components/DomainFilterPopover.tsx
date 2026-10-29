import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Layers3 } from "lucide-react";
import { useMemo, useState } from "react";
import { useDomainFilter } from "../domain-filter";
import { NO_DOMAIN_KEY, UNKNOWN_DOMAIN_KEY, workspaceDomainGroups, type WorkspaceDomainGroup } from "../domain-governance";
import { useAtlas } from "../store";
import type { GovernanceEvidence } from "../governance-evidence";
import { cn } from "../ui";

interface DomainOption {
  key: string;
  label: string;
  count: number;
  depth: 0 | 1;
  muted?: boolean;
}

/** Fabric domains as a tree (parent then sub-domains), followed by unnamed, unassigned and not-collected buckets. */
export function domainFilterOptions(
  groups: readonly WorkspaceDomainGroup[],
  evidence: GovernanceEvidence | undefined,
): DomainOption[] {
  const counts = new Map(groups.map((group) => [group.key, group.workspaceIds.length]));
  const entries = evidence?.domains.entries ?? [];
  const known = new Map(entries.map((domain) => [domain.id.toLowerCase(), domain]));
  const byName = (a: { displayName: string }, b: { displayName: string }) => a.displayName.localeCompare(b.displayName);
  const childrenOf = (key: string) => entries.filter((domain) => domain.parentDomainId?.toLowerCase() === key);
  const scopeCount = (key: string) =>
    (counts.get(key) ?? 0) + childrenOf(key).reduce((sum, child) => sum + (counts.get(child.id.toLowerCase()) ?? 0), 0);
  const roots = entries
    .filter((domain) => !domain.parentDomainId || !known.has(domain.parentDomainId.toLowerCase()))
    .sort((a, b) => Number(scopeCount(b.id.toLowerCase()) > 0) - Number(scopeCount(a.id.toLowerCase()) > 0) || byName(a, b));
  const options: DomainOption[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const key = root.id.toLowerCase();
    seen.add(key);
    options.push({ key, label: root.displayName, count: scopeCount(key), depth: 0 });
    for (const child of childrenOf(key).sort(byName)) {
      const childKey = child.id.toLowerCase();
      seen.add(childKey);
      options.push({ key: childKey, label: child.displayName, count: counts.get(childKey) ?? 0, depth: 1 });
    }
  }
  for (const group of groups) {
    if (seen.has(group.key) || group.key === NO_DOMAIN_KEY || group.key === UNKNOWN_DOMAIN_KEY) continue;
    options.push({ key: group.key, label: group.label, count: group.workspaceIds.length, depth: 0 });
  }
  for (const key of [NO_DOMAIN_KEY, UNKNOWN_DOMAIN_KEY]) {
    const group = groups.find((candidate) => candidate.key === key);
    if (group) options.push({ key, label: group.label, count: group.workspaceIds.length, depth: 0, muted: true });
  }
  return options;
}

export function DomainFilterPopover({
  groups,
  evidence,
  value,
  onChange,
  compact,
}: {
  groups: readonly WorkspaceDomainGroup[];
  evidence: GovernanceEvidence | undefined;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => domainFilterOptions(groups, evidence), [evidence, groups]);
  const total = groups.reduce((sum, group) => sum + group.workspaceIds.length, 0);
  const active = options.find((option) => option.key === value);
  const select = (key: string) => {
    onChange(key);
    setOpen(false);
  };
  const row = (key: string, label: string, count: number, depth: 0 | 1, muted?: boolean) => {
    const selected = (active?.key ?? "") === key;
    const disabled = key !== "" && count === 0;
    return (
      <li key={key || "all"}>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={selected}
          disabled={disabled}
          title={disabled ? "No workspace of this domain is in the Atlas scope" : undefined}
          onClick={() => select(key)}
          className={cn(
            "flex w-full items-center gap-s rounded-md px-s py-xs text-left text-300 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
            selected && "bg-primary/10 font-semibold text-brand-foreground",
            depth === 1 && "pl-xl",
          )}
        >
          <span className="w-m shrink-0">{selected && <Check className="icon-size-100" aria-hidden="true" />}</span>
          {depth === 1 && <span aria-hidden="true" className="text-muted-foreground">↳</span>}
          <span className={cn("min-w-0 flex-1 truncate", muted && "text-muted-foreground")} title={label}>{label}</span>
          <span className="shrink-0 font-numeric text-200 text-muted-foreground">{count} ws</span>
        </button>
      </li>
    );
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title="Filter the whole app by Fabric domain"
          className={cn(
            "flex max-w-[18rem] shrink-0 items-center gap-xs rounded-md border border-input bg-card text-[length:var(--text-300)] text-foreground hover:bg-accent",
            compact
              ? "mr-xs min-h-[var(--atlas-touch-target)] px-s md:min-h-[var(--atlas-control-height)]"
              : "min-h-[var(--atlas-touch-target)] px-m sm:min-h-[var(--atlas-control-height)]",
          )}
        >
          <Layers3 className="icon-size-100 shrink-0 text-brand-foreground" aria-hidden="true" />
          <span className="shrink-0 text-muted-foreground">Domain:</span>
          <span className="min-w-0 max-w-[11rem] truncate font-semibold" title={active?.label ?? "All"}>{active?.label ?? "All"}</span>
          <ChevronDown className="icon-size-100 shrink-0" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-fabric-8"
        >
          <div className="border-b border-border px-m py-s text-100 font-semibold uppercase tracking-wide text-muted-foreground">
            Fabric domains
          </div>
          <ul role="menu" aria-label="Fabric domains" className="max-h-[60vh] overflow-y-auto p-xs">
            {row("", "All domains", total, 0)}
            {options.map((option) => row(option.key, option.label, option.count, option.depth, option.muted))}
          </ul>
          <div className="border-t border-border px-m py-s text-100 text-muted-foreground">
            Source: Fabric Admin Domains API · collected in snapshot
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Standalone header domain filter for single-workspace scopes; hidden until a domain is known. */
export function DomainFilter({ className }: { className?: string }) {
  const { data, workspaceScopes, workspaceSyncStatuses } = useAtlas();
  const [value, setValue] = useDomainFilter();
  const groups = useMemo(
    () => workspaceDomainGroups(workspaceScopes, workspaceSyncStatuses, data),
    [data, workspaceScopes, workspaceSyncStatuses],
  );
  if (!groups.some((group) => group.key !== NO_DOMAIN_KEY && group.key !== UNKNOWN_DOMAIN_KEY)) return null;
  return (
    <span className={className}>
      <DomainFilterPopover groups={groups} evidence={data.governanceEvidence} value={value} onChange={setValue} compact />
    </span>
  );
}