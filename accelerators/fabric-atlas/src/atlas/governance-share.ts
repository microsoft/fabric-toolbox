import { findingFixUrl } from "./fabric-portal";
import { findingRule } from "./finding-groups";
import type { GovernanceFinding, GovernanceSeverity } from "./governance";
import type { AtlasData, Item } from "./model";
import {
  MICROSOFT_PILLAR_LABEL,
  microsoftPillarForFinding,
  microsoftPillarForPosture,
} from "./ms-pillars";
import type { PostureScore } from "./posture";
import { POSTURE_LABELS } from "./components/posture-radar";

export const FINDINGS_EXPORT_VERSION = 1;

const SEVERITY_RANK: Record<GovernanceSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

type ShareData = Pick<AtlasData, "workspace" | "items">;

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

/**
 * True when the signed-in user is the recorded owner of the finding's item.
 * Matching uses the email only: display names are not unique identities.
 */
export function isFindingOwnedBy(
  finding: Pick<GovernanceFinding, "itemId">,
  items: readonly Item[],
  userEmail: string | undefined,
): boolean {
  const email = normalized(userEmail);
  if (!email || !finding.itemId) return false;
  const item = items.find((entry) => entry.fabricId === finding.itemId);
  return normalized(item?.ownerEmail) === email;
}

export function sortFindingsBySeverity(
  findings: readonly GovernanceFinding[],
): GovernanceFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.title.localeCompare(b.title),
  );
}

/** Machine-readable action queue for ticketing tools and scripts. */
export function buildFindingsExport(
  findings: readonly GovernanceFinding[],
  data: ShareData,
  generatedAt: string,
) {
  const itemById = new Map(data.items.map((item) => [item.fabricId, item]));
  return {
    format: "fabric-atlas.findings",
    version: FINDINGS_EXPORT_VERSION,
    generatedAt,
    workspace: {
      id: data.workspace.fabricId,
      name: data.workspace.displayName,
      syncedAt: data.workspace.syncedAt,
    },
    count: findings.length,
    findings: sortFindingsBySeverity(findings).map((finding) => {
      const item = finding.itemId ? itemById.get(finding.itemId) : undefined;
      return {
        id: finding.id,
        rule: findingRule(finding),
        severity: finding.severity,
        category: finding.category,
        fabricPillar: microsoftPillarForFinding(finding),
        title: finding.title,
        detail: finding.detail,
        recommendation: finding.recommendation,
        item: item
          ? {
              id: item.fabricId,
              name: item.displayName,
              type: item.itemType,
              owner: item.ownerEmail ?? item.ownerName,
            }
          : undefined,
        fixUrl: findingFixUrl(finding, data),
        evidenceIds: finding.evidenceIds,
      };
    }),
  };
}

export const TEAMS_CARD_TOP_FINDINGS = 5;

/**
 * Adaptive Card (schema 1.5) summarizing the posture and the most severe
 * findings. Atlas never posts it: the reviewer pastes it into a Teams
 * Workflow or the Adaptive Cards designer, so no webhook secret is stored.
 */
/** Adaptive Card blocks listing the open findings (count line + top findings). */
export function buildTeamsFindingBlocks(
  findings: readonly GovernanceFinding[],
  data: ShareData,
) {
  const top = sortFindingsBySeverity(findings).slice(
    0,
    TEAMS_CARD_TOP_FINDINGS,
  );
  const counts = (["critical", "high", "medium", "low"] as const)
    .map((severity) => ({
      severity,
      count: findings.filter((finding) => finding.severity === severity).length,
    }))
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.severity}`)
    .join(" · ");
  return [
    {
      type: "TextBlock",
      text:
        findings.length === 0
          ? "No open finding."
          : `Open findings: ${findings.length} (${counts})`,
      weight: "Bolder",
      wrap: true,
    },
    ...top.map((finding) => ({
      type: "TextBlock",
      text: `- **${finding.severity.toUpperCase()}** [${finding.title}](${findingFixUrl(finding, data)})`,
      spacing: "Small",
      wrap: true,
    })),
  ];
}

export function buildTeamsPostureCard(
  posture: Pick<PostureScore, "global" | "pillars">,
  findings: readonly GovernanceFinding[],
  data: ShareData,
  appUrl?: string,
) {
  const score = (value: number | null) => (value == null ? "N/A" : `${value}%`);
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: [
      {
        type: "TextBlock",
        text: `Fabric Atlas · ${data.workspace.displayName}`,
        weight: "Bolder",
        size: "Medium",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: `Governance posture ${score(posture.global)}${
          data.workspace.syncedAt ? ` · synced ${data.workspace.syncedAt}` : ""
        }`,
        isSubtle: true,
        spacing: "None",
        wrap: true,
      },
      {
        type: "FactSet",
        facts: posture.pillars.map((pillar) => ({
          title: `${POSTURE_LABELS[pillar.pillar]} (${
            MICROSOFT_PILLAR_LABEL[microsoftPillarForPosture(pillar.pillar)]
          })`,
          value: score(pillar.score),
        })),
      },
      ...buildTeamsFindingBlocks(findings, data),
    ],
    ...(appUrl
      ? {
          actions: [
            { type: "Action.OpenUrl", title: "Open Fabric Atlas", url: appUrl },
          ],
        }
      : {}),
  };
}
