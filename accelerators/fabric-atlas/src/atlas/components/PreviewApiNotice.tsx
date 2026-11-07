import { FlaskConical, Info } from "lucide-react";
import type { PreviewFeatureId } from "../preview-api";
import {
  previewApiDescriptors,
  previewMaturityLabel,
} from "../preview-api";
import { cn } from "../ui";

export function PreviewApiNotice({
  featureIds,
  className,
}: {
  featureIds: readonly PreviewFeatureId[];
  className?: string;
}) {
  const descriptors = previewApiDescriptors(featureIds);
  if (descriptors.length === 0) return null;

  const primary = descriptors[0];
  const summary =
    descriptors.length === 1
      ? `${previewMaturityLabel(primary.maturity)} API`
      : `${descriptors.length} preview integrations`;

  return (
    <aside
      role="note"
      aria-label="Preview API information"
      className={cn(
        // Explicit length syntax: tailwind-merge drops `text-200` next to a text color.
        "rounded-lg border border-lineage-upstream/30 bg-lineage-upstream/5 px-m py-s text-[length:var(--text-200)] leading-200 text-foreground",
        className,
      )}
    >
      <div className="flex items-start gap-s">
        <span className="flex icon-size-400 shrink-0 items-center justify-center rounded-md bg-lineage-upstream/10 text-lineage-upstream">
          <FlaskConical className="icon-size-200" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-s gap-y-xxs">
            <strong className="text-200">{summary}</strong>
            {descriptors.length === 1 && (
              <span className="text-muted-foreground">
                {primary.productName} · {primary.apiVersion}
              </span>
            )}
          </div>
          <p className="mt-xxs leading-200 text-muted-foreground">
            {descriptors.length === 1
              ? primary.evidenceBoundary
              : "Preview evidence remains source-labelled and separate from authoritative Atlas metadata."}
          </p>
          <details className="mt-xs">
            <summary className="inline-flex cursor-pointer items-center gap-xs font-semibold text-lineage-upstream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Info className="icon-size-100" aria-hidden="true" />
              API details
            </summary>
            <div className="mt-s grid gap-s">
              {descriptors.map((descriptor) => (
                <section
                  key={descriptor.id}
                  aria-labelledby={`preview-api-${descriptor.id}`}
                  className="rounded-md border border-border bg-card/70 p-s"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-s">
                    <h3
                      id={`preview-api-${descriptor.id}`}
                      className="font-semibold"
                    >
                      {descriptor.productName}
                    </h3>
                    <span className="text-muted-foreground">
                      {previewMaturityLabel(descriptor.maturity)} ·{" "}
                      {descriptor.apiVersion}
                    </span>
                  </div>
                  <p className="mt-xs text-muted-foreground">
                    {descriptor.evidenceBoundary}
                  </p>
                  <ul className="mt-xs list-disc space-y-xxs pl-l text-muted-foreground">
                    {descriptor.limitations.map((limitation) => (
                      <li key={limitation}>{limitation}</li>
                    ))}
                  </ul>
                  <div className="mt-s flex flex-wrap items-center justify-between gap-s">
                    <a
                      href={descriptor.documentationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-lineage-upstream underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Microsoft documentation
                    </a>
                    <span className="text-muted-foreground">
                      Verified {descriptor.lastVerifiedAt}
                    </span>
                  </div>
                </section>
              ))}
            </div>
          </details>
        </div>
      </div>
    </aside>
  );
}
