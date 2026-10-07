import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  Clipboard,
  Download,
  FilterX,
  Flag,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { SavedViewsMenu } from "../components/SavedViewsMenu";
import { OffboardingDialog } from "../components/OffboardingDialog";
import { AccessEvidenceInspector } from "../components/AccessEvidenceInspector";
import { AccessWhatIf } from "../components/AccessWhatIf";
import { useDesktopEvidence } from "../use-desktop-evidence";
import { ACCESS_SOURCE_LABEL as SOURCE_LABEL, WHAT_IF_NOTICE } from "../access-what-if";
import { isFeatureEnabled } from "../feature-flags";
import {
  collectStoredPolicyEvidence, useStoredPolicyEvidence, type PolicyEvidenceLoader,
} from "../access-policy-evidence-source";
import {
  POLICY_DOCS, POLICY_LABELS, POLICY_LIMITATION,
} from "../../../rayfin/functions/src/policy-evidence-contract";
import {
  appendAccessReviewEvent,
  clearAccessReview,
  loadAccessReviewHistories,
  saveAccessReview,
  type AccessReviewDecision,
  type AccessReviewHistory,
  type AccessReviewHistoryEntry,
  type AccessReviewStatus,
} from "../access-reviews";
import {
  accessReviewEvidenceKey,
  accessReviewEvidenceKeys,
  serializeAccessReviewEvidence,
} from "../access-review-evidence";
import { accessRowsToCsv } from "../access-export";
import {
  ACCESS_EVIDENCE_LABEL,
  ACCESS_LAYER_LABEL,
  ACCESS_LEGEND,
  GRANT_ONLY_NOTICE,
  accessLayerSummary,
  accessLegendState,
  evaluatedAccessLayers,
  matchesAccessCoverage,
  parseAccessCoverageFilter,
  unknownAccessLayerSummary,
  withStoredPolicyEvidence,
  storedPolicySummary,
  type AccessCoverageFilter,
  type AccessLegendState,
} from "../access-coverage";
import {
  buildAccessReviewRows,
  highestRecordedGrant,
  selectAccessByItem,
  selectAccessByPrincipal,
  summarizeAccessReview,
  type AccessReviewRow,
} from "../governance";
import type { AccessLevel, Grant } from "../model";
import type { AtlasNavigation } from "../navigation";
import type { SavedViewFilters } from "../saved-views";
import { useAtlas } from "../store";
import { PageHeader } from "../components/PageHeader";
import { Card, PrincipalAvatar, SectionLabel, TypeGlyph, cn } from "../ui";

type AccessMode = "matrix" | "principals" | "what-if";
type OriginFilter = "all" | AccessReviewRow["origin"];
type RiskFilter =
  | "all"
  | "flagged"
  | "external"
  | "broad"
  | "servicePrincipal"
  | "admin"
  | "resolution";

const ACCESS_STYLE: Record<
  AccessLevel,
  { label: string; className: string }
> = {
  owner: {
    label: "Owner permission",
    className:
      "border-signal-warning-foreground/20 bg-signal-warning-background text-signal-warning-foreground",
  },
  edit: {
    label: "Edit",
    className:
      "border-status-healthy/30 bg-status-healthy/10 text-status-healthy",
  },
  view: {
    label: "View",
    className: "border-primary/25 bg-primary/10 text-brand-foreground",
  },
  none: {
    label: "No positive recorded grant",
    className: "border-border bg-muted text-muted-foreground",
  },
};

const ORIGIN_STYLE: Record<
  AccessReviewRow["origin"],
  { label: string; detail: string; className: string }
> = {
  workspace: {
    label: "Inherited",
    detail: "Workspace scope",
    className:
      "border-lineage-neutral/30 bg-lineage-neutral/10 text-muted-foreground",
  },
  item: {
    label: "Direct",
    detail: "Item scope",
    className:
      "border-lineage-upstream/30 bg-lineage-upstream/10 text-lineage-upstream",
  },
  mixed: {
    label: "Mixed",
    detail: "Workspace + item",
    className:
      "border-primary/25 bg-primary/10 text-brand-foreground",
  },
};

const FLAG_LABEL: Record<NonNullable<Grant["flag"]>, string> = {
  external: "External",
  broad: "Broad",
  servicePrincipal: "Service principal",
  admin: "Admin",
};

const REVIEW_STATUS: Record<
  AccessReviewStatus,
  { label: string; className: string }
> = {
  reviewed: {
    label: "Reviewed",
    className: "border-primary/25 bg-primary/10 text-brand-foreground",
  },
  accepted: {
    label: "Accepted",
    className:
      "border-status-healthy/30 bg-status-healthy/10 text-status-healthy",
  },
  needsAction: {
    label: "Needs action",
    className:
      "border-status-warning/30 bg-status-warning/10 text-status-warning",
  },
};

function AccessBadge({ level }: { level: AccessLevel }) {
  const style = ACCESS_STYLE[level];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-md border px-s py-xxs text-[length:var(--text-200)] font-semibold",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

function OriginBadge({ origin }: { origin: AccessReviewRow["origin"] }) {
  const style = ORIGIN_STYLE[origin];
  return (
    <span
      title={style.detail}
      className={cn(
        "inline-flex w-fit items-center rounded-md border px-s py-xxs text-[length:var(--text-200)] font-semibold",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

function isExternal(row: AccessReviewRow): boolean {
  return (
    row.principal?.kind === "guest" ||
    row.principal?.external === true ||
    row.flags.includes("external")
  );
}

function rowFlags(row: AccessReviewRow): NonNullable<Grant["flag"]>[] {
  if (!isExternal(row) || row.flags.includes("external")) return row.flags;
  return ["external", ...row.flags];
}

function hasRisk(row: AccessReviewRow): boolean {
  return rowFlags(row).length > 0 || row.principalResolution !== "resolved";
}

function matchesRisk(row: AccessReviewRow, risk: RiskFilter): boolean {
  if (risk === "all") return true;
  if (risk === "flagged") return hasRisk(row);
  if (risk === "resolution") return row.principalResolution !== "resolved";
  if (risk === "external") return isExternal(row);
  return row.flags.includes(risk);
}

function searchableText(row: AccessReviewRow): string {
  return [
    row.principalRef,
    row.principal?.email,
    row.principal?.kind,
    row.item.displayName,
    row.item.itemType,
    row.effectiveAccess,
    row.origin,
    ...row.flags,
    ...row.applicableGrants.flatMap((grant) => [
      grant.source,
      grant.roleName,
      grant.principalRef,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function downloadCsv(rows: AccessReviewRow[]) {
  const blob = new Blob([accessRowsToCsv(rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fabric-atlas-access-review-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PrincipalIdentity({ row }: { row: AccessReviewRow }) {
  return (
    <div className="flex min-w-0 items-center gap-s">
      <PrincipalAvatar
        name={row.principalRef}
        kind={row.principal?.kind ?? "group"}
        size={30}
      />
      <span className="min-w-0">
        <span className="block truncate text-300 font-semibold">
          {row.principalRef}
        </span>
        <span className="block truncate text-200 text-muted-foreground">
          {row.principal?.email ??
            (row.principalResolution === "resolved"
              ? row.principal?.kind
              : `${row.principalResolution} reference`)}
        </span>
      </span>
    </div>
  );
}

function ItemIdentity({ row }: { row: AccessReviewRow }) {
  return (
    <div className="flex min-w-0 items-center gap-s">
      <TypeGlyph type={row.item.itemType} size={30} />
      <span className="min-w-0">
        <span className="block truncate text-300 font-semibold">
          {row.item.displayName}
        </span>
        <span className="block text-200 text-muted-foreground">
          {row.item.itemType}
        </span>
      </span>
    </div>
  );
}

function FlagBadges({
  row,
  compact = false,
}: {
  row: AccessReviewRow;
  /** Rows omit the "no flags" text; the accessible row name still states it. */
  compact?: boolean;
}) {
  const flags = rowFlags(row);
  if (flags.length === 0 && row.principalResolution === "resolved") {
    return compact ? null : (
      <span className="text-200 text-muted-foreground">No recorded flags</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-xs">
      {flags.map((flag) => (
        <span
          key={flag}
          className={cn(
            "inline-flex rounded-md px-s py-xxs text-[length:var(--text-200)] font-medium",
            flag === "external" || flag === "broad"
              ? "bg-signal-warning-background text-signal-warning-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {FLAG_LABEL[flag]}
        </span>
      ))}
      {row.principalResolution !== "resolved" && (
        <span className="inline-flex rounded-md bg-signal-warning-background px-s py-xxs text-[length:var(--text-200)] font-medium text-signal-warning-foreground">
          {row.principalResolution === "ambiguous" ? "Ambiguous" : "Unresolved"}
        </span>
      )}
    </div>
  );
}

const LEGEND_TONE: Record<AccessLegendState, string> = {
  granted: "bg-signal-success-background text-signal-success-foreground",
  partial: "bg-signal-warning-background text-signal-warning-foreground",
  unknown: "bg-muted text-muted-foreground",
  denied: "bg-signal-danger-background text-signal-danger-foreground",
};

const LEGEND_ICON: Record<AccessLegendState, typeof Check> = {
  granted: CircleCheck,
  partial: CircleDashed,
  unknown: CircleHelp,
  denied: Ban,
};

function EvidenceBadge({
  state,
  title,
}: {
  state: AccessLegendState;
  title?: string;
}) {
  const Icon = LEGEND_ICON[state];
  return (
    <span
      title={title}
      className={cn(
        "inline-flex w-fit items-center gap-xs rounded-md px-s py-xxs text-[length:var(--text-200)] font-semibold",
        LEGEND_TONE[state],
      )}
    >
      <Icon className="icon-size-100 shrink-0" aria-hidden="true" />
      {ACCESS_LEGEND[state].label}
    </span>
  );
}

function RowEvidenceBadge({ row }: { row: AccessReviewRow }) {
  return (
    <EvidenceBadge
      state={accessLegendState(row.coverage.state)}
      title={`${ACCESS_EVIDENCE_LABEL[row.coverage.state]}. Evaluated: ${evaluatedAccessLayers(row.coverage)}. Unknown or incomplete layers: ${unknownAccessLayerSummary(row.coverage)}`}
    />
  );
}

/** The single page-level statement of what every access row can and cannot prove. */
function AccessEvidenceLegend() {
  return (
    <section
      aria-label="Access evidence legend"
      className="flex flex-col gap-xs border-t border-border bg-secondary/40 px-l py-s text-200 leading-300"
    >
      <dl className="flex flex-wrap gap-x-l gap-y-xs">
        {(Object.keys(ACCESS_LEGEND) as AccessLegendState[]).map((state) => (
          <div key={state} className="flex items-center gap-s">
            <dt>
              <EvidenceBadge state={state} />
            </dt>
            <dd className="text-muted-foreground">{ACCESS_LEGEND[state].description}</dd>
          </div>
        ))}
      </dl>
      <p className="text-foreground">{GRANT_ONLY_NOTICE}</p>
    </section>
  );
}

function CoverageEvidence({ row }: { row: AccessReviewRow }) {
  return (
    <div className="min-w-0 text-200">
      <span
        title={`Unknown or incomplete layers: ${unknownAccessLayerSummary(row.coverage)}`}
        className="inline-flex rounded-md border border-status-warning/30 bg-status-warning/10 px-s py-xxs font-semibold text-foreground"
      >
        {ACCESS_EVIDENCE_LABEL[row.coverage.state]}
      </span>
      <span className="mt-xs block break-words text-muted-foreground">
        Evaluated: {evaluatedAccessLayers(row.coverage)}
      </span>
    </div>
  );
}

function MatrixTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: AccessReviewRow[];
  selectedId: string | null;
  onSelect: (row: AccessReviewRow) => void;
}) {
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [focusIndex, setFocusIndex] = useState(0);
  if (rows.length === 0) return <EmptyResults />;
  const activeIndex = Math.min(focusIndex, rows.length - 1);
  const focusRow = (index: number) => {
    const nextIndex = Math.max(0, Math.min(rows.length - 1, index));
    setFocusIndex(nextIndex);
    rowRefs.current.get(rows[nextIndex].id)?.focus();
  };

  return (
    <div role="listbox" aria-label="Access review matrix">
      <div
        aria-hidden="true"
        className="atlas-row hidden grid-cols-4 gap-m border-b border-border bg-secondary/70 px-l text-200 font-semibold text-muted-foreground xl:grid"
      >
        <span>Principal</span>
        <span>Item</span>
        <span>Granted level</span>
        <span>Evidence</span>
      </div>
      <div className="divide-y divide-border">
        {rows.map((row, index) => {
          const selected = row.id === selectedId;
          const flags = rowFlags(row)
            .map((flag) => FLAG_LABEL[flag])
            .join(", ");
          return (
            <div
              key={row.id}
              ref={(element) => {
                if (element) rowRefs.current.set(row.id, element);
                else rowRefs.current.delete(row.id);
              }}
              role="option"
              tabIndex={index === activeIndex ? 0 : -1}
              aria-selected={selected}
              aria-label={`Review ${row.principalRef} access to ${row.item.displayName}. Highest recorded grant ${row.effectiveAccess}. Origin ${row.origin}. Flags ${flags || "not recorded"}. Restrictions not evaluated. Coverage ${ACCESS_EVIDENCE_LABEL[row.coverage.state]}. Evaluated layers: ${evaluatedAccessLayers(row.coverage)}. Unknown or incomplete layers: ${unknownAccessLayerSummary(row.coverage)}. ${row.applicableGrants.length} grants.`}
              onFocus={() => setFocusIndex(index)}
              onClick={() => {
                setFocusIndex(index);
                rowRefs.current.get(row.id)?.focus();
                onSelect(row);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusRow(index + 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusRow(index - 1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  focusRow(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  focusRow(rows.length - 1);
                } else if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(row);
                }
              }}
              className={cn(
                "atlas-row atlas-windowed-block grid w-full cursor-pointer gap-s px-l text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-2 xl:grid-cols-4 xl:items-center xl:gap-m",
                selected && "bg-primary/10",
              )}
            >
              <div className="min-w-0">
                <PrincipalIdentity row={row} />
                <div className="mt-xs empty:hidden"><FlagBadges row={row} compact /></div>
              </div>
              <div className="min-w-0">
                <ItemIdentity row={row} />
              </div>
              <div className="flex flex-wrap items-center gap-xs">
                <AccessBadge level={row.effectiveAccess} />
                <OriginBadge origin={row.origin} />
              </div>
              <div>
                <RowEvidenceBadge row={row} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyResults() {
  return (
    <div className="flex flex-col items-center gap-s px-l py-xxxl text-center">
      <span className="flex icon-size-700 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Search className="icon-size-400" aria-hidden="true" />
      </span>
      <h3 className="text-300 font-semibold">No recorded grant pairs match</h3>
      <p className="max-w-md text-200 leading-200 text-muted-foreground">
        Adjust the filters or clear them to restore the recorded grant ledger.
        Missing evidence does not establish absence of access or restrictions.
      </p>
    </div>
  );
}

function PrincipalGroups({
  rows,
  selectedId,
  expanded,
  searching,
  onOpenPack,
  onToggle,
  onSelect,
}: {
  rows: AccessReviewRow[];
  selectedId: string | null;
  expanded: Set<string>;
  searching: boolean;
  onOpenPack: (row: AccessReviewRow) => void;
  onToggle: (key: string) => void;
  onSelect: (row: AccessReviewRow) => void;
}) {
  const groups = useMemo(() => {
    const grouped = new Map<string, AccessReviewRow[]>();
    for (const row of rows) {
      const principalRows = grouped.get(row.principalKey) ?? [];
      principalRows.push(row);
      grouped.set(row.principalKey, principalRows);
    }
    return [...grouped.entries()].sort((left, right) =>
      left[1][0].principalRef.localeCompare(right[1][0].principalRef),
    );
  }, [rows]);

  if (groups.length === 0) return <EmptyResults />;

  return (
    <div className="divide-y divide-border">
      {groups.map(([principalKey, principalRows], index) => {
        const isExpanded = expanded.has(principalKey);
        const first = principalRows[0];
        const groupLayers = evaluatedAccessLayers({
          ...first.coverage,
          layers: principalRows.flatMap((row) => row.coverage.layers),
        });
        const strongest = highestRecordedGrant(
          principalRows.flatMap((row) => row.applicableGrants),
        );
        const regionId = `principal-access-group-${index}`;
        return (
          <section key={principalKey} className="atlas-windowed-group">
            <div className="flex items-center">
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={regionId}
                disabled={searching}
                onClick={() => onToggle(principalKey)}
                className="atlas-row flex min-w-0 flex-1 items-center gap-m px-l text-left transition-colors hover:bg-accent/60 disabled:cursor-default disabled:opacity-100"
              >
              {isExpanded ? (
                <ChevronDown
                  className="icon-size-200 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <ChevronRight
                  className="icon-size-200 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                <PrincipalIdentity row={first} />
                <span className="sr-only">
                  {" "}Evaluated layers across recorded pairs: {groupLayers}.
                  Restrictions not evaluated.
                </span>
              </div>
              <div className="hidden items-center gap-s xl:flex">
                <span className="text-200 text-muted-foreground">
                  {principalRows.length}{" "}
                  {principalRows.length === 1 ? "item" : "items"}
                </span>
                <span>
                  <span className="mb-xs block text-200 text-muted-foreground">Highest recorded grant</span>
                  <AccessBadge level={strongest} />
                </span>
              </div>
              </button>
              <button
                type="button"
                onClick={() => onOpenPack(first)}
                className="atlas-control mr-l rounded-lg border border-primary/30 bg-primary/10 px-m text-200 font-semibold text-brand-foreground hover:bg-primary/15"
              >
                {first.principal?.kind === "user" ||
                first.principal?.kind === "guest"
                  ? "Departure pack"
                  : "Removal impact"}
              </button>
            </div>

            {isExpanded && (
              <div
                id={regionId}
                className="border-t border-border bg-secondary/30 p-s"
              >
                <div className="grid gap-xs">
                  {principalRows.map((row) => {
                    const selected = row.id === selectedId;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`Review ${row.principalRef} access to ${row.item.displayName}. Highest recorded grant ${row.effectiveAccess}. Restrictions not evaluated. Evaluated layers: ${evaluatedAccessLayers(row.coverage)}. Unknown or incomplete layers: ${unknownAccessLayerSummary(row.coverage)}.`}
                        onClick={(event) => {
                          event.currentTarget.focus();
                          onSelect(row);
                        }}
                        className={cn(
                          "atlas-row grid w-full gap-s rounded-lg px-m text-left transition-colors hover:bg-accent sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-m",
                          selected && "bg-primary/10",
                        )}
                      >
                        <ItemIdentity row={row} />
                        <span className="flex flex-wrap items-center gap-xs">
                          <AccessBadge level={row.effectiveAccess} />
                          <OriginBadge origin={row.origin} />
                        </span>
                        <RowEvidenceBadge row={row} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function grantScope(grant: Grant, row: AccessReviewRow): string {
  return grant.itemFabricId
    ? `Item · ${row.item.displayName}`
    : "Workspace · inherited by item";
}

function ApplicableGrantEvidence({ row }: { row: AccessReviewRow }) {
  return (
    <section aria-labelledby="applicable-grants-heading" className="mt-m">
      <div className="flex flex-wrap items-end justify-between gap-s">
        <div>
          <h4 id="applicable-grants-heading" className="text-300 font-semibold">Applicable grants</h4>
          <p className="text-200 text-muted-foreground">
            {row.applicableGrants.length} contributing{" "}
            {row.applicableGrants.length === 1 ? "grant" : "grants"} ·{" "}
            {row.effectiveGrants.length} determine the highest recorded grant
          </p>
        </div>
        <FlagBadges row={row} />
      </div>
      <ol className="mt-m grid gap-s">
        {row.applicableGrants.map((grant, index) => {
          const highest = row.effectiveGrants.includes(grant);
          return (
            <li
              key={`${grant.source}-${grant.itemFabricId ?? "workspace"}-${index}`}
              className={cn(
                "min-w-0 rounded-lg border p-m",
                highest ? "border-primary/30 bg-primary/5" : "border-border bg-secondary/30",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-s">
                <span className="text-300 font-semibold">{SOURCE_LABEL[grant.source]}</span>
                <AccessBadge level={grant.accessLevel} />
              </div>
              <p className="mt-xs text-200 leading-300 text-muted-foreground">
                {grantScope(grant, row)} · Role: {grant.roleName ?? "Not recorded"}
              </p>
              <p className="mt-xs break-all text-200 leading-300 text-muted-foreground">
                Recorded source: {grant.source} · Reference: {grant.principalRef}
                {grant.itemFabricId ? ` · Item ID: ${grant.itemFabricId}` : ""}
              </p>
              {highest && (
                <span className="mt-s inline-flex items-center gap-xs rounded-md bg-primary/10 px-s py-xxs text-200 font-semibold text-brand-foreground">
                  <Check className="icon-size-100" aria-hidden="true" />
                  Determines highest grant
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function reviewSummary(
  row: AccessReviewRow,
  decision?: AccessReviewDecision,
  includePersonalReview = true,
): string {
  const flags = rowFlags(row);
  const grants = row.applicableGrants
    .map((grant) => {
      const effective = row.effectiveGrants.includes(grant)
        ? ", determines highest recorded grant"
        : "";
      return `- ${SOURCE_LABEL[grant.source]} (${grantScope(grant, row)}): ${
        ACCESS_STYLE[grant.accessLevel].label
      }${grant.roleName ? `, role ${grant.roleName}` : ""}${effective}`;
    })
    .join("\n");
  return [
    `Access review: ${row.principalRef} → ${row.item.displayName}`,
    `Highest recorded grant: ${ACCESS_STYLE[row.effectiveAccess].label}`,
    "Restrictions: Not evaluated",
    `Coverage: ${ACCESS_EVIDENCE_LABEL[row.coverage.state]}`,
    `Evaluated layers: ${evaluatedAccessLayers(row.coverage)}`,
    `Layer evidence: ${accessLayerSummary(row.coverage)}`,
    `Unknown or incomplete layers: ${unknownAccessLayerSummary(row.coverage)}`,
    `Stored policy context: ${storedPolicySummary(row.coverage)}`,
    `Workspace ID: ${row.coverage.workspaceId ?? "Not recorded"}`,
    `Snapshot ID: ${row.coverage.snapshotId ?? "Not recorded"}`,
    `Snapshot observed at: ${row.coverage.observedAt ?? "Not recorded"}`,
    GRANT_ONLY_NOTICE,
    `Origin: ${ORIGIN_STYLE[row.origin].label} (${ORIGIN_STYLE[row.origin].detail})`,
    `Principal resolution: ${row.principalResolution}`,
    `Flags: ${flags.length ? flags.map((flag) => FLAG_LABEL[flag]).join(", ") : "Not recorded"}`,
    `Contributing grants: ${row.applicableGrants.length}`,
    ...(includePersonalReview ? [`Review decision: ${
      decision
        ? decision.needsReview
          ? `Needs review (previously ${REVIEW_STATUS[decision.status].label})`
          : REVIEW_STATUS[decision.status].label
        : "Not reviewed"
    }`] : []),
    ...(includePersonalReview && decision?.reviewedAt
      ? [`Reviewed at: ${new Date(decision.reviewedAt).toLocaleString()}`]
      : []),
    ...(includePersonalReview && decision?.note ? [`Review note: ${decision.note}`] : []),
    "",
    "Applicable grants (additive; highest recorded grant wins):",
    grants,
  ].join("\n");
}

function historyStatusLabel(entry: AccessReviewHistoryEntry): string {
  return entry.status === "cleared"
    ? "Cleared"
    : REVIEW_STATUS[entry.status].label;
}

export function AccessReviewDetailPanel({
  row,
  review,
  reviewsLoading,
  saving,
  reviewError,
  onSaveDecision,
  onClearDecision,
  onClose,
  onSimulate,
  readOnly = false,
  noteOverride,
  onNoteChange,
}: {
  row: AccessReviewRow;
  review?: AccessReviewHistory;
  reviewsLoading: boolean;
  saving: boolean;
  reviewError?: string;
  onSaveDecision: (
    status: AccessReviewStatus,
    note: string,
  ) => Promise<void>;
  onClearDecision: () => Promise<void>;
  onClose: () => void;
  onSimulate?: () => void;
  readOnly?: boolean;
  noteOverride?: string;
  onNoteChange?: (note: string) => void;
}) {
  const decision = review?.decision;
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState(decision?.note ?? "");

  const copy = async () => {
    const summary = reviewSummary(row, decision, !readOnly);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Copy the access review summary", summary);
    }
  };

  return (
    <section
      aria-label="Access evidence"
      className="xl:sticky xl:top-l"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
    <Card className="overflow-hidden">
      <div className="atlas-page-header flex items-start justify-between gap-m border-b border-border bg-secondary/60 p-l">
        <div className="min-w-0">
          <SectionLabel>Access evidence</SectionLabel>
          <h2 aria-label="Review detail" className="mt-xs break-words text-400 font-semibold">
            {row.principalRef} → {row.item.displayName}
          </h2>
        </div>
        <button
          type="button"
          id="access-evidence-close"
          aria-label="Close review detail"
          onClick={onClose}
          className="flex min-h-[var(--atlas-touch-target)] min-w-[var(--atlas-touch-target)] shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X className="icon-size-200" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-l p-l">
        <p className="text-200 leading-300 text-muted-foreground">
          {row.principal?.kind ?? row.principalResolution} · {row.item.itemType} · Recorded grant pair
        </p>

        <section aria-labelledby="granted-permissions-heading">
          <h3 id="granted-permissions-heading" className="text-300 font-semibold">
            1. Granted permissions
          </h3>
          <div className="mt-s grid grid-cols-2 gap-s">
          <div className="rounded-lg border border-border bg-secondary/40 p-m">
            <div className="text-200 text-muted-foreground">
              Highest recorded grant
            </div>
            <div className="mt-s">
              <AccessBadge level={row.effectiveAccess} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/40 p-m">
            <div className="text-200 text-muted-foreground">Grant origin</div>
            <div className="mt-s">
              <OriginBadge origin={row.origin} />
            </div>
          </div>
          </div>
          <ul className="mt-s grid gap-xs text-200 text-muted-foreground">
            {row.coverage.layers.filter((layer) =>
              layer.layer === "workspace-grants" || layer.layer === "item-grants",
            ).map((layer) => (
              <li key={layer.layer}>
                <span className="font-semibold">{ACCESS_LAYER_LABEL[layer.layer]}: </span>
                {ACCESS_EVIDENCE_LABEL[layer.state]}
                {layer.source ? ` (${layer.source})` : ""}. {layer.reason}
              </li>
            ))}
          </ul>
          <ApplicableGrantEvidence row={row} />
        </section>

        <section aria-labelledby="restriction-evidence-heading">
          <h3 id="restriction-evidence-heading" className="text-300 font-semibold">
            2. Restriction evidence
          </h3>
          <p className="mt-xs text-200 text-muted-foreground">Not evaluated</p>
          <ul className="mt-s grid gap-s">
            {row.coverage.layers.filter((layer) =>
              layer.layer !== "workspace-grants" && layer.layer !== "item-grants",
            ).map((layer) => (
              <li key={layer.layer} className="rounded-lg border border-border p-m text-200">
                <div className="flex flex-wrap justify-between gap-s">
                  <span className="font-semibold">{ACCESS_LAYER_LABEL[layer.layer]}</span>
                  <span className="text-muted-foreground">{ACCESS_EVIDENCE_LABEL[layer.state]}</span>
                </div>
                <p className="mt-xs leading-300 text-muted-foreground">{layer.reason}</p>
              </li>
            ))}
          </ul>
          <div className="mt-s flex flex-wrap gap-m text-200">
            <a
              href="https://learn.microsoft.com/en-us/fabric/onelake/security/data-access-control-model"
              target="_blank"
              rel="noopener noreferrer"
              className="atlas-control inline-flex items-center text-brand-foreground underline"
            >
              OneLake portal review guidance
            </a>
            <a
              href="https://purview.microsoft.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="atlas-control inline-flex items-center text-brand-foreground underline"
            >
              Open Microsoft Purview
            </a>
          </div>
        </section>

        <section aria-labelledby="access-assessment-heading" className="rounded-lg border border-status-warning/30 bg-status-warning/10 p-m">
          <h3 id="access-assessment-heading" className="text-300 font-semibold">
            3. Assessment
          </h3>
          <div className="mt-s"><CoverageEvidence row={row} /></div>
          <p className="mt-s text-200 leading-300">{GRANT_ONLY_NOTICE}</p>
          <p className="mt-s text-200 leading-300 text-muted-foreground">
            Unknown or incomplete layers: {unknownAccessLayerSummary(row.coverage)}
          </p>
          <dl className="mt-s grid gap-xs text-200 text-muted-foreground">
            <div>
              <dt className="font-semibold">Workspace ID</dt>
              <dd className="break-all">{row.coverage.workspaceId ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Snapshot ID</dt>
              <dd className="break-all">{row.coverage.snapshotId ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt className="font-semibold">Snapshot observed at</dt>
              <dd>{row.coverage.observedAt ?? "Not recorded"}</dd>
            </div>
          </dl>
          <p className="mt-s text-200 leading-300 text-muted-foreground">
            Other data-plane and row/column restrictions are outside this grant-only assessment.
          </p>
          {onSimulate && !readOnly && (
            <button
              type="button"
              onClick={onSimulate}
              className="atlas-control mt-m rounded-lg border border-primary/30 bg-primary/5 px-m text-300 font-semibold text-brand-foreground hover:bg-primary/10"
            >
              Simulate grant removal
            </button>
          )}
        </section>

        {row.coverage.policyEvidence?.length ? (
          <section aria-labelledby="stored-policy-context-heading">
            <h3 id="stored-policy-context-heading" className="text-300 font-semibold">Stored workspace policy context</h3>
            <p className="mt-s text-200 leading-300">{POLICY_LIMITATION}</p>
            <ul className="mt-m grid gap-s">
              {row.coverage.policyEvidence.map((record) => (
                <li key={record.id} className="rounded-lg border border-border p-m text-200 leading-300">
                  <p className="font-semibold">{POLICY_LABELS[record.kind]} · {record.coverage}</p>
                  {record.inboundPublicAction && <p>Inbound public-network default: {record.inboundPublicAction}</p>}
                  {record.outboundPublicAction && <p>Outbound public-network default: {record.outboundPublicAction}</p>}
                  {record.externalSharesBypassAction && <p>External-share network bypass default: {record.externalSharesBypassAction}</p>}
                  <p>Observation: {record.observedAt ?? "Not observed"} · Attempt: {record.attemptedAt}</p>
                  <p>Reason: {record.reason} · Identity: {record.collectorIdentity}</p>
                  <a href={POLICY_DOCS[record.kind]} target="_blank" rel="noopener noreferrer"
                    className="atlas-control inline-flex items-center text-brand-foreground underline">Verified source contract</a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!readOnly && (
        <section
          aria-labelledby="review-decision-heading"
          className="rounded-xl border border-border bg-secondary/30 p-m"
        >
          <div className="flex flex-wrap items-start justify-between gap-s">
            <div>
              <h3
                id="review-decision-heading"
                className="text-300 font-semibold"
              >
                Review decision
              </h3>
              <p className="mt-xs text-200 text-muted-foreground">
                {reviewsLoading
                  ? "Loading current decision…"
                  : decision
                    ? decision.needsReview
                      ? `Previous decision from ${new Date(decision.reviewedAt).toLocaleString()}`
                      : `Reviewed ${new Date(decision.reviewedAt).toLocaleString()}`
                    : "Not reviewed yet"}
              </p>
            </div>
            {decision && (
              <span
                className={cn(
                  "inline-flex rounded-md border px-s py-xxs text-200 font-semibold",
                  decision.needsReview
                    ? "border-status-warning/30 bg-status-warning/10 text-status-warning"
                    : REVIEW_STATUS[decision.status].className,
                )}
              >
                {decision.needsReview
                  ? "Needs review"
                  : REVIEW_STATUS[decision.status].label}
              </span>
            )}
          </div>

          {decision?.needsReview && (
            <div
              className="mt-m rounded-lg border border-status-warning/30 bg-status-warning/10 p-m"
              role="status"
            >
              <div className="flex gap-s">
                <AlertTriangle
                  className="mt-xxs icon-size-200 shrink-0 text-status-warning"
                  aria-hidden="true"
                />
                <p className="text-200 leading-300 text-muted-foreground">
                  {decision.source === "legacy"
                    ? "This legacy decision has no recorded permission evidence. Review the current grants before relying on it."
                    : "The recorded grant evidence changed after this decision. Review the current grants before relying on it."}
                </p>
              </div>
            </div>
          )}

          <label
            htmlFor="access-review-note"
            className="mt-m mb-xs block text-200 font-semibold text-muted-foreground"
          >
            Review note (optional)
          </label>
          <textarea
            id="access-review-note"
            value={noteOverride ?? note}
            maxLength={240}
            rows={3}
            disabled={saving}
            onChange={(event) => {
              setNote(event.target.value);
              onNoteChange?.(event.target.value);
            }}
            placeholder="Capture a short rationale or follow-up…"
            className="w-full resize-y rounded-lg border border-input bg-card px-m py-s text-300 leading-300 text-foreground placeholder:text-muted-foreground disabled:opacity-60"
          />
          <span className="mt-xs block text-right text-200 text-muted-foreground">
            {(noteOverride ?? note).length}/240
          </span>

          <div
            className="mt-m grid gap-s sm:grid-cols-3"
            role="group"
            aria-label="Review decision status"
          >
            {(Object.keys(REVIEW_STATUS) as AccessReviewStatus[]).map(
              (status) => {
                const statusMeta = REVIEW_STATUS[status];
                return (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={
                      !decision?.needsReview && decision?.status === status
                    }
                    disabled={saving || reviewsLoading}
                    onClick={() => void onSaveDecision(status, noteOverride ?? note)}
                    className={cn(
                      "atlas-control inline-flex items-center justify-center rounded-lg border px-m text-300 font-semibold transition-colors hover:bg-accent disabled:opacity-60",
                      !decision?.needsReview && decision?.status === status
                        ? statusMeta.className
                        : "border-border bg-card text-foreground",
                    )}
                  >
                    {statusMeta.label}
                  </button>
                );
              },
            )}
          </div>

          <div className="mt-s flex min-h-m items-center justify-between gap-s">
            <span
              className={cn(
                "text-200",
                reviewError
                  ? "text-status-failing"
                  : "text-muted-foreground",
              )}
              role={reviewError ? "alert" : "status"}
            >
              {reviewError ??
                (saving
                  ? "Saving review decision…"
                  : decision?.needsReview
                    ? "Choose a status to review the current evidence."
                    : decision
                    ? "Decision is saved for your account."
                    : "Choose a status to save this review.")}
            </span>
            {decision && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void onClearDecision()}
                className="atlas-control shrink-0 rounded-md px-s py-xs text-200 font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                Clear decision
              </button>
            )}
          </div>
        </section>

        )}

        {!readOnly && review && review.history.length > 0 && (
          <section aria-labelledby="review-history-heading">
            <h3
              id="review-history-heading"
              className="text-300 font-semibold"
            >
              Personal review history
            </h3>
            <p className="mt-xs text-200 text-muted-foreground">
              Decisions and clears are retained for your account, newest first.
            </p>
            <ol className="mt-m grid gap-s">
              {review.history.map((entry) => (
                <li
                  key={`${entry.source}:${entry.id}`}
                  className="rounded-lg border border-border bg-secondary/30 p-m"
                >
                  <div className="flex flex-wrap items-start justify-between gap-s">
                    <div>
                      <div className="text-300 font-semibold">
                        {historyStatusLabel(entry)}
                      </div>
                      <div className="mt-xxs text-200 text-muted-foreground">
                        {new Date(entry.occurredAt).toLocaleString()}
                        {entry.source === "legacy" ? " · Legacy record" : ""}
                      </div>
                    </div>
                    {!entry.evidenceKey && (
                      <span className="rounded-md border border-status-warning/30 bg-status-warning/10 px-s py-xxs text-200 font-semibold text-status-warning">
                        Evidence not recorded
                      </span>
                    )}
                  </div>
                  {entry.note && (
                    <p className="mt-s whitespace-pre-wrap text-200 leading-300 text-muted-foreground">
                      {entry.note}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {row.principalResolution !== "resolved" && (
          <div
            role="status"
            className="rounded-lg border border-status-warning/30 bg-status-warning/10 p-m"
          >
            <div className="flex gap-s">
              <AlertTriangle
                className="mt-xxs icon-size-200 shrink-0 text-status-warning"
                aria-hidden="true"
              />
              <div>
                <div className="text-300 font-semibold text-status-warning">
                  {row.principalResolution === "ambiguous"
                    ? "Principal reference is ambiguous"
                    : "Principal reference is unresolved"}
                </div>
                <p className="mt-xs text-200 leading-200 text-muted-foreground">
                  {row.principalResolution === "ambiguous"
                    ? `${row.principalCandidates.length} principals match this recorded reference.`
                    : "No principal inventory record matches this recorded reference."}
                </p>
              </div>
            </div>
          </div>
        )}

        <section aria-labelledby="item-context-heading">
          <h3
            id="item-context-heading"
            className="text-300 font-semibold"
          >
            Item context
          </h3>
          <dl className="mt-s grid gap-s rounded-lg border border-border p-m text-200">
            <div className="flex justify-between gap-m">
              <dt className="text-muted-foreground">Type</dt>
              <dd className="text-right font-medium">{row.item.itemType}</dd>
            </div>
            <div className="flex justify-between gap-m">
              <dt className="text-muted-foreground">Documented owner</dt>
              <dd className="text-right font-medium">
                {row.item.ownerName ??
                  (row.item.ownerMetadataAvailable === false
                    ? "Not collected"
                    : "Not recorded")}
              </dd>
            </div>
            <div className="flex justify-between gap-m">
              <dt className="text-muted-foreground">Sensitivity</dt>
              <dd className="text-right font-medium">
                {row.item.sensitivity ??
                  (row.item.sensitivityLabelId
                    ? "Label applied"
                    : row.item.sensitivityMetadataAvailable === false
                      ? "Not collected"
                      : "Not labeled")}
              </dd>
            </div>
          </dl>
          {row.item.description && (
            <p className="mt-s text-200 leading-300 text-muted-foreground">
              {row.item.description}
            </p>
          )}
        </section>

        <button
          type="button"
          onClick={() => void copy()}
          className="atlas-control inline-flex items-center justify-center gap-s rounded-lg bg-primary px-l text-300 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          {copied ? (
            <Check className="icon-size-200" aria-hidden="true" />
          ) : (
            <Clipboard className="icon-size-200" aria-hidden="true" />
          )}
          {copied ? "Summary copied" : readOnly ? "Copy grant evidence" : "Copy review summary"}
        </button>
      </div>
    </Card>
    </section>
  );
}

export interface AccessViewProps {
  initialItemId?: string;
  initialPrincipalId?: string;
  initialFilters?: SavedViewFilters;
  onStateChange?: (navigation: AtlasNavigation) => void;
  policyEvidenceLoader?: PolicyEvidenceLoader;
}

export function AccessView({
  initialItemId,
  initialPrincipalId,
  initialFilters,
  onStateChange,
  policyEvidenceLoader,
}: AccessViewProps = {}) {
  const {
    data,
    currentUser,
    isPreview,
    savedViews,
    savedViewsLoading,
    savedViewsError,
    addSavedView,
    removeSavedView,
    canSync,
  } = useAtlas();
  const policyEnabled = isFeatureEnabled("fabric-policies");
  const [policyRefresh, setPolicyRefresh] = useState(0);
  const [policyCollecting, setPolicyCollecting] = useState(false);
  const [policyMessage, setPolicyMessage] = useState("");
  const policyState = useStoredPolicyEvidence(
    data.workspace.fabricId, data.workspace.snapshotId,
    policyEnabled && (!isPreview || !!policyEvidenceLoader), policyEvidenceLoader, policyRefresh,
  );
  const rows = useMemo(
    () =>
      buildAccessReviewRows(data).filter(
        (row) => row.effectiveAccess !== "none",
      ).map((row) => ({
        ...row, coverage: withStoredPolicyEvidence(row.coverage, policyState.records),
      })),
    [data, policyState.records],
  );
  const summary = useMemo(() => summarizeAccessReview(rows), [rows]);
  const reviewScopeKey = `${isPreview ? "preview" : "live"}\u0000${data.workspace.fabricId}\u0000${currentUser.id}`;
  const reviewLoadKey = useMemo(
    () =>
      [
        reviewScopeKey,
        ...rows.map(
          (row) => `${row.id}\u0000${serializeAccessReviewEvidence(row)}`,
        ),
      ].join("\u0001"),
    [reviewScopeKey, rows],
  );
  const [mode, setMode] = useState<AccessMode>(
    initialFilters?.mode === "what-if" ? "what-if" :
    initialFilters?.mode === "principals" ||
      (initialPrincipalId && !initialItemId)
      ? "principals"
      : "matrix",
  );
  const desktopEvidence = useDesktopEvidence();
  const [evidenceOpen, setEvidenceOpen] = useState(
    !(initialPrincipalId && !initialItemId && initialFilters?.mode !== "what-if"),
  );
  const whatIfButtonRef = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState(
    typeof initialFilters?.search === "string" ? initialFilters.search : "",
  );
  const [accessLevel, setAccessLevel] = useState<"all" | AccessLevel>(
    typeof initialFilters?.accessLevel === "string"
      ? (initialFilters.accessLevel as "all" | AccessLevel)
      : "all",
  );
  const [origin, setOrigin] = useState<OriginFilter>(
    typeof initialFilters?.origin === "string"
      ? (initialFilters.origin as OriginFilter)
      : "all",
  );
  const [risk, setRisk] = useState<RiskFilter>(
    typeof initialFilters?.risk === "string"
      ? (initialFilters.risk as RiskFilter)
      : "all",
  );
  const [coverageFilter, setCoverageFilter] = useState<AccessCoverageFilter>(
    () => parseAccessCoverageFilter(initialFilters?.coverage),
  );
  const reviewTriggerRef = useRef<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null | undefined>(
    undefined,
  );
  const [expandedPrincipals, setExpandedPrincipals] = useState<Set<string>>(
    () => new Set(),
  );
  const [reviewState, setReviewState] = useState<{
    key: string;
    histories: AccessReviewHistory[];
  }>(() => ({
    key: isPreview ? reviewLoadKey : "",
    histories: [],
  }));
  const [reviewErrorState, setReviewErrorState] = useState<{
    key: string;
    message?: string;
  }>(() => ({ key: reviewLoadKey }));
  const [reviewOperationId, setReviewOperationId] = useState<string | null>(
    null,
  );
  const [reviewNoteDraft, setReviewNoteDraft] = useState<{ key: string; note: string } | null>(null);
  const [offboardingPrincipalId, setOffboardingPrincipalId] = useState(
    initialFilters?.mode !== "what-if" && initialPrincipalId && !initialItemId ? initialPrincipalId : "",
  );

  useEffect(() => {
    if (isPreview) return;
    let active = true;
    void (async () => {
      try {
        const evidence = await accessReviewEvidenceKeys(rows);
        if (!active) return;
        const loaded = await loadAccessReviewHistories(
          false,
          data.workspace.fabricId,
          currentUser.id,
          evidence,
        );
        if (active) {
          setReviewState({ key: reviewLoadKey, histories: loaded });
          setReviewErrorState({ key: reviewLoadKey });
        }
      } catch (error) {
        if (active) {
          setReviewState({ key: reviewLoadKey, histories: [] });
          setReviewErrorState({
            key: reviewLoadKey,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [
    currentUser.id,
    data.workspace.fabricId,
    isPreview,
    reviewLoadKey,
    rows,
  ]);
  const reviewsLoading = !isPreview && reviewState.key !== reviewLoadKey;
  const reviewError =
    reviewErrorState.key === reviewLoadKey
      ? reviewErrorState.message
      : undefined;

  const focusRows = useMemo(() => {
    let candidates = rows;
    if (initialItemId) {
      candidates = selectAccessByItem(candidates, initialItemId);
    }
    if (initialPrincipalId) {
      candidates = selectAccessByPrincipal(candidates, initialPrincipalId);
    }
    return candidates;
  }, [initialItemId, initialPrincipalId, rows]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!normalizedSearch ||
            searchableText(row).includes(normalizedSearch)) &&
          (accessLevel === "all" || row.effectiveAccess === accessLevel) &&
          (origin === "all" || row.origin === origin) &&
          matchesRisk(row, risk) &&
          matchesAccessCoverage(row.coverage, coverageFilter),
      ),
    [accessLevel, coverageFilter, normalizedSearch, origin, risk, rows],
  );
  const effectiveExpandedPrincipals = useMemo(
    () =>
      normalizedSearch
        ? new Set(filteredRows.map((row) => row.principalKey))
        : expandedPrincipals,
    [expandedPrincipals, filteredRows, normalizedSearch],
  );

  const focusedId =
    selectedId === undefined &&
    (initialItemId || initialPrincipalId) &&
    focusRows[0]
      ? focusRows[0].id
      : null;
  const requestedSelectedId =
    selectedId === undefined ? focusedId : selectedId;
  const visibleSelectedId =
    requestedSelectedId &&
    filteredRows.some((row) => row.id === requestedSelectedId)
      ? requestedSelectedId
      : null;
  const selectedRow = rows.find((row) => row.id === visibleSelectedId);
  const selectRow = (row: AccessReviewRow) => {
    reviewTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelectedId(row.id);
    setEvidenceOpen(true);
  };
  const returnEvidenceFocus = () => {
    if (reviewTriggerRef.current?.isConnected) reviewTriggerRef.current.focus();
    else whatIfButtonRef.current?.focus();
  };
  const closeEvidence = () => {
    setEvidenceOpen(false);
    if (mode !== "what-if") setSelectedId(null);
    returnEvidenceFocus();
  };
  useEffect(() => {
    if (visibleSelectedId && evidenceOpen && mode !== "what-if" && desktopEvidence) {
      document.getElementById("access-evidence-close")?.focus();
    }
  }, [desktopEvidence, evidenceOpen, mode, visibleSelectedId]);
  const startWhatIf = () => {
    setMode("what-if");
    setEvidenceOpen(desktopEvidence);
    setOffboardingPrincipalId("");
    whatIfButtonRef.current?.focus();
  };
  useEffect(() => {
    onStateChange?.({
      tab: "access",
      focus: {
        requestId: "access-view-state",
        itemId: selectedRow?.itemId,
        principalId:
          selectedRow?.principalId ??
          selectedRow?.principalRef ??
          (offboardingPrincipalId || undefined),
        query: search.trim() || undefined,
        filters: {
          mode,
          search,
          accessLevel,
          origin,
          risk,
          coverage: coverageFilter,
        },
      },
    });
  }, [
    accessLevel,
    coverageFilter,
    mode,
    onStateChange,
    origin,
    risk,
    search,
    selectedRow,
    offboardingPrincipalId,
  ]);
  const activeFilters =
    search !== "" ||
    accessLevel !== "all" ||
    origin !== "all" ||
    risk !== "all" ||
    coverageFilter !== "all";
  const flaggedCount = rows.filter(hasRisk).length;
  const reviewsByRowKey = useMemo(
    () => {
      const byKey = new Map<string, AccessReviewHistory>();
      const histories =
        reviewState.key === reviewLoadKey ? reviewState.histories : [];
      for (const review of histories) {
        byKey.set(review.rowKey, review);
      }
      return byKey;
    },
    [reviewLoadKey, reviewState],
  );
  const reviewNoteKey = `${reviewScopeKey}:${selectedRow?.id ?? ""}:${selectedRow
    ? reviewsByRowKey.get(selectedRow.id)?.history[0]?.id ?? "not-reviewed" : ""}`;

  const saveDecision = async (
    row: AccessReviewRow,
    status: AccessReviewStatus,
    note: string,
  ) => {
    setReviewOperationId(row.id);
    setReviewErrorState({ key: reviewLoadKey });
    try {
      const evidenceKey = await accessReviewEvidenceKey(row);
      const evidence = new Map([[row.id, evidenceKey]]);
      const saved = await saveAccessReview(
        isPreview,
        data.workspace.fabricId,
        currentUser.id,
        {
          rowKey: row.id,
          itemFabricId: row.itemId,
          principalRef: row.principalRef,
          status,
          evidenceKey,
          note,
        },
      );
      setReviewState((previous) => ({
        key: reviewLoadKey,
        histories: appendAccessReviewEvent(
          previous.key === reviewLoadKey ? previous.histories : [],
          saved,
          evidence,
        ),
      }));
    } catch (error) {
      setReviewErrorState({
        key: reviewLoadKey,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setReviewOperationId(null);
    }
  };

  const clearDecision = async (row: AccessReviewRow) => {
    const current = reviewsByRowKey.get(row.id)?.decision;
    if (!current) return;
    setReviewOperationId(row.id);
    setReviewErrorState({ key: reviewLoadKey });
    try {
      const evidenceKey = await accessReviewEvidenceKey(row);
      const evidence = new Map([[row.id, evidenceKey]]);
      const cleared = await clearAccessReview(
        isPreview,
        data.workspace.fabricId,
        currentUser.id,
        {
          rowKey: row.id,
          itemFabricId: row.itemId,
          principalRef: row.principalRef,
          evidenceKey,
        },
      );
      setReviewState((previous) => ({
        key: reviewLoadKey,
        histories: appendAccessReviewEvent(
          previous.key === reviewLoadKey ? previous.histories : [],
          cleared,
          evidence,
        ),
      }));
    } catch (error) {
      setReviewErrorState({
        key: reviewLoadKey,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setReviewOperationId(null);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setAccessLevel("all");
    setOrigin("all");
    setRisk("all");
    setCoverageFilter("all");
  };

  const togglePrincipal = (principalKey: string) => {
    setExpandedPrincipals((previous) => {
      const next = new Set(previous);
      if (next.has(principalKey)) next.delete(principalKey);
      else next.add(principalKey);
      return next;
    });
  };

  const metrics = [
    {
      label: "Unique principals",
      value: summary.principals,
      detail: "Resolved and recorded identities",
      icon: Users,
      className: "bg-primary/10 text-brand-foreground",
    },
    {
      label: "Grant pairs",
      value: summary.rows,
      detail: `${summary.items} workspace items`,
      icon: ShieldCheck,
      className: "bg-signal-success-background text-signal-success-foreground",
    },
    {
      label: "External / flagged",
      value: flaggedCount,
      detail: "Pairs requiring attention",
      icon: Flag,
      className:
        flaggedCount > 0
          ? "bg-signal-warning-background text-signal-warning-foreground"
          : "bg-muted text-muted-foreground",
    },
  ];

  return (
    <div className="atlas-content-frame flex flex-col gap-l p-l sm:p-xxl">
      <Card className="overflow-hidden border-primary/25">
        <PageHeader title="Access Review" purpose="Review recorded grants or try a local removal scenario."
          className="border-b border-border"
          actions={<div
            className="inline-flex max-w-full flex-wrap self-start rounded-lg border border-border bg-card p-xs shadow-sm"
            role="group"
            aria-label="Access review mode"
          >
            <button
              type="button"
              aria-pressed={mode === "matrix"}
              onClick={() => setMode("matrix")}
              className={cn(
                "atlas-control rounded-md px-l text-300 font-semibold transition-colors",
                mode === "matrix"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              Review matrix
            </button>
            <button
              type="button"
              aria-pressed={mode === "principals"}
              onClick={() => setMode("principals")}
              className={cn(
                "atlas-control rounded-md px-l text-300 font-semibold transition-colors",
                mode === "principals"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              Principals
            </button>
            <button
              type="button"
              ref={whatIfButtonRef}
              aria-pressed={mode === "what-if"}
              aria-describedby="access-what-if-reason"
              onClick={startWhatIf}
              className={cn(
                "atlas-control rounded-md px-l text-300 font-semibold transition-colors",
                mode === "what-if"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              What-if
            </button>
          </div>}
        />
        {/* The What-if limits stay as its accessible description; the What-if panel shows them visibly. */}
        <p id="access-what-if-reason" className="sr-only">
          {WHAT_IF_NOTICE}
        </p>

        <dl className="flex flex-wrap gap-x-xl gap-y-s px-l py-s">
          {metrics.map((metric) => {
            return (
              <div key={metric.label} className="flex items-baseline gap-s" title={metric.detail}>
                <dt className="text-200 text-muted-foreground">{metric.label}</dt>
                <dd className="font-numeric text-300 font-semibold">{metric.value}</dd>
              </div>
            );
          })}
        </dl>
      </Card>

      <Card className="overflow-hidden">
        <div className="atlas-toolbar border-b border-border bg-secondary/40 px-l py-m">
          <div className="flex flex-wrap items-end gap-m">
            <label className="min-w-0 flex-1 basis-full lg:basis-auto">
              <span className="mb-xs block text-200 font-semibold text-muted-foreground">
                Search
              </span>
              <span className="atlas-control flex items-center gap-s rounded-lg border border-input bg-card px-m">
                <Search
                  className="icon-size-200 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Principal, item, type, grant source…"
                  aria-label="Search access reviews"
                  className="min-w-0 flex-1 bg-transparent py-s text-300 text-foreground placeholder:text-muted-foreground"
                />
              </span>
            </label>

            <label className="min-w-0">
              <span className="mb-xs block text-200 font-semibold text-muted-foreground">
                Granted level
              </span>
              <select
                value={accessLevel}
                onChange={(event) =>
                  setAccessLevel(event.target.value as "all" | AccessLevel)
                }
                className="atlas-control w-full rounded-lg border border-input bg-card px-m text-300 text-foreground xl:w-auto"
              >
                <option value="all">All levels</option>
                <option value="owner">Owner permission</option>
                <option value="edit">Edit</option>
                <option value="view">View</option>
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-xs block text-200 font-semibold text-muted-foreground">
                Origin
              </span>
              <select
                value={origin}
                onChange={(event) =>
                  setOrigin(event.target.value as OriginFilter)
                }
                className="atlas-control w-full rounded-lg border border-input bg-card px-m text-300 text-foreground xl:w-auto"
              >
                <option value="all">All origins</option>
                <option value="workspace">Workspace / inherited</option>
                <option value="item">Item / direct</option>
                <option value="mixed">Mixed</option>
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-xs block text-200 font-semibold text-muted-foreground">
                Risk flag
              </span>
              <select
                value={risk}
                onChange={(event) =>
                  setRisk(event.target.value as RiskFilter)
                }
                className="atlas-control w-full rounded-lg border border-input bg-card px-m text-300 text-foreground xl:w-auto"
              >
                <option value="all">All flags</option>
                <option value="flagged">Any flag or warning</option>
                <option value="external">External</option>
                <option value="broad">Broad</option>
                <option value="servicePrincipal">Service principal</option>
                <option value="admin">Admin</option>
                <option value="resolution">Resolution warning</option>
              </select>
            </label>

            <label className="min-w-0">
              <span className="mb-xs block text-200 font-semibold text-muted-foreground">
                Evidence coverage
              </span>
              <select
                value={coverageFilter}
                onChange={(event) => setCoverageFilter(parseAccessCoverageFilter(event.target.value))}
                aria-describedby="access-coverage-help"
                className="atlas-control w-full rounded-lg border border-input bg-card px-m text-300 text-foreground xl:w-auto"
              >
                <option value="all">All evidence states</option>
                <option value="observed">Includes observed grants</option>
                <option value="partial">Partial assessment</option>
                <option value="unavailable">Includes unavailable evidence</option>
                <option value="unsupported">Includes unsupported layers</option>
                <option value="denied">Includes denied evidence reads</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-s">
              {mode !== "what-if" && <SavedViewsMenu
                views={savedViews.filter((view) => view.section === "access")}
                loading={savedViewsLoading}
                error={savedViewsError}
                activeSection="access"
                currentFilters={{
                  mode,
                  search,
                  accessLevel,
                  origin,
                  risk,
                  coverage: coverageFilter,
                }}
                onCreate={addSavedView}
                onApply={(view) => {
                  setMode(
                    view.filters.mode === "what-if" ? "what-if" :
                    view.filters.mode === "principals"
                      ? "principals"
                      : "matrix",
                  );
                  setSearch(
                    typeof view.filters.search === "string"
                      ? view.filters.search
                      : "",
                  );
                  setAccessLevel(
                    typeof view.filters.accessLevel === "string"
                      ? (view.filters.accessLevel as "all" | AccessLevel)
                      : "all",
                  );
                  setOrigin(
                    typeof view.filters.origin === "string"
                      ? (view.filters.origin as OriginFilter)
                      : "all",
                  );
                  setRisk(
                    typeof view.filters.risk === "string"
                      ? (view.filters.risk as RiskFilter)
                      : "all",
                  );
                  setCoverageFilter(parseAccessCoverageFilter(view.filters.coverage));
                }}
                onDelete={removeSavedView}
              />}
              <button
                type="button"
                onClick={clearFilters}
                disabled={!activeFilters}
                className="atlas-control inline-flex items-center justify-center gap-s rounded-lg border border-border bg-card px-m text-300 font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                <FilterX className="icon-size-200" aria-hidden="true" />
                Clear filters
              </button>
              {mode !== "what-if" && <button
                type="button"
                onClick={() => downloadCsv(filteredRows)}
                disabled={filteredRows.length === 0}
                className="atlas-control inline-flex items-center justify-center gap-s rounded-lg bg-primary px-m text-300 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                <Download className="icon-size-200" aria-hidden="true" />
                Export CSV
              </button>}
            </div>
            <p id="access-coverage-help" className="sr-only">
              Coverage filters include pairs with any matching evidence layer.
              A denied evidence read does not mean access is denied.
            </p>
          </div>
        </div>

        <div className="atlas-row flex flex-wrap items-baseline gap-x-s gap-y-xxs px-l">
          <h2 className="text-300 font-semibold">
            {mode === "matrix" ? "Review matrix" : mode === "principals" ? "Principals" : "What-if"}
          </h2>
          <p className="text-200 text-muted-foreground" aria-live="polite">
            {filteredRows.length} of {rows.length} recorded grant pairs
          </p>
        </div>
        <AccessEvidenceLegend />
      </Card>

      {policyEnabled && (
        <Card className="p-l">
          <h2 className="text-300 font-semibold">Optional policy evidence</h2>
          <p className="mt-s text-200 leading-300">{POLICY_LIMITATION}</p>
          <p role="status" className="mt-s text-200 text-muted-foreground">
            {policyState.status === "loading" ? "Loading stored evidence…" :
              policyState.status === "unavailable" ? "Stored evidence unavailable; grant truth is unchanged." :
              policyState.records.length ? `${policyState.records.length} stored context records for this snapshot.` :
              "No stored evidence for this snapshot. Restrictions remain unknown."}
            {policyMessage ? ` ${policyMessage}` : ""}
          </p>
          {!isPreview && canSync && mode !== "what-if" && (
            <button type="button" disabled={policyCollecting || !data.workspace.snapshotId}
              onClick={() => {
                setPolicyCollecting(true);
                setPolicyMessage("");
                void collectStoredPolicyEvidence(data.workspace.fabricId, data.workspace.snapshotId!)
                  .then((result) => {
                    setPolicyMessage(result.status === "off" ? "Server collection gate is off; no Fabric requests or evidence writes were made." :
                      "Workspace policy context stored. Central evaluation remains blocked.");
                    setPolicyRefresh((value) => value + 1);
                  }).catch(() => setPolicyMessage("Optional collection unavailable; the catalog was not changed."))
                  .finally(() => setPolicyCollecting(false));
              }}
              className="atlas-control mt-m rounded-lg border border-border px-m text-300 font-semibold hover:bg-accent disabled:opacity-50">
              {policyCollecting ? "Collecting context…" : "Collect workspace policy context (read-only Fabric)"}
            </button>
          )}
        </Card>
      )}

      {reviewError && !selectedRow && (
        <div
          className="rounded-lg border border-status-failing/30 bg-status-failing/10 px-m py-s text-200 text-status-failing"
          role="alert"
        >
          Access review history could not be loaded: {reviewError}
        </div>
      )}

      <div
        className={cn(
          "grid items-start gap-l",
          selectedRow && evidenceOpen && "xl:grid-cols-3",
        )}
      >
        <Card
          className={cn(
            "min-w-0 overflow-hidden",
            selectedRow && evidenceOpen && "xl:col-span-2",
          )}
        >
          {mode === "matrix" ? (
            <MatrixTable
              rows={filteredRows}
              selectedId={visibleSelectedId}
              onSelect={selectRow}
            />
          ) : mode === "principals" ? (
            <PrincipalGroups
              rows={filteredRows}
              selectedId={visibleSelectedId}
              expanded={effectiveExpandedPrincipals}
              searching={Boolean(normalizedSearch)}
              onToggle={togglePrincipal}
              onOpenPack={(row) => {
                setEvidenceOpen(false);
                setOffboardingPrincipalId(
                  row.principalId ?? row.principalKey ?? row.principalRef,
                );
              }}
              onSelect={selectRow}
            />
          ) : (
            <AccessWhatIf
              rows={filteredRows}
              row={selectedRow}
              onSelect={(row) => {
                setSelectedId(row?.id ?? null);
                setEvidenceOpen(desktopEvidence);
              }}
              onInspect={() => {
                reviewTriggerRef.current = document.activeElement instanceof HTMLElement
                  ? document.activeElement : null;
                setEvidenceOpen(true);
              }}
            />
          )}
        </Card>

        {selectedRow && evidenceOpen && (desktopEvidence || !offboardingPrincipalId) && (
          <AccessEvidenceInspector
            desktop={desktopEvidence}
            onClose={closeEvidence}
            onReturnFocus={returnEvidenceFocus}
          >
          <AccessReviewDetailPanel
            key={`${selectedRow.id}:${reviewsByRowKey.get(selectedRow.id)?.history[0]?.id ?? "none"}`}
            row={selectedRow}
            review={reviewsByRowKey.get(selectedRow.id)}
            reviewsLoading={reviewsLoading}
            saving={reviewOperationId === selectedRow.id}
            reviewError={reviewError}
            onSaveDecision={(status, note) =>
              saveDecision(selectedRow, status, note)
            }
            onClearDecision={() => clearDecision(selectedRow)}
            onClose={closeEvidence}
            onSimulate={startWhatIf}
            readOnly={mode === "what-if"}
            noteOverride={reviewNoteDraft?.key === reviewNoteKey ? reviewNoteDraft.note : undefined}
            onNoteChange={(note) => setReviewNoteDraft({ key: reviewNoteKey, note })}
          />
          </AccessEvidenceInspector>
        )}
      </div>
      <OffboardingDialog
        data={data}
        principalId={offboardingPrincipalId}
        open={Boolean(offboardingPrincipalId)}
        onClose={() => setOffboardingPrincipalId("")}
      />
    </div>
  );
}
