import { Layers3 } from "lucide-react";
import {
  coverageRatio,
  curateFirst,
  NO_DOMAIN_KEY,
  withParentRollups,
  type CoverageCount,
  type DomainGovernanceRow,
  type DomainRollupRow,
} from "../domain-governance";
import { MICROSOFT_PILLAR_LABEL, type MicrosoftGovernancePillar } from "../ms-pillars";
import { Card, cn } from "../ui";
import { scoreBand } from "./score-style";

const EMPTY_REASON: Record<NonNullable<DomainGovernanceRow["emptyReason"]>, string> = {
  "empty-in-fabric": "Empty in Fabric",
  "not-synchronized": "No workspace synchronized by this Atlas deployment",
  unknown: "Not synchronized here; Fabric assignment unknown",
};

const PILLARS: MicrosoftGovernancePillar[] = ["health", "protect", "trust"];

function Score({ value }: { value: number | null }) {
  return (
    <span className="atlas-score font-numeric font-semibold" data-score-band={scoreBand(value)}>
      {value == null ? "N/A" : `${value}%`}
    </span>
  );
}

function Ratio({ value }: { value: CoverageCount }) {
  const ratio = coverageRatio(value);
  return (
    <span className="flex flex-col">
      <Score value={ratio} />
      <span className="text-100 text-muted-foreground">
        {value.numerator}/{value.denominator}
        {value.unknown > 0 && ` · ${value.unknown} unknown`}
      </span>
    </span>
  );
}

function DomainName({
  row,
  currentKey,
  labelName,
}: {
  row: DomainRollupRow;
  currentKey?: string;
  labelName?: (id: string) => string | undefined;
}) {
  const defaultLabel = row.defaultSensitivityLabelId
    ? labelName?.(row.defaultSensitivityLabelId) ?? `label ${row.defaultSensitivityLabelId.slice(0, 8)}… (name not observed)`
    : undefined;
  const name = row.domain.kind === "named" ? row.domain.label.split(" › ").at(-1) : row.domain.label;
  return (
    <span className={cn("flex min-w-0 flex-col", row.depth === 1 && "pl-l")}>
      <span className="flex min-w-0 flex-wrap items-center gap-xs">
        {row.depth === 1 && <span aria-hidden="true" className="text-muted-foreground">↳</span>}
        <span className={cn("truncate font-semibold", row.domain.kind !== "named" && "text-muted-foreground")} title={row.domain.label}>
          {row.key === NO_DOMAIN_KEY ? "No domain" : name}
        </span>
        {row.key === NO_DOMAIN_KEY && (
          <span className="rounded-full bg-signal-warning-background px-s text-100 font-semibold text-signal-warning-foreground">unassigned</span>
        )}
        {currentKey === row.key && (
          <span className="rounded-full bg-brand-background px-s text-100 font-semibold text-brand-foreground">this workspace</span>
        )}
        {row.rolledUp > 0 && (
          <span
            className="rounded-full border border-border px-s text-100 text-muted-foreground"
            title={`Includes ${row.rolledUp} sub-domain${row.rolledUp === 1 ? "" : "s"}`}
          >
            parent (roll-up)
          </span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-xs text-100 text-muted-foreground">
        {row.depth === 1 && row.domain.kind === "named" && <span>Sub-domain of {row.domain.label.split(" › ")[0]}</span>}
        {row.empty && (
          <span
            className="rounded-full border border-border bg-muted px-s font-semibold"
            title={row.emptyReason ? EMPTY_REASON[row.emptyReason] : undefined}
          >
            Empty · {row.emptyReason ? EMPTY_REASON[row.emptyReason] : "No synchronized workspace"}
          </span>
        )}
        {defaultLabel && <span title="Default sensitivity label of the domain">Default label: {defaultLabel}</span>}
      </span>
    </span>
  );
}

function Workspaces({ row }: { row: DomainRollupRow }) {
  if (row.empty) return <span className="text-muted-foreground">0</span>;
  return (
    <span className="flex flex-col items-end" title={row.workspaces.join(", ")}>
      <span className="font-numeric">{row.workspaces.length}</span>
      {(row.fabricWorkspaceCount != null || row.workspacesWithoutSummary > 0) && (
        <span className="text-100 text-muted-foreground">
          {row.fabricWorkspaceCount != null && `of ${row.fabricWorkspaceCount} in Fabric`}
          {row.workspacesWithoutSummary > 0 && ` · ${row.workspacesWithoutSummary} without summary`}
        </span>
      )}
    </span>
  );
}

export function DomainGovernanceTable({
  rows,
  mode,
  activeKey,
  currentKey,
  target = 70,
  labelName,
  onSelect,
}: {
  rows: DomainGovernanceRow[];
  mode: "posture" | "coverage";
  activeKey?: string;
  /** Domain key of the active workspace ("this workspace" marker). */
  currentKey?: string;
  /** Pillar target used by the "At target" column. */
  target?: number;
  labelName?: (id: string) => string | undefined;
  onSelect?: (row: DomainGovernanceRow) => void;
}) {
  if (!rows.length) return null;
  const displayRows = withParentRollups(rows);
  const posture = mode === "posture";
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-s border-b border-border bg-secondary/55 px-l py-m">
        <div className="flex items-start gap-s">
          <Layers3 className="mt-xxs icon-size-200 text-brand-foreground" aria-hidden="true" />
          <div>
            <h3 className="text-300 font-semibold">{posture ? "Posture by domain" : "Trust coverage by domain"}</h3>
            <p className="text-200 text-muted-foreground">
              {posture
                ? "Health / Protect / Trust rolled up per Fabric domain across the synchronized scope. Parent domains aggregate their sub-domains."
                : "Share of items with a description, at least one tag, an endorsement and a sensitivity label. \u201cCurate first\u201d points to the largest gap weighted by item count."}
            </p>
          </div>
        </div>
        {posture && (
          <p className="text-200 text-muted-foreground">
            Target {target}%{onSelect ? " · click a domain to filter the whole app" : ""}
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-200">
          <thead className="border-b border-border text-100 uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-l py-s font-semibold">Domain</th>
              {posture && <th scope="col" className="px-m py-s text-right font-semibold">Workspaces</th>}
              <th scope="col" className="px-m py-s text-right font-semibold">Items</th>
              {posture ? (
                <>
                  {PILLARS.map((pillar) => (
                    <th key={pillar} scope="col" className="px-m py-s text-right font-semibold">
                      Fabric · {MICROSOFT_PILLAR_LABEL[pillar]}
                    </th>
                  ))}
                  <th scope="col" className="px-m py-s text-right font-semibold">Open findings</th>
                  <th scope="col" className="px-m py-s text-right font-semibold">At target</th>
                </>
              ) : (
                <>
                  <th scope="col" className="px-m py-s font-semibold">Description</th>
                  <th scope="col" className="px-m py-s font-semibold">Tagged</th>
                  <th scope="col" className="px-m py-s font-semibold">Endorsed</th>
                  <th scope="col" className="px-m py-s font-semibold">Labeled</th>
                  <th scope="col" className="px-m py-s font-semibold">Curate first</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const selectable = Boolean(onSelect) && !row.empty;
              const open = row.findings.critical + row.findings.high + row.findings.medium + row.findings.low;
              const scored = PILLARS.filter((pillar) => row.pillars[pillar] != null);
              const atTarget = scored.filter((pillar) => (row.pillars[pillar] ?? 0) >= target).length;
              const curate = curateFirst(row);
              return (
                <tr
                  key={row.key}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    selectable && "cursor-pointer hover:bg-accent",
                    row.key === NO_DOMAIN_KEY && "bg-signal-warning-background/40",
                    activeKey === row.key && "bg-primary/5",
                  )}
                  onClick={selectable ? () => onSelect?.(row) : undefined}
                >
                  <td className="max-w-[340px] px-l py-s">
                    {selectable ? (
                      <button
                        type="button"
                        className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Filter the app on domain ${row.domain.label}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect?.(row);
                        }}
                      >
                        <DomainName row={row} currentKey={currentKey} labelName={labelName} />
                      </button>
                    ) : (
                      <DomainName row={row} currentKey={currentKey} labelName={labelName} />
                    )}
                  </td>
                  {posture && <td className="px-m py-s text-right"><Workspaces row={row} /></td>}
                  <td className="px-m py-s text-right font-numeric">{row.empty ? "—" : row.items}</td>
                  {posture ? (
                    <>
                      {PILLARS.map((pillar) => (
                        <td key={pillar} className="px-m py-s text-right"><Score value={row.empty ? null : row.pillars[pillar]} /></td>
                      ))}
                      <td className="px-m py-s text-right font-numeric">
                        {row.empty ? "—" : (
                          <span title={`${row.findings.critical} critical · ${row.findings.high} high · ${row.findings.medium} medium · ${row.findings.low} low`}>
                            {open} finding{open === 1 ? "" : "s"}
                            {row.findings.critical + row.findings.high > 0 && (
                              <span className="block text-100 text-signal-danger-foreground">
                                {row.findings.critical} critical · {row.findings.high} high
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-m py-s text-right font-numeric font-semibold">
                        {row.empty || !scored.length ? "—" : `${atTarget}/${scored.length}`}
                      </td>
                    </>
                  ) : row.empty ? (
                    <td colSpan={5} className="px-m py-s text-muted-foreground">No synchronized item</td>
                  ) : (
                    <>
                      <td className="px-m py-s"><Ratio value={row.coverage.described} /></td>
                      <td className="px-m py-s"><Ratio value={row.coverage.tagged} /></td>
                      <td className="px-m py-s"><Ratio value={row.coverage.endorsed} /></td>
                      <td className="px-m py-s"><Ratio value={row.coverage.labeled} /></td>
                      <td className="px-m py-s font-semibold">
                        {row.key === NO_DOMAIN_KEY
                          ? <span className="text-signal-warning-foreground">Assign to a domain first</span>
                          : curate
                            ? `${curate.label} (${curate.missing} item${curate.missing === 1 ? "" : "s"})`
                            : <span className="text-muted-foreground">Fully curated</span>}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}