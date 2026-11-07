import type { AudienceType, RayfinContext } from '@microsoft/fabric-user-data-functions';
import type { AtlasSchema } from '../../data/schema.js';

/**
 * Posts an Adaptive Card to the Teams Workflows webhook stored in the
 * ATLAS_TEAMS_WEBHOOK_URL secret. The URL never leaves the Function: the
 * browser only sends the card and receives a fixed, credential-free status.
 */
export const TEAMS_CARD_MAX_BYTES = 28_000;
const TEAMS_TIMEOUT_MS = 10_000;

export type TeamsNotifyStatus = 'sent' | 'not-configured' | 'invalid-card' | 'invalid-webhook' | 'failed';
export interface TeamsNotifyResult {
  status: TeamsNotifyStatus;
  httpStatus?: number;
}
export type TeamsCardJsonInput = string;

export function validWebhookUrl(value: string | undefined): URL | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url : undefined;
  } catch {
    return undefined;
  }
}

export function parseTeamsCard(cardJson: unknown): Record<string, unknown> | undefined {
  if (typeof cardJson !== 'string' || !cardJson || new TextEncoder().encode(cardJson).length > TEAMS_CARD_MAX_BYTES) return undefined;
  try {
    const card = JSON.parse(cardJson) as unknown;
    if (!card || typeof card !== 'object' || Array.isArray(card)) return undefined;
    return (card as Record<string, unknown>).type === 'AdaptiveCard' ? (card as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export async function postTeamsCard(
  webhook: string | undefined,
  cardJson: unknown,
  fetcher: typeof fetch = fetch,
): Promise<TeamsNotifyResult> {
  if (!webhook?.trim()) return { status: 'not-configured' };
  const url = validWebhookUrl(webhook);
  if (!url) return { status: 'invalid-webhook' };
  const card = parseTeamsCard(cardJson);
  if (!card) return { status: 'invalid-card' };
  try {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(TEAMS_TIMEOUT_MS),
      body: JSON.stringify({
        type: 'message',
        attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }],
      }),
    });
    return response.ok ? { status: 'sent', httpStatus: response.status } : { status: 'failed', httpStatus: response.status };
  } catch {
    return { status: 'failed' };
  }
}

export async function teamsNotify(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: 1,
  cardJson: TeamsCardJsonInput,
): Promise<TeamsNotifyResult> {
  if (protocolVersion !== 1) return { status: 'invalid-card' };
  let webhook: string | undefined;
  try {
    webhook = ctx.Secrets.ATLAS_TEAMS_WEBHOOK_URL;
  } catch {
    return { status: 'not-configured' };
  }
  return postTeamsCard(webhook, cardJson);
}
