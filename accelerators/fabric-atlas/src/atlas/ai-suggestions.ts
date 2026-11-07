import { csvCell } from "./access-export";
import type { CatalogObject } from "./catalog-objects";

export const AI_PROMPT_MAX_CHARS = 24_000;
export const AI_MAX_TARGETS = 50;

export type AiSuggestStatus =
  | "ok"
  | "disabled"
  | "not-configured"
  | "invalid-request"
  | "failed";

export interface AiSuggestion {
  target: string;
  suggestion: string;
}

export interface AiSuggestResult {
  status: AiSuggestStatus;
  suggestions?: AiSuggestion[];
  httpStatus?: number;
}

export const AI_SUGGEST_STATUS_LABEL: Record<AiSuggestStatus, string> = {
  ok: "Suggestions ready",
  disabled:
    "AI suggestions are off. An admin sets ATLAS_AI_ENABLED=true to opt in.",
  "not-configured":
    "AI endpoint or credentials are not configured in the Secret Store.",
  "invalid-request": "The request was rejected (too large or empty).",
  failed: "The AI endpoint did not return usable suggestions.",
};

export interface DescriptionPrompt {
  prompt: string;
  targets: string[];
  truncated: boolean;
}

function line(asset: CatalogObject): string {
  const parts = [`- ${asset.name} (${asset.kind}`];
  if (asset.dataType) parts.push(`, ${asset.dataType}`);
  parts.push(")");
  if (asset.description) parts.push(` — current: ${asset.description}`);
  if (asset.expression) parts.push(`\n  DAX/expression: ${asset.expression.replace(/\s+/g, " ").slice(0, 600)}`);
  return parts.join("");
}

/**
 * Builds the text sent to the AI endpoint: only names, kinds, data types,
 * existing descriptions and expressions of the selected object and its
 * children in the same item. No data values are included.
 */
export function buildDescriptionPrompt(
  asset: CatalogObject,
  all: readonly CatalogObject[],
): DescriptionPrompt {
  const children = all.filter(
    (other) =>
      other.id !== asset.id &&
      other.itemFabricId === asset.itemFabricId &&
      (other.tableName === asset.name || other.parentName === asset.name),
  );
  const header = [
    `Fabric item: ${asset.itemName} (${asset.itemType})`,
    `Object: ${asset.name} (${asset.kind})`,
    asset.description ? `Current description: ${asset.description}` : "Current description: none",
    "",
    "Objects to describe:",
  ].join("\n");
  const lines = [line(asset)];
  const targets = [asset.name];
  let size = header.length + lines[0].length;
  let truncated = false;
  for (const child of children) {
    const next = line(child);
    if (targets.length >= AI_MAX_TARGETS || size + next.length + 1 > AI_PROMPT_MAX_CHARS - 500) {
      truncated = true;
      break;
    }
    if (targets.includes(child.name)) continue;
    lines.push(next);
    targets.push(child.name);
    size += next.length + 1;
  }
  return { prompt: `${header}\n${lines.join("\n")}`, targets, truncated };
}

export function suggestionsToCsv(
  asset: Pick<CatalogObject, "itemName" | "name">,
  suggestions: readonly AiSuggestion[],
): string {
  const rows = [["Item", "Object", "Target", "Suggested description", "Source"].map(csvCell).join(",")];
  for (const entry of suggestions) {
    rows.push(
      [asset.itemName, asset.name, entry.target, entry.suggestion, "AI-generated"]
        .map(csvCell)
        .join(","),
    );
  }
  return rows.join("\r\n");
}

export async function invokeSuggestDescriptions(
  request: DescriptionPrompt,
): Promise<AiSuggestResult> {
  const { getRayfinClient } = await import("@/lib/rayfin-client");
  const client = getRayfinClient() as unknown as {
    functions: {
      suggestDescriptions: {
        invoke(
          input: { protocolVersion: 1; requestJson: string },
          options: { timeoutMs: number },
        ): Promise<AiSuggestResult>;
      };
    };
  };
  const result = await client.functions.suggestDescriptions.invoke(
    {
      protocolVersion: 1,
      requestJson: JSON.stringify({ prompt: request.prompt, targets: request.targets }),
    },
    { timeoutMs: 60_000 },
  );
  if (!result || !(result.status in AI_SUGGEST_STATUS_LABEL)) {
    throw new Error("Invalid AI suggestion response.");
  }
  return result;
}
