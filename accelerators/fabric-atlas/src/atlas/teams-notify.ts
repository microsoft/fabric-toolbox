import { buildTeamsFindingBlocks } from "./governance-share";
import { criticalFindingKey, parseGovernanceSummary } from "./domain-governance";
import type { GovernanceFinding } from "./governance";
import type { AtlasData } from "./model";

export type TeamsNotifyStatus = "sent" | "not-configured" | "invalid-card" | "invalid-webhook" | "failed";
export interface TeamsNotifyResult {
  status: TeamsNotifyStatus;
  httpStatus?: number;
}

export const TEAMS_NOTIFY_STATUS_LABEL: Record<TeamsNotifyStatus, string> = {
  sent: "Test card sent to Teams.",
  "not-configured": "Teams webhook not configured. Set the ATLAS_TEAMS_WEBHOOK_URL secret.",
  "invalid-card": "The card was rejected before sending.",
  "invalid-webhook": "The configured webhook is not a valid https URL.",
  failed: "Teams did not accept the card.",
};

/**
 * Critical findings absent from the previous snapshot. Without a previous
 * summary (first sync or summary not yet stored) nothing is considered new,
 * so a fresh deployment never floods the channel.
 */
export function newCriticalFindings(
  findings: readonly GovernanceFinding[],
  previousSummaryJson: unknown,
): GovernanceFinding[] {
  const previous = parseGovernanceSummary(previousSummaryJson);
  if (!previous) return [];
  const known = new Set(previous.critical ?? []);
  return findings.filter((finding) => finding.severity === "critical" && !known.has(criticalFindingKey(finding.id)));
}

export function buildNewCriticalCard(
  data: Pick<AtlasData, "workspace" | "items">,
  findings: readonly GovernanceFinding[],
  appUrl?: string,
) {
  const workspaceName = data.workspace.displayName;
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: [
      {
        type: "TextBlock",
        text: `Fabric Atlas · ${workspaceName}`,
        weight: "Bolder",
        size: "Medium",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: `${findings.length} new critical finding${findings.length === 1 ? "" : "s"} since the previous sync`,
        color: "Attention",
        wrap: true,
      },
      ...buildTeamsFindingBlocks(findings, data),
    ],
    ...(appUrl ? { actions: [{ type: "Action.OpenUrl", title: "Open Fabric Atlas", url: appUrl }] } : {}),
  };
}

export function buildTestCard(workspaceName: string) {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: [
      { type: "TextBlock", text: `Fabric Atlas · ${workspaceName}`, weight: "Bolder", size: "Medium", wrap: true },
      { type: "TextBlock", text: "Test notification: the Teams webhook is connected.", wrap: true },
    ],
  };
}

export async function invokeTeamsNotify(card: object): Promise<TeamsNotifyResult> {
  const { getRayfinClient } = await import("@/lib/rayfin-client");
  const client = getRayfinClient() as unknown as {
    functions: {
      teamsNotify: {
        invoke(input: { protocolVersion: 1; cardJson: string }, options: { timeoutMs: number }): Promise<TeamsNotifyResult>;
      };
    };
  };
  const result = await client.functions.teamsNotify.invoke(
    { protocolVersion: 1, cardJson: JSON.stringify(card) },
    { timeoutMs: 30_000 },
  );
  if (
    !result ||
    typeof result.status !== "string" ||
    !Object.hasOwn(TEAMS_NOTIFY_STATUS_LABEL, result.status)
  ) throw new Error("Invalid Teams notification response.");
  return result;
}
