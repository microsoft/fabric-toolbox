import { useState } from "react";
import { Copy, Download, Sparkles } from "lucide-react";
import type { CatalogObject } from "../catalog-objects";
import {
  AI_SUGGEST_STATUS_LABEL,
  buildDescriptionPrompt,
  invokeSuggestDescriptions,
  suggestionsToCsv,
  type AiSuggestion,
} from "../ai-suggestions";

interface State {
  busy: boolean;
  message?: string;
  suggestions?: AiSuggestion[];
}

/** Opt-in AI description suggestions; read-only, nothing is written to Fabric. */
export function AiSuggestPanel({
  asset,
  assets,
}: {
  asset: CatalogObject;
  assets: readonly CatalogObject[];
}) {
  const [state, setState] = useState<State>({ busy: false });
  const [forId, setForId] = useState(asset.id);
  if (forId !== asset.id) {
    setForId(asset.id);
    setState({ busy: false });
  }

  const downloadCsv = (suggestions: AiSuggestion[]) => {
    const blob = new Blob([suggestionsToCsv(asset, suggestions)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `atlas-ai-descriptions-${asset.name.replace(/[^\w.-]+/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mt-s rounded-lg border border-border bg-card p-m" data-testid="ai-suggest">
      <div className="flex flex-wrap items-center gap-s">
        <button
          type="button"
          disabled={state.busy}
          title="Sends names, schema and DAX (no data values) to the configured AI endpoint"
          onClick={async () => {
            setState({ busy: true });
            try {
              const request = buildDescriptionPrompt(asset, assets);
              const result = await invokeSuggestDescriptions(request);
              setState({
                busy: false,
                message:
                  result.status === "ok" && request.truncated
                    ? `${AI_SUGGEST_STATUS_LABEL.ok} (prompt truncated)`
                    : AI_SUGGEST_STATUS_LABEL[result.status],
                suggestions: result.status === "ok" ? result.suggestions ?? [] : undefined,
              });
            } catch {
              setState({ busy: false, message: "AI suggestions unavailable in this session." });
            }
          }}
          className="atlas-control inline-flex items-center gap-s rounded-lg border border-border bg-card px-m text-200 font-semibold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="icon-size-100" aria-hidden="true" />
          {state.busy ? "Suggesting…" : "Suggest descriptions"}
        </button>
        {state.suggestions && state.suggestions.length > 0 && (
          <button
            type="button"
            onClick={() => downloadCsv(state.suggestions ?? [])}
            className="atlas-control inline-flex items-center gap-s rounded-lg border border-border bg-card px-m text-200 font-semibold hover:bg-accent"
          >
            <Download className="icon-size-100" aria-hidden="true" />
            Export CSV
          </button>
        )}
        {state.message && (
          <span role="status" className="text-200 text-muted-foreground">
            {state.message}
          </span>
        )}
      </div>
      {state.suggestions && state.suggestions.length > 0 && (
        <ul className="mt-s grid gap-xs">
          {state.suggestions.map((entry) => (
            <li
              key={entry.target}
              className="flex items-start justify-between gap-s rounded-lg border border-border bg-secondary px-m py-s"
            >
              <div className="min-w-0">
                <div className="text-200 font-semibold">
                  {entry.target}{" "}
                  <span className="ml-xs rounded bg-accent px-xs text-100 font-semibold uppercase tracking-wide text-muted-foreground">
                    AI-generated
                  </span>
                </div>
                <p className="text-200 leading-300 text-muted-foreground">{entry.suggestion}</p>
              </div>
              <button
                type="button"
                aria-label={`Copy suggestion for ${entry.target}`}
                onClick={() => void navigator.clipboard?.writeText(entry.suggestion)}
                className="atlas-control inline-flex shrink-0 items-center rounded-lg border border-border bg-card px-s hover:bg-accent"
              >
                <Copy className="icon-size-100" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
