import { ArrowRight, CheckCircle2, ClipboardCopy, Download, FileClock } from "lucide-react";
import { useState } from "react";
import type { SyncBrief, SyncBriefLink } from "../sync-brief";
import { Card, cn } from "../ui";

export function SyncBriefPanel({
  brief,
  loading,
  onCopy,
  onDownload,
  onOpen,
}: {
  brief: SyncBrief;
  loading: boolean;
  onCopy: () => Promise<void>;
  onDownload: () => void;
  onOpen: (link: SyncBriefLink) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const comparable = brief.state === "changes" || brief.state === "no-changes";
  return (
    <div className="mb-l" data-testid="sync-brief">
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-s border-b border-border bg-secondary/55 px-m py-s">
        <div className="min-w-0 flex-1">
          <h2 className="text-300 font-semibold">Sync Brief</h2>
          <p className="text-200 text-muted-foreground">
            What changed between the two compared validated snapshots.
          </p>
        </div>
        {comparable && (
          <>
            <button
              type="button"
              className="atlas-control inline-flex items-center gap-xs rounded-lg border border-input bg-card px-m text-200 font-semibold"
              onClick={() => {
                void onCopy().then(
                  () => setCopyState("copied"),
                  () => setCopyState("failed"),
                );
              }}
            >
              <ClipboardCopy className="icon-size-200" />
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy Markdown"}
            </button>
            <button
              type="button"
              className="atlas-control inline-flex items-center gap-xs rounded-lg border border-input bg-card px-m text-200 font-semibold"
              onClick={onDownload}
            >
              <Download className="icon-size-200" />
              Download
            </button>
          </>
        )}
      </div>
      {loading ? (
        <p className="px-m py-m text-200 text-muted-foreground">Loading validated snapshots…</p>
      ) : brief.state === "no-snapshot" ? (
        <p className="px-m py-m text-200 text-muted-foreground">No validated snapshot yet.</p>
      ) : brief.state === "first-snapshot" ? (
        <p className="flex items-center gap-s px-m py-m text-200 text-muted-foreground">
          <FileClock className="icon-size-200" />
          Baseline: this is the first validated snapshot. The next sync will produce a brief.
        </p>
      ) : (
        <div>
          {brief.state === "no-changes" && (
            <p className="flex items-center gap-s border-b border-border px-m py-s text-200 font-semibold">
              <CheckCircle2 className="icon-size-200 text-status-healthy" />
              No monitored changes
            </p>
          )}
          <p className="border-b border-border px-m py-s text-200 text-muted-foreground">
            Tenant settings drift: <strong>{brief.tenantSettings === "comparable" ? "compared" : "unavailable"}</strong>
            {" · "}Pre-existing high-priority findings: <strong>{brief.preExistingHighFindings}</strong>
          </p>
          <div className="grid gap-px bg-border md:grid-cols-2">
            {brief.sections.map((section) => (
              <section key={section.id} className="bg-card px-m py-s" aria-label={section.title}>
                <h3 className="flex items-center justify-between gap-s text-200 font-semibold">
                  {section.title}
                  <span
                    className={cn(
                      "rounded-md px-s text-100",
                      section.status === "unavailable"
                        ? "bg-secondary text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {section.status === "unavailable" ? "Unavailable" : section.entries.length}
                  </span>
                </h3>
                {section.status === "unavailable" ? (
                  <p className="mt-xs text-200 text-muted-foreground">{section.reason}</p>
                ) : section.entries.length === 0 ? (
                  <p className="mt-xs text-200 text-muted-foreground">None</p>
                ) : (
                  <ul className="mt-xs space-y-xxs">
                    {section.entries.slice(0, 8).map((entry) => (
                      <li key={entry.id} className="flex min-w-0 items-center gap-s text-200">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold">{entry.title}</span>
                          <span className="text-muted-foreground"> — {entry.detail}</span>
                        </div>
                        {entry.link && (
                          <button
                            type="button"
                            aria-label={`Open ${entry.title}`}
                            className="shrink-0 rounded p-xxs text-primary hover:bg-accent"
                            onClick={() => onOpen(entry.link!)}
                          >
                            <ArrowRight className="icon-size-200" />
                          </button>
                        )}
                      </li>
                    ))}
                    {section.entries.length > 8 && (
                      <li className="text-100 text-muted-foreground">
                        +{section.entries.length - 8} more in the Markdown export
                      </li>
                    )}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      )}
    </Card>
    </div>
  );
}
