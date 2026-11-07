import { Copy } from "lucide-react";
import type { DescriptionDraft } from "../description-drafts";
import { NativeLink } from "./NativeLink";

const SHOWN = 3;

export function DescriptionDraftsPanel({ drafts, modelUrl }: { drafts: readonly DescriptionDraft[]; modelUrl?: string }) {
  if (!drafts.length) return null;
  const shown = drafts.slice(0, SHOWN);
  const copy = (text: string) => void navigator.clipboard?.writeText(text);
  return (
    <section aria-label="Suggested descriptions" data-testid="description-drafts"
      className="mt-s grid gap-s rounded-lg border border-border bg-secondary p-m text-200 leading-300">
      <div className="flex flex-wrap items-center justify-between gap-s">
        <h4 className="font-semibold">
          Suggested descriptions
          <span className="font-normal text-muted-foreground"> • draft • {shown.length} of {drafts.length} objects</span>
        </h4>
        <div className="flex flex-wrap items-center gap-s">
          <button type="button" onClick={() => copy(drafts.map((d) => `${d.target}\t${d.text}`).join("\n"))}
            className="atlas-control inline-flex items-center gap-xs rounded-lg border border-border bg-card px-s font-semibold hover:bg-accent">
            <Copy className="icon-size-100" aria-hidden="true" />
            Copy all
          </button>
          {modelUrl && <NativeLink href={modelUrl}>Open model in Fabric</NativeLink>}
        </div>
      </div>
      <ul className="grid gap-xs">
        {shown.map((draft) => (
          <li key={draft.target} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-start gap-s rounded-md border border-border bg-card px-s py-xs">
            <span className="min-w-0 break-words font-mono font-semibold">
              {draft.target} <span className="font-sans font-normal text-muted-foreground">{draft.kind}</span>
            </span>
            <span>{draft.text}</span>
            <button type="button" aria-label={`Copy description for ${draft.target}`} onClick={() => copy(draft.text)}
              className="atlas-control inline-flex items-center gap-xs rounded-lg border border-border px-s font-semibold hover:bg-accent">
              <Copy className="icon-size-100" aria-hidden="true" />
              Copy
            </button>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        Generated from names, expressions and lineage. Atlas never writes back; review and apply in Fabric.
      </p>
    </section>
  );
}
