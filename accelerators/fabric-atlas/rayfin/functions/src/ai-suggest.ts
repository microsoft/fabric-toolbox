import type { AudienceType, RayfinContext } from '@microsoft/fabric-user-data-functions';
import type { AtlasSchema } from '../../data/schema.js';

/**
 * Opt-in description suggestions. Atlas sends only the prompt built in the
 * browser (object names, schema and DAX) to the Azure OpenAI / Foundry chat
 * completions endpoint configured in the Secret Store. Nothing is written back
 * to Fabric: suggestions are returned to the browser for review and copy.
 */
export const AI_PROMPT_MAX_CHARS = 24_000;
export const AI_MAX_SUGGESTIONS = 50;
const AI_TIMEOUT_MS = 45_000;
const AI_SCOPE = 'https://cognitiveservices.azure.com/.default';

export type AiSuggestStatus = 'ok' | 'disabled' | 'not-configured' | 'invalid-request' | 'failed';
export interface AiSuggestion {
  target: string;
  suggestion: string;
}
export interface AiSuggestResult {
  status: AiSuggestStatus;
  suggestions?: AiSuggestion[];
  httpStatus?: number;
}
export type AiSuggestRequestJson = string;

export interface AiSuggestConfig {
  enabled?: string;
  endpoint?: string;
  apiKey?: string;
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
}

const SYSTEM_PROMPT =
  'You write concise business descriptions (max 200 characters) for Microsoft Fabric data assets. ' +
  'Answer ONLY with JSON: {"suggestions":[{"target":"<exact object name>","suggestion":"<description>"}]}. ' +
  'Use only the targets listed by the user. Do not invent facts that are not implied by names, schema or DAX.';

export function validAiEndpoint(value: string | undefined): URL | undefined {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url : undefined;
  } catch {
    return undefined;
  }
}

export function parseSuggestRequest(requestJson: unknown): { prompt: string; targets: string[] } | undefined {
  if (typeof requestJson !== 'string' || !requestJson) return undefined;
  try {
    const value = JSON.parse(requestJson) as { prompt?: unknown; targets?: unknown };
    if (typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > AI_PROMPT_MAX_CHARS) return undefined;
    if (!Array.isArray(value.targets) || value.targets.length === 0 || value.targets.length > AI_MAX_SUGGESTIONS) return undefined;
    if (!value.targets.every((target) => typeof target === 'string' && target.length > 0 && target.length <= 256)) return undefined;
    return { prompt: value.prompt, targets: value.targets as string[] };
  } catch {
    return undefined;
  }
}

export function parseModelSuggestions(content: unknown, targets: string[]): AiSuggestion[] | undefined {
  if (typeof content !== 'string') return undefined;
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as { suggestions?: unknown };
    if (!Array.isArray(parsed.suggestions)) return undefined;
    const allowed = new Set(targets);
    const out: AiSuggestion[] = [];
    for (const entry of parsed.suggestions) {
      if (!entry || typeof entry !== 'object') continue;
      const { target, suggestion } = entry as Record<string, unknown>;
      if (typeof target !== 'string' || typeof suggestion !== 'string' || !allowed.has(target) || !suggestion.trim()) continue;
      out.push({ target, suggestion: suggestion.trim().slice(0, 500) });
      if (out.length >= AI_MAX_SUGGESTIONS) break;
    }
    return out;
  } catch {
    return undefined;
  }
}

async function aiAuthHeaders(config: AiSuggestConfig, fetcher: typeof fetch): Promise<Record<string, string> | undefined> {
  if (config.tenantId?.trim() && config.clientId?.trim() && config.clientSecret?.trim()) {
    const response = await fetcher(
      `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId.trim())}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: config.clientId.trim(),
          client_secret: config.clientSecret.trim(),
          scope: AI_SCOPE,
        }).toString(),
      },
    );
    if (!response.ok) return undefined;
    const token = ((await response.json()) as { access_token?: unknown }).access_token;
    return typeof token === 'string' && token ? { authorization: `Bearer ${token}` } : undefined;
  }
  if (config.apiKey?.trim()) return { 'api-key': config.apiKey.trim() };
  return undefined;
}

export async function requestSuggestions(
  config: AiSuggestConfig,
  requestJson: unknown,
  fetcher: typeof fetch = fetch,
): Promise<AiSuggestResult> {
  if (config.enabled?.trim().toLowerCase() !== 'true') return { status: 'disabled' };
  const endpoint = validAiEndpoint(config.endpoint);
  if (!endpoint) return { status: 'not-configured' };
  const request = parseSuggestRequest(requestJson);
  if (!request) return { status: 'invalid-request' };
  try {
    const headers = await aiAuthHeaders(config, fetcher);
    if (!headers) return { status: 'not-configured' };
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      redirect: 'error',
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `${request.prompt}\n\nTargets:\n${request.targets.map((t) => `- ${t}`).join('\n')}` },
        ],
        temperature: 0.2,
        max_tokens: 2_000,
      }),
    });
    if (!response.ok) return { status: 'failed', httpStatus: response.status };
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }> };
    const suggestions = parseModelSuggestions(body.choices?.[0]?.message?.content, request.targets);
    return suggestions ? { status: 'ok', suggestions } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}

function readSecret(read: () => string | undefined): string | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

export async function suggestDescriptions(
  ctx: RayfinContext<AtlasSchema, AudienceType.Fabric>,
  protocolVersion: 1,
  requestJson: AiSuggestRequestJson,
): Promise<AiSuggestResult> {
  if (protocolVersion !== 1) return { status: 'invalid-request' };
  return requestSuggestions(
    {
      enabled: readSecret(() => ctx.Secrets.ATLAS_AI_ENABLED),
      endpoint: readSecret(() => ctx.Secrets.ATLAS_AI_ENDPOINT),
      apiKey: readSecret(() => ctx.Secrets.ATLAS_AI_API_KEY),
      tenantId: readSecret(() => ctx.Secrets.ATLAS_AI_TENANT_ID),
      clientId: readSecret(() => ctx.Secrets.ATLAS_AI_CLIENT_ID),
      clientSecret: readSecret(() => ctx.Secrets.ATLAS_AI_CLIENT_SECRET),
    },
    requestJson,
  );
}
