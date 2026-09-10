import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Download,
  ShieldAlert,
  UserRoundX,
  X,
} from "lucide-react";
import { useMemo, useRef } from "react";
import { accessRowsToCsv } from "../access-export";
import {
  offboardingReassignmentToCsv,
  offboardingReportToMarkdown,
} from "../offboarding-export";
import { buildOffboardingReport } from "../offboarding";
import type { AtlasData } from "../model";
import { Card, TypeGlyph, cn } from "../ui";

function safeFileName(value: string): string {
  return (
    value
      .trim()
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "principal"
  );
}

function download(content: string, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function OffboardingDialog({
  data,
  principalId,
  open,
  onClose,
}: {
  data: AtlasData;
  principalId: string;
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement>(null);
  const report = useMemo(
    () => buildOffboardingReport(data, principalId),
    [data, principalId],
  );
  const subjectName = report.subject.ref;
  const baseName = `fabric-atlas-${safeFileName(subjectName)}`;
  const ownershipRoots =
    report.kind === "person-offboarding"
      ? report.owned
      : report.effectiveOwnerItems;
  const ownershipCoverageValue =
    report.ownershipCoverage.percentage == null
      ? "Not applicable"
      : `${report.ownershipCoverage.percentage}%`;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      {open && (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm" />
          <div className="pointer-events-none fixed inset-0 z-[121] flex items-center justify-center p-m sm:p-xl">
            <Dialog.Content
              asChild
              onOpenAutoFocus={(event) => {
                returnFocusRef.current =
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
                event.preventDefault();
                closeRef.current?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                returnFocusRef.current?.focus();
                returnFocusRef.current = null;
              }}
            >
              <section className="pointer-events-auto flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-fabric-16">
                <header className="atlas-fabric-hero flex flex-col gap-m border-b border-border p-l sm:flex-row sm:items-center">
                  <span className="atlas-brand-mark flex icon-size-700 shrink-0 items-center justify-center rounded-xl text-primary-foreground">
                    <UserRoundX className="icon-size-400" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-200 font-semibold uppercase tracking-[0.12em] text-brand-foreground">
                      {report.kind === "person-offboarding"
                        ? "Departure pack"
                        : "Removal impact"}
                    </div>
                    <Dialog.Title className="mt-xs truncate font-heading text-500 font-bold leading-500">
                      {subjectName}
                    </Dialog.Title>
                    <Dialog.Description className="mt-xs text-200 text-muted-foreground">
                      Ownership, urgent orphan risks, downstream blast radius
                      and reassignment evidence.
                    </Dialog.Description>
                  </div>
                  <div className="flex flex-wrap items-center gap-s">
                    <button
                      type="button"
                      disabled={report.blocked}
                      onClick={() =>
                        download(
                          offboardingReassignmentToCsv(report),
                          "text/csv;charset=utf-8",
                          `${baseName}-reassignment.csv`,
                        )
                      }
                      className="inline-flex items-center gap-s rounded-lg border border-border px-m py-s text-200 font-semibold hover:bg-accent disabled:opacity-50"
                    >
                      <Download className="icon-size-100" />
                      Reassignment CSV
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        download(
                          accessRowsToCsv(report.access),
                          "text/csv;charset=utf-8",
                          `${baseName}-access.csv`,
                        )
                      }
                      className="inline-flex items-center gap-s rounded-lg border border-border px-m py-s text-200 font-semibold hover:bg-accent"
                    >
                      <Download className="icon-size-100" />
                      Access CSV
                    </button>
                    <button
                      type="button"
                      disabled={report.blocked}
                      onClick={() =>
                        download(
                          offboardingReportToMarkdown(report, {
                            workspaceName: data.workspace.displayName,
                            generatedAt: new Date().toISOString(),
                          }),
                          "text/markdown;charset=utf-8",
                          `${baseName}-departure-pack.md`,
                        )
                      }
                      className="inline-flex items-center gap-s rounded-lg bg-primary px-m py-s text-200 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
                    >
                      <Download className="icon-size-100" />
                      Markdown
                    </button>
                    <Dialog.Close asChild>
                      <button
                        ref={closeRef}
                        type="button"
                        aria-label="Close departure pack"
                        className="rounded-lg p-s text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <X className="icon-size-200" />
                      </button>
                    </Dialog.Close>
                  </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-l sm:p-xl">
                  {report.warnings.map((warning) => (
                    <div
                      key={warning}
                      className={cn(
                        "mb-s flex gap-s rounded-lg border p-m text-200",
                        report.blocked
                          ? "border-status-failing/30 bg-status-failing/10 text-status-failing"
                          : "border-status-warning/30 bg-status-warning/10 text-status-warning",
                      )}
                    >
                      <AlertTriangle className="icon-size-200 shrink-0" />
                      {warning}
                    </div>
                  ))}

                  <Card className="mt-l flex flex-col gap-m p-m sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="text-300 font-semibold">
                        Ownership metadata coverage
                      </div>
                      <p className="mt-xs text-200 text-muted-foreground">
                        Sole-owner and reassignment conclusions are limited to
                        items with documented ownership evidence.
                      </p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <div
                        className={cn(
                          "font-numeric text-500 font-bold",
                          report.ownershipCoverage.percentage == null
                            ? "text-muted-foreground"
                            : report.ownershipCoverage.percentage >= 80
                              ? "text-status-healthy"
                              : "text-status-warning",
                        )}
                      >
                        {ownershipCoverageValue}
                      </div>
                      <div className="text-100 text-muted-foreground">
                        {report.ownershipCoverage.numerator} of{" "}
                        {report.ownershipCoverage.denominator} applicable items
                      </div>
                    </div>
                  </Card>

                  <div className="mt-m grid gap-m sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      [
                        report.kind === "person-offboarding"
                          ? "Owned"
                          : "Effective owner",
                        ownershipRoots.length,
                      ],
                      ["Sole owned", report.soleOwned.length],
                      ["Urgent risks", report.orphanRisk.length],
                      ["Blast radius", report.blastRadius.length],
                    ].map(([label, value]) => (
                      <Card key={label} className="p-m">
                        <div className="font-numeric text-500 font-bold">
                          {value}
                        </div>
                        <div className="text-200 text-muted-foreground">
                          {label}
                        </div>
                      </Card>
                    ))}
                  </div>

                  {!report.blocked && (
                    <div className="mt-l grid gap-l xl:grid-cols-2">
                      <Card className="overflow-hidden">
                        <div className="flex items-center gap-s border-b border-border bg-status-failing/10 px-l py-m">
                          <ShieldAlert className="icon-size-200 text-status-failing" />
                          <h3 className="text-300 font-semibold">
                            Urgent orphan risks
                          </h3>
                        </div>
                        {report.orphanRisk.length === 0 ? (
                          <p className="p-l text-200 text-muted-foreground">
                            No sole-owned item with downstream consumers.
                          </p>
                        ) : (
                          <div className="divide-y divide-border">
                            {report.orphanRisk.map((risk) => (
                              <div
                                key={risk.item.fabricId}
                                className="flex items-start gap-m p-l"
                              >
                                <TypeGlyph type={risk.item.itemType} />
                                <div>
                                  <div className="text-300 font-semibold">
                                    {risk.item.displayName}
                                  </div>
                                  <div className="mt-xs text-200 text-muted-foreground">
                                    {risk.consumers.length} downstream consumer
                                    {risk.consumers.length === 1 ? "" : "s"}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>

                      <Card className="overflow-hidden">
                        <div className="border-b border-border bg-secondary px-l py-m">
                          <h3 className="text-300 font-semibold">
                            Reassignment plan
                          </h3>
                        </div>
                        {report.reassignment.length === 0 ? (
                          <p className="p-l text-200 text-muted-foreground">
                            No proven sole-owned item requires reassignment.
                          </p>
                        ) : (
                          <div className="divide-y divide-border">
                            {report.reassignment.map((entry) => (
                              <div key={entry.item.fabricId} className="p-l">
                                <div className="text-300 font-semibold">
                                  {entry.item.displayName}
                                </div>
                                <div className="mt-xs text-200 text-muted-foreground">
                                  {entry.suggested?.displayName ??
                                    "No eligible successor"}
                                </div>
                                <div className="mt-xs text-100 text-muted-foreground">
                                  {entry.reason}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    </div>
                  )}
                </div>
              </section>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}
