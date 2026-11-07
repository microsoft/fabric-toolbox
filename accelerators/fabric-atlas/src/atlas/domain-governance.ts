import {
  buildGovernanceFindings,
  getCoverageDiagnostics,
  type GovernanceFinding,
  type GovernanceSeverity,
} from "./governance";
import {
  domainIndex,
  domainLabel,
  type DomainLabel,
  type GovernanceEvidence,
} from "./governance-evidence";
import { snapshotCatalogFromData } from "./history";
import type { AtlasData } from "./model";
import type { PersistedWorkspaceSyncStatus } from "./workspace-sync";
import {
  microsoftPillarForPosture,
  type MicrosoftGovernancePillar,
} from "./ms-pillars";
import { scorePosture, type PosturePillar } from "./posture";

/**
 * Compact, per-workspace governance summary persisted with each snapshot
 * (Workspace.governanceSummaryJson). It lets Governance aggregate posture and
 * trust coverage per Fabric domain without loading every workspace snapshot.
 */
export interface CoverageCount {
  numerator: number;
  /** Items whose signal was readable. */
  denominator: number;
  /** Items whose signal could not be read (excluded from the ratio). */
  unknown: number;
}

export interface GovernanceSummary {
  version: 1;
  items: number;
  findings: Record<GovernanceSeverity, number>;
  pillars: Record<MicrosoftGovernancePillar, number | null>;
  coverage: {
    endorsed: CoverageCount;
    certified: CoverageCount;
    described: CoverageCount;
    labeled: CoverageCount;
    /** Items with at least one Fabric tag. */
    tagged: CoverageCount;
  };
  /** Short hashes of critical finding ids, used to detect new critical findings between syncs. */
  critical?: string[];
}

export const CRITICAL_KEYS_LIMIT = 100;

/** FNV-1a hash (8 hex chars) of a finding id: compact enough for the 4000-char summary column. */
export function criticalFindingKey(findingId: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < findingId.length; index += 1) {
    hash ^= findingId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const NO_DOMAIN_KEY = "unassigned";
export const UNKNOWN_DOMAIN_KEY = "unknown";
const SEVERITIES: GovernanceSeverity[] = ["critical", "high", "medium", "low"];
const PILLARS: MicrosoftGovernancePillar[] = ["health", "protect", "trust"];
type CoverageKey = keyof GovernanceSummary["coverage"];
const COVERAGE_KEYS: CoverageKey[] = ["endorsed", "certified", "described", "labeled", "tagged"];

function count(numerator: number, denominator: number, total: number): CoverageCount {
  return { numerator, denominator, unknown: Math.max(0, total - denominator) };
}

export function summarizeGovernance(
  data: AtlasData,
  targets?: Partial<Record<PosturePillar, number>>,
): GovernanceSummary {
  const findings = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<GovernanceSeverity, number>;
  const critical = new Set<string>();
  for (const finding of buildGovernanceFindings(data)) {
    findings[finding.severity] += 1;
    if (finding.severity === "critical") critical.add(criticalFindingKey(finding.id));
  }
  const posture = scorePosture(snapshotCatalogFromData(data), targets);
  const pillars = {} as Record<MicrosoftGovernancePillar, number | null>;
  for (const pillar of PILLARS) {
    const scores = posture.pillars
      .filter((entry) => microsoftPillarForPosture(entry.pillar) === pillar && entry.score != null)
      .map((entry) => entry.score as number);
    pillars[pillar] = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  }
  const coverage = getCoverageDiagnostics(data).byId;
  const total = data.items.length;
  const endorsementReadable = coverage.endorsement.denominator;
  const certified = endorsementReadable
    ? data.items.filter(
        (item) => item.endorsement === "certified" && item.endorsementMetadataAvailable !== false,
      ).length
    : 0;
  return {
    version: 1,
    items: total,
    findings,
    pillars,
    coverage: {
      endorsed: count(coverage.endorsement.numerator, endorsementReadable, total),
      certified: count(Math.min(certified, endorsementReadable), endorsementReadable, total),
      described: count(coverage.descriptions.numerator, coverage.descriptions.denominator, total),
      labeled: count(coverage.sensitivity.numerator, coverage.sensitivity.denominator, total),
      tagged: count(data.items.filter((item) => item.tags.length > 0).length, total, total),
    },
    ...(critical.size ? { critical: [...critical].sort().slice(0, CRITICAL_KEYS_LIMIT) } : {}),
  };
}

function nonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Strict parse of a persisted summary; anything unexpected yields undefined. */
export function parseGovernanceSummary(value: unknown): GovernanceSummary | undefined {
  let parsed = value;
  if (typeof value === "string") {
    if (!value.trim()) return undefined;
    try {
      parsed = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const raw = parsed as Record<string, unknown>;
  if (raw.version !== 1) return undefined;
  const items = nonNegative(raw.items);
  const rawFindings = raw.findings as Record<string, unknown> | undefined;
  const rawPillars = raw.pillars as Record<string, unknown> | undefined;
  const rawCoverage = raw.coverage as Record<string, Record<string, unknown>> | undefined;
  if (items == null || !rawFindings || !rawPillars || !rawCoverage) return undefined;
  const findings = {} as Record<GovernanceSeverity, number>;
  for (const severity of SEVERITIES) {
    const value = nonNegative(rawFindings[severity]);
    if (value == null) return undefined;
    findings[severity] = value;
  }
  const pillars = {} as Record<MicrosoftGovernancePillar, number | null>;
  for (const pillar of PILLARS) {
    const value = rawPillars[pillar];
    if (value === null) pillars[pillar] = null;
    else if (typeof value === "number" && value >= 0 && value <= 100) pillars[pillar] = value;
    else return undefined;
  }
  const coverage = {} as GovernanceSummary["coverage"];
  for (const key of COVERAGE_KEYS) {
    // Summaries persisted before tag coverage existed: every item's tags are unknown.
    const entry = key === "tagged" && rawCoverage[key] == null ? { numerator: 0, denominator: 0, unknown: items } : rawCoverage[key];
    const numerator = nonNegative(entry?.numerator);
    const denominator = nonNegative(entry?.denominator);
    const unknown = nonNegative(entry?.unknown);
    if (numerator == null || denominator == null || unknown == null || numerator > denominator) return undefined;
    coverage[key] = { numerator, denominator, unknown };
  }
  const critical = Array.isArray(raw.critical)
    ? raw.critical.filter((key): key is string => typeof key === "string" && /^[0-9a-f]{8}$/.test(key)).slice(0, CRITICAL_KEYS_LIMIT)
    : undefined;
  return { version: 1, items, findings, pillars, coverage, ...(critical ? { critical } : {}) };
}

export interface WorkspaceGovernanceInput {
  workspaceId: string;
  displayName?: string;
  /** Fabric domain id, "unassigned", or undefined when not collected. */
  domainId?: string;
  summary?: GovernanceSummary;
}

export interface DomainGovernanceRow {
  key: string;
  domain: DomainLabel;
  parentDomainId?: string;
  workspaces: string[];
  /** Workspaces in this domain whose summary is not available yet. */
  workspacesWithoutSummary: number;
  items: number;
  findings: Record<GovernanceSeverity, number>;
  /** Item-weighted average of workspace pillar scores; null when unknown. */
  pillars: Record<MicrosoftGovernancePillar, number | null>;
  coverage: GovernanceSummary["coverage"];
  /** Domain exists in Fabric (complete domains section) but no synchronized workspace belongs to it. */
  empty: boolean;
  /**
   * Why an empty row is empty: no workspace at all in Fabric, workspaces exist
   * but this deployment does not synchronize them, or the Fabric count is unknown.
   */
  emptyReason?: "empty-in-fabric" | "not-synchronized" | "unknown";
  /** Workspaces assigned to the domain tenant-wide (admin API), when known. */
  fabricWorkspaceCount?: number;
  defaultSensitivityLabelId?: string;
}

function emptyCoverage(): GovernanceSummary["coverage"] {
  return {
    endorsed: { numerator: 0, denominator: 0, unknown: 0 },
    certified: { numerator: 0, denominator: 0, unknown: 0 },
    described: { numerator: 0, denominator: 0, unknown: 0 },
    labeled: { numerator: 0, denominator: 0, unknown: 0 },
    tagged: { numerator: 0, denominator: 0, unknown: 0 },
  };
}

export function domainKey(domainId: string | undefined): string {
  if (!domainId) return UNKNOWN_DOMAIN_KEY;
  return domainId === NO_DOMAIN_KEY ? NO_DOMAIN_KEY : domainId.toLowerCase();
}

/**
 * Groups synchronized workspaces by Fabric domain. Totals reconcile with the
 * sum of workspace summaries; domains returned by a complete admin domains
 * section but without any synchronized workspace are listed as empty.
 */
export function aggregateByDomain(
  workspaces: readonly WorkspaceGovernanceInput[],
  evidence?: GovernanceEvidence,
): DomainGovernanceRow[] {
  const rows = new Map<string, DomainGovernanceRow & { weights: Record<MicrosoftGovernancePillar, { sum: number; items: number }> }>();
  const domains = domainIndex(evidence);
  const ensure = (key: string, domainId: string | undefined) => {
    let row = rows.get(key);
    if (!row) {
      const known = domains.get(key);
      row = {
        key,
        domain: domainLabel(evidence, domainId),
        ...(known?.parentDomainId ? { parentDomainId: known.parentDomainId } : {}),
        ...(known?.defaultSensitivityLabelId ? { defaultSensitivityLabelId: known.defaultSensitivityLabelId } : {}),
        ...(known?.workspaceCount != null ? { fabricWorkspaceCount: known.workspaceCount } : {}),
        workspaces: [],
        workspacesWithoutSummary: 0,
        items: 0,
        findings: { critical: 0, high: 0, medium: 0, low: 0 },
        pillars: { health: null, protect: null, trust: null },
        coverage: emptyCoverage(),
        empty: false,
        weights: { health: { sum: 0, items: 0 }, protect: { sum: 0, items: 0 }, trust: { sum: 0, items: 0 } },
      };
      rows.set(key, row);
    }
    return row;
  };
  for (const workspace of workspaces) {
    const key = domainKey(workspace.domainId);
    const row = ensure(key, workspace.domainId);
    row.workspaces.push(workspace.displayName || workspace.workspaceId);
    const summary = workspace.summary;
    if (!summary) {
      row.workspacesWithoutSummary += 1;
      continue;
    }
    row.items += summary.items;
    for (const severity of SEVERITIES) row.findings[severity] += summary.findings[severity];
    for (const pillar of PILLARS) {
      const score = summary.pillars[pillar];
      if (score == null) continue;
      const weight = Math.max(1, summary.items);
      row.weights[pillar].sum += score * weight;
      row.weights[pillar].items += weight;
    }
    for (const coverageKey of COVERAGE_KEYS) {
      row.coverage[coverageKey].numerator += summary.coverage[coverageKey].numerator;
      row.coverage[coverageKey].denominator += summary.coverage[coverageKey].denominator;
      row.coverage[coverageKey].unknown += summary.coverage[coverageKey].unknown;
    }
  }
  if (evidence?.domains.status.status === "complete") {
    for (const domain of evidence.domains.entries) {
      const key = domain.id.toLowerCase();
      if (rows.has(key)) continue;
      const row = ensure(key, domain.id);
      row.empty = true;
      row.emptyReason =
        domain.workspaceCount == null ? "unknown" : domain.workspaceCount === 0 ? "empty-in-fabric" : "not-synchronized";
    }
  }
  const order = (row: DomainGovernanceRow) =>
    row.key === NO_DOMAIN_KEY ? 2 : row.key === UNKNOWN_DOMAIN_KEY ? 3 : row.empty ? 1 : 0;
  return [...rows.values()]
    .map(({ weights, ...row }) => ({
      ...row,
      pillars: Object.fromEntries(
        PILLARS.map((pillar) => [
          pillar,
          weights[pillar].items ? Math.round(weights[pillar].sum / weights[pillar].items) : null,
        ]),
      ) as Record<MicrosoftGovernancePillar, number | null>,
    }))
    .sort((left, right) => order(left) - order(right) || left.domain.label.localeCompare(right.domain.label));
}

export function coverageRatio(value: CoverageCount): number | null {
  return value.denominator ? Math.round((value.numerator / value.denominator) * 100) : null;
}

/**
 * Inputs for the per-domain view: persisted summaries of every synchronized
 * workspace, with the active workspace replaced by its live summary.
 */
export function domainGovernanceInputs(
  statuses: Readonly<Record<string, PersistedWorkspaceSyncStatus>>,
  data: AtlasData,
  targets?: Partial<Record<PosturePillar, number>>,
): WorkspaceGovernanceInput[] {
  const activeId = data.workspace.fabricId.toLowerCase();
  const inputs: WorkspaceGovernanceInput[] = Object.entries(statuses)
    .filter(([workspaceId, status]) => workspaceId.toLowerCase() !== activeId && status.snapshotId)
    .map(([workspaceId, status]) => ({
      workspaceId,
      ...(status.displayName ? { displayName: status.displayName } : {}),
      ...(status.fabricDomainId ? { domainId: status.fabricDomainId } : {}),
      ...(status.governanceSummary ? { summary: status.governanceSummary } : {}),
    }));
  if (data.items.length || data.workspace.snapshotId) {
    inputs.push({
      workspaceId: data.workspace.fabricId,
      displayName: data.workspace.displayName,
      ...(data.workspace.fabricDomainId ? { domainId: data.workspace.fabricDomainId } : {}),
      summary: summarizeGovernance(data, targets),
    });
  }
  return inputs;
}

export interface WorkspaceDomainGroup {
  key: string;
  label: string;
  workspaceIds: string[];
}

/**
 * Groups the shared workspace scope by Fabric domain for the global domain
 * filter. Workspaces without a domain, or whose domain was never collected,
 * get their own explicit buckets so filtering never hides them.
 */
export function workspaceDomainGroups(
  scopes: readonly { id: string }[],
  statuses: Readonly<Record<string, PersistedWorkspaceSyncStatus>>,
  data: Pick<AtlasData, "workspace" | "governanceEvidence">,
): WorkspaceDomainGroup[] {
  const activeId = data.workspace.fabricId.toLowerCase();
  const groups = new Map<string, WorkspaceDomainGroup>();
  for (const scope of scopes) {
    const domainId =
      scope.id.toLowerCase() === activeId
        ? data.workspace.fabricDomainId
        : (statuses[scope.id] ?? statuses[scope.id.toLowerCase()])?.fabricDomainId;
    const key = domainKey(domainId);
    let group = groups.get(key);
    if (!group) {
      const label =
        key === NO_DOMAIN_KEY
          ? "Unassigned"
          : key === UNKNOWN_DOMAIN_KEY
            ? "Domain not collected"
            : domainLabel(data.governanceEvidence, domainId).label;
      group = { key, label, workspaceIds: [] };
      groups.set(key, group);
    }
    group.workspaceIds.push(scope.id);
  }
  const order = (key: string) => (key === NO_DOMAIN_KEY ? 1 : key === UNKNOWN_DOMAIN_KEY ? 2 : 0);
  return [...groups.values()].sort(
    (left, right) => order(left.key) - order(right.key) || left.label.localeCompare(right.label),
  );
}

/** Domain key a finding belongs to: its own domain for domain-level rules, else the workspace domain. */
export function findingDomainKey(finding: Pick<GovernanceFinding, "id">, workspaceDomainId: string | undefined): string {
  if (finding.id.startsWith("domain-empty:")) return domainKey(finding.id.slice("domain-empty:".length));
  return domainKey(workspaceDomainId);
}

/**
 * Display rows for "Posture by domain": each parent domain aggregates its
 * sub-domains (roll-up), and sub-domains are listed right under their parent.
 * Items and findings are summed; pillar scores are item-weighted. Use
 * `aggregateByDomain` for totals that reconcile without double counting.
 */
export interface DomainRollupRow extends DomainGovernanceRow {
  /** Number of sub-domains rolled into this row. */
  rolledUp: number;
  depth: 0 | 1;
}

/** A domain filter key plus the keys of its sub-domains, so selecting a parent domain includes its children. */
export function domainScopeKeys(
  key: string,
  evidence: { domains: { entries: readonly { id: string; parentDomainId?: string }[] } } | undefined,
): ReadonlySet<string> {
  const keys = new Set<string>(key ? [key] : []);
  for (const domain of evidence?.domains.entries ?? []) {
    if (key && domain.parentDomainId?.toLowerCase() === key) keys.add(domain.id.toLowerCase());
  }
  return keys;
}
export function withParentRollups(rows: readonly DomainGovernanceRow[]): DomainRollupRow[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const children = new Map<string, DomainGovernanceRow[]>();
  for (const row of rows) {
    const parent = row.parentDomainId?.toLowerCase();
    if (!parent || !byKey.has(parent)) continue;
    children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  const rollup = (row: DomainGovernanceRow): DomainRollupRow => {
    const kids = (children.get(row.key) ?? []).filter((child) => !child.empty);
    if (!kids.length) return { ...row, rolledUp: 0, depth: 0 };
    const all = [row, ...kids].filter((entry) => !entry.empty);
    const items = all.reduce((sum, entry) => sum + entry.items, 0);
    const findings = { critical: 0, high: 0, medium: 0, low: 0 } as Record<GovernanceSeverity, number>;
    for (const entry of all) for (const severity of SEVERITIES) findings[severity] += entry.findings[severity];
    const pillars = {} as Record<MicrosoftGovernancePillar, number | null>;
    for (const pillar of PILLARS) {
      let sum = 0;
      let weight = 0;
      for (const entry of all) {
        const score = entry.pillars[pillar];
        if (score == null) continue;
        sum += score * Math.max(1, entry.items);
        weight += Math.max(1, entry.items);
      }
      pillars[pillar] = weight ? Math.round(sum / weight) : null;
    }
    const coverage = emptyCoverage();
    for (const entry of all) {
      for (const key of COVERAGE_KEYS) {
        coverage[key].numerator += entry.coverage[key].numerator;
        coverage[key].denominator += entry.coverage[key].denominator;
        coverage[key].unknown += entry.coverage[key].unknown;
      }
    }
    return {
      ...row,
      workspaces: all.flatMap((entry) => entry.workspaces),
      workspacesWithoutSummary: all.reduce((sum, entry) => sum + entry.workspacesWithoutSummary, 0),
      items,
      findings,
      pillars,
      coverage,
      empty: false,
      rolledUp: kids.length,
      depth: 0,
    };
  };
  const blocks: DomainRollupRow[][] = [];
  for (const row of rows) {
    const parent = row.parentDomainId?.toLowerCase();
    if (parent && byKey.has(parent)) continue;
    blocks.push([rollup(row), ...(children.get(row.key) ?? []).map((child) => ({ ...child, rolledUp: 0, depth: 1 as const }))]);
  }
  // Rolled-up parents become non-empty, so re-rank: populated domains, empty domains, unassigned, unknown.
  const rank = (row: DomainRollupRow) =>
    row.key === NO_DOMAIN_KEY ? 2 : row.key === UNKNOWN_DOMAIN_KEY ? 3 : row.empty ? 1 : 0;
  return blocks
    .map((block, index) => ({ block, index }))
    .sort((left, right) => rank(left.block[0]!) - rank(right.block[0]!) || left.index - right.index)
    .flatMap(({ block }) => block);
}

/** Largest trust-coverage gap weighted by item count, as in the OneLake catalog "Curate first" hint. */
export function curateFirst(row: DomainGovernanceRow): { label: string; missing: number } | undefined {
  const candidates: [string, CoverageCount][] = [
    ["Descriptions", row.coverage.described],
    ["Tags", row.coverage.tagged],
    ["Endorsement", row.coverage.endorsed],
    ["Sensitivity labels", row.coverage.labeled],
  ];
  let best: { label: string; missing: number } | undefined;
  for (const [label, value] of candidates) {
    const missing = value.denominator - value.numerator;
    if (missing > 0 && (!best || missing > best.missing)) best = { label, missing };
  }
  return best;
}