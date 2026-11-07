import { findingDomainKey, NO_DOMAIN_KEY, UNKNOWN_DOMAIN_KEY } from "../domain-governance";
import { domainReference } from "../governance-evidence";
import { findingFixUrl } from "../fabric-portal";
import { findingRule } from "../finding-groups";
import {
  buildGovernanceFindings,
  type GovernanceFinding,
  type GovernanceSeverity,
} from "../governance";
import type { AtlasData } from "../model";
import { MICROSOFT_PILLAR_LABEL, microsoftPillarForFinding } from "../ms-pillars";
import { buildSnapshotManifest, snapshotPayload } from "../snapshot-export";
import type { AtlasMcpToolArguments } from "./arguments";
import {
  ATLAS_MCP_LIMITS,
  truncateText,
  type AtlasMcpCoverage,
  type AtlasMcpSource,
} from "./contract";

// Governance findings and snapshot export for MCP clients. Both reuse the UI
// helpers over the validated snapshot; neither writes to or calls Fabric.

// The MCP host runs outside Vite, so the portal base is passed explicitly.
const FABRIC_PORTAL = "https://app.fabric.microsoft.com";
const MAX_EVIDENCE_IDS = 10;

export interface GovernanceToolOutcome {
  result: object;
  sources: AtlasMcpSource[];
  coverage: AtlasMcpCoverage;
  limitations: string[];
}

const SEVERITY_RANK: Record<GovernanceSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function source(data: AtlasData, entities: string[]): AtlasMcpSource {
  return {
    id: "atlas-snapshot",
    label: "Validated Atlas snapshot",
    authority: "authoritative",
    entities,
    observedAt: data.workspace.syncedAt,
  };
}

function page(
  status: AtlasMcpCoverage["status"],
  returned: number,
  total: number,
  offset: number,
  notes: string[] = [],
): AtlasMcpCoverage {
  return { status, returned, total, truncated: offset + returned < total, notes };
}

function nextOffset(offset: number, returned: number, total: number): number | null {
  return offset + returned < total ? offset + returned : null;
}

type FindingOwnerStatus = "known" | "unknown" | "workspace";

function ownerStatus(
  finding: GovernanceFinding,
  owners: ReadonlyMap<string, boolean>,
): FindingOwnerStatus {
  if (!finding.itemId) return "workspace";
  return owners.get(finding.itemId) ? "known" : "unknown";
}

export function governanceFindings(
  data: AtlasData,
  args: AtlasMcpToolArguments["atlas_get_governance_findings"],
): GovernanceToolOutcome {
  const items = new Map(data.items.map((item) => [item.fabricId, item]));
  const owners = new Map(
    data.items.map((item) => [item.fabricId, !!item.ownerEmail?.trim()]),
  );
  const itemId = args.itemId?.toLowerCase();
  const all = buildGovernanceFindings(data);
  const matches = all
    .map((finding) => ({
      finding,
      rule: findingRule(finding),
      pillar: microsoftPillarForFinding(finding),
      domain: findingDomainKey(finding, data.workspace.fabricDomainId),
      owner: ownerStatus(finding, owners),
    }))
    .filter(
      (entry) =>
        (!args.severities.length || args.severities.includes(entry.finding.severity)) &&
        (!args.categories.length || args.categories.includes(entry.finding.category)) &&
        (!args.pillars.length || args.pillars.includes(entry.pillar)) &&
        (!args.domain || entry.domain === args.domain) &&
        (!args.rule || entry.rule === args.rule) &&
        (!itemId || entry.finding.itemId?.toLowerCase() === itemId) &&
        (args.owner === "any" || entry.owner === args.owner),
    )
    .sort(
      (left, right) =>
        SEVERITY_RANK[left.finding.severity] - SEVERITY_RANK[right.finding.severity] ||
        (left.finding.id < right.finding.id ? -1 : left.finding.id > right.finding.id ? 1 : 0),
    );
  const rows = matches.slice(args.offset, args.offset + args.limit);
  const domainInfo = (key: string) =>
    domainReference(
      data.governanceEvidence,
      key === NO_DOMAIN_KEY ? "unassigned" : key === UNKNOWN_DOMAIN_KEY ? undefined : key,
    );
  const unknownOwners = matches.filter((entry) => entry.owner === "unknown").length;
  return {
    result: {
      findings: rows.map(({ finding, rule, pillar, domain, owner }) => {
        const item = finding.itemId ? items.get(finding.itemId) : undefined;
        return {
          findingId: finding.id,
          rule,
          severity: finding.severity,
          category: finding.category,
          pillar,
          pillarLabel: MICROSOFT_PILLAR_LABEL[pillar],
          domain,
          domainName: domainInfo(domain).name,
          domainPath: domainInfo(domain).path,
          parentDomainName: domainInfo(domain).parentName,
          title: truncateText(finding.title) ?? "",
          detail: truncateText(finding.detail, ATLAS_MCP_LIMITS.findingText) ?? null,
          recommendation:
            truncateText(finding.recommendation, ATLAS_MCP_LIMITS.findingText) ?? null,
          evidenceIds: finding.evidenceIds.slice(0, MAX_EVIDENCE_IDS),
          target: finding.target?.kind ?? (finding.itemId ? "item" : "workspace"),
          item: item
            ? { itemId: item.fabricId, name: item.displayName, itemType: item.itemType }
            : finding.itemId
              ? { itemId: finding.itemId, name: null, itemType: null }
              : null,
          ownerStatus: owner,
          fixUrl: findingFixUrl(finding, data, FABRIC_PORTAL),
        };
      }),
      countsBySeverity: Object.fromEntries(
        (Object.keys(SEVERITY_RANK) as GovernanceSeverity[]).map((severity) => [
          severity,
          matches.filter((entry) => entry.finding.severity === severity).length,
        ]),
      ),
      totalFindings: all.length,
      offset: args.offset,
      nextOffset: nextOffset(args.offset, rows.length, matches.length),
    },
    sources: [
      source(data, ["FabricItem", "Principal", "AccessGrant", "JobRun", "LineageEdge", "GovernanceEvidence"]),
    ],
    coverage: page("complete", rows.length, matches.length, args.offset, [
      ...(unknownOwners
        ? [`${unknownOwners} matching item finding(s) have an owner Fabric did not expose (ownerStatus unknown).`]
        : []),
    ]),
    limitations: [
      "Findings are recomputed from the validated snapshot with the same rules as the Governance view; a missing signal is reported as Unknown, never as healthy.",
      "Owner emails are withheld; ownerStatus only tells whether Fabric exposed an owner.",
      "Atlas is read-only: fixUrl opens the item or workspace in Fabric where the change is made.",
    ],
  };
}

const WITHHELD_KEYS = new Set([
  "ownerEmail",
  "email",
  "userPrincipalName",
  "configuredBy",
  "modifiedBy",
  "endorsementBy",
  "message",
]);
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function redact(value: unknown): unknown {
  if (typeof value === "string") return EMAIL_LIKE.test(value) ? "[withheld]" : value;
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        WITHHELD_KEYS.has(key) && entry !== undefined && entry !== null && entry !== ""
          ? "[withheld]"
          : redact(entry),
      ]),
    );
  }
  return value;
}

export function exportSnapshot(
  data: AtlasData,
  args: AtlasMcpToolArguments["atlas_export_snapshot"],
): GovernanceToolOutcome {
  const manifest = buildSnapshotManifest(data);
  const limitations = [
    "The manifest fingerprint covers the complete export downloaded from Governance › Export snapshot; MCP pages withhold email-like values and job messages, so they cannot be hashed back to it.",
    "Comments and synchronization audit rows are not part of the export.",
  ];
  if (!args.section) {
    return {
      result: { manifest, section: null, rows: [], offset: 0, nextOffset: null },
      sources: [source(data, ["Workspace", "SnapshotManifest"])],
      coverage: page("complete", 0, 0, 0, [
        "Pass section (items, edges, principals, grants, jobs or config) to page through the snapshot rows.",
      ]),
      limitations,
    };
  }
  const rows = snapshotPayload(data)[args.section] as readonly unknown[];
  const slice = rows.slice(args.offset, args.offset + args.limit);
  return {
    result: {
      manifest,
      section: args.section,
      rows: slice.map(redact),
      offset: args.offset,
      nextOffset: nextOffset(args.offset, slice.length, rows.length),
    },
    sources: [source(data, ["Workspace", "SnapshotManifest", args.section])],
    coverage: page("complete", slice.length, rows.length, args.offset),
    limitations,
  };
}
