import { AlertTriangle, ArrowRight, ChevronRight, FileDown } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import {
  BREAKING_CHANGE_LABEL,
  breakingChangeBrief,
  type BreakingChangeAnalysis,
  type BreakingChangeCandidate,
  type BreakingChangeDomain,
  type BreakingChangeSeverity,
} from "../breaking-changes";
import { downloadText, fileSlug } from "../download";
import type { HistoricalSnapshot } from "../history";
import { relativeTime, typeMeta } from "../model";
import { cn } from "../ui";

const SEVERITY_TONE: Record<BreakingChangeSeverity, string> = {
  high: "border-destructive/40 bg-destructive/10 text-destructive",
  medium: "border-status-warning/40 bg-status-warning/10 text-status-warning",
  low: "border-border bg-muted text-muted-foreground",
};

const DOMAIN_LABEL: Record<BreakingChangeDomain, string> = {
  item: "Items",
  schema: "Schema",
  lineage: "Lineage",
  access: "Access and ownership",
};

const NO_OWNER = "__no_owner__";

function valueText(value: unknown): string {
  if (value === undefined) return "Not present";
  if (typeof value === "string") return value || "Empty";
  return JSON.stringify(value, null, 2);
}

function ownerOf(candidate: BreakingChangeCandidate): string {
  return candidate.item.ownerName || candidate.item.ownerEmail || "";
}

export function BreakingChangesView({
  analysis,
  from,
  to,
  selectedId,
  onSelect,
  changeCenterHref,
  onOpenChangeCenter,
}: {
  analysis: BreakingChangeAnalysis;
  from: HistoricalSnapshot;
  to: HistoricalSnapshot;
  selectedId: string;
  onSelect: (id: string) => void;
  changeCenterHref: (search?: string) => string;
  onOpenChangeCenter: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const [domain, setDomain] = useState<BreakingChangeDomain | "all">("all");
  const [severity, setSeverity] = useState<BreakingChangeSeverity | "all">("all");
  const [owner, setOwner] = useState("all");
  const [itemType, setItemType] = useState("all");
  const owners = useMemo(
    () => [...new Set(analysis.candidates.map(ownerOf))].sort(),
    [analysis.candidates],
  );
  const itemTypes = useMemo(
    () =>
      [
        ...new Set(
          analysis.candidates
            .map((candidate) => candidate.item.type)
            .filter((value): value is string => !!value),
        ),
      ].sort(),
    [analysis.candidates],
  );
  const filtered = analysis.candidates.filter(
    (candidate) =>
      (domain === "all" || candidate.domain === domain) &&
      (severity === "all" || candidate.severity === severity) &&
      (owner === "all" ||
        (owner === NO_OWNER ? !ownerOf(candidate) : ownerOf(candidate) === owner)) &&
      (itemType === "all" || candidate.item.type === itemType),
  );
  const selected = analysis.candidates.find((candidate) => candidate.id === selectedId);

  if (analysis.candidates.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-xl text-center text-300 text-muted-foreground">
        No breaking-change candidates between these snapshots. Candidates are
        limited to removed or retyped schema objects, changed measure
        expressions, removed or reversed lineage and lost ownership with
        downstream consumers.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-m xl:flex-row xl:items-start">
      <section
        aria-labelledby="breaking-changes-title"
        className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-fabric-2"
      >
        <div className="atlas-toolbar flex flex-wrap items-center justify-between border-b border-border px-l py-m">
          <h3 id="breaking-changes-title" className="text-400 font-semibold">
            Breaking-change candidates
          </h3>
          <div className="flex flex-wrap items-center gap-s">
          <select
            aria-label="Filter breaking changes by domain"
            value={domain}
            onChange={(event) => setDomain(event.target.value as BreakingChangeDomain | "all")}
            className="rounded-lg border border-input bg-card px-m text-muted-foreground outline-none"
          >
            <option value="all">All domains</option>
            {(Object.keys(DOMAIN_LABEL) as BreakingChangeDomain[]).map((value) => (
              <option key={value} value={value}>
                {DOMAIN_LABEL[value]}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter breaking changes by severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as BreakingChangeSeverity | "all")}
            className="rounded-lg border border-input bg-card px-m text-muted-foreground outline-none"
          >
            <option value="all">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            aria-label="Filter breaking changes by documented owner"
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            className="max-w-[220px] rounded-lg border border-input bg-card px-m text-muted-foreground outline-none"
          >
            <option value="all">All owners</option>
            {owners.map((value) => (
              <option key={value || NO_OWNER} value={value || NO_OWNER}>
                {value || "No documented owner"}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter breaking changes by affected item type"
            value={itemType}
            onChange={(event) => setItemType(event.target.value)}
            className="rounded-lg border border-input bg-card px-m text-muted-foreground outline-none"
          >
            <option value="all">All item types</option>
            {itemTypes.map((value) => (
              <option key={value} value={value}>
                {typeMeta(value).label}
              </option>
            ))}
          </select>
          <span className="text-200 text-muted-foreground" aria-live="polite">
            {filtered.length} of {analysis.candidates.length} candidates
          </span>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="p-xl text-center text-300 text-muted-foreground">
            No candidates match these filters.
          </p>
        ) : (
          <table aria-labelledby="breaking-changes-title" className="w-full border-collapse text-300">
            <thead>
              <tr className="border-b border-border text-left text-200 text-muted-foreground">
                <th scope="col" className="px-l py-s font-semibold">Severity</th>
                <th scope="col" className="px-m py-s font-semibold">Change</th>
                <th scope="col" className="hidden px-m py-s font-semibold md:table-cell">Owner</th>
                <th scope="col" className="hidden px-m py-s font-semibold lg:table-cell">Downstream</th>
                <th scope="col" className="w-[40px] px-s py-s">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((candidate) => {
                const active = candidate.id === selectedId;
                const downstreamCount = candidate.downstream.filter(
                  (entry) => entry.distance > 0,
                ).length;
                return (
                  <tr
                    key={candidate.id}
                    onClick={() => onSelect(candidate.id)}
                    className={cn(
                      "cursor-pointer border-b border-border last:border-b-0 hover:bg-accent",
                      active && "bg-primary/5",
                    )}
                  >
                    <td className="atlas-row px-l">
                      <span
                        className={cn(
                          "rounded-md border px-s py-xxs text-200 font-semibold capitalize",
                          SEVERITY_TONE[candidate.severity],
                        )}
                      >
                        {candidate.severity}
                      </span>
                    </td>
                    <td className="px-m">
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(candidate.id);
                        }}
                        className="flex min-h-[var(--atlas-touch-target)] w-full min-w-0 flex-col justify-center text-left"
                      >
                        <span className="break-words font-semibold">{candidate.title}</span>
                        <span className="break-words text-200 text-muted-foreground">
                          {candidate.item.name}
                          {candidate.item.type ? ` · ${typeMeta(candidate.item.type).label}` : ""}
                        </span>
                      </button>
                    </td>
                    <td className="hidden px-m text-muted-foreground md:table-cell">
                      {ownerOf(candidate) || "Not documented"}
                    </td>
                    <td className="hidden px-m font-numeric lg:table-cell">
                      {downstreamCount}
                    </td>
                    <td className="px-s text-muted-foreground">
                      <ChevronRight className="icon-size-200" aria-hidden="true" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <aside
        aria-label="Breaking change evidence"
        className="flex min-h-[260px] flex-col gap-m rounded-lg border border-border bg-card p-l shadow-fabric-2 xl:w-[400px] xl:shrink-0"
      >
        {selected ? (
          <CandidateDetail
            candidate={selected}
            from={from}
            to={to}
            changeCenterHref={changeCenterHref(selected.changeSearch)}
            onOpenChangeCenter={onOpenChangeCenter}
          />
        ) : (
          <p className="m-auto max-w-[280px] text-center text-300 text-muted-foreground">
            Select a candidate to see its before and after values and the
            downstream items recorded in the earlier snapshot.
          </p>
        )}
      </aside>
    </div>
  );
}

function CandidateDetail({
  candidate,
  from,
  to,
  changeCenterHref,
  onOpenChangeCenter,
}: {
  candidate: BreakingChangeCandidate;
  from: HistoricalSnapshot;
  to: HistoricalSnapshot;
  changeCenterHref: string;
  onOpenChangeCenter: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const downstream = candidate.downstream.filter((entry) => entry.distance > 0);
  return (
    <>
      <div>
        <span
          className={cn(
            "inline-flex rounded-md border px-s py-xxs text-200 font-semibold capitalize",
            SEVERITY_TONE[candidate.severity],
          )}
        >
          {candidate.severity} · score {candidate.score}
        </span>
        <h3 className="mt-s break-words text-400 font-semibold">{candidate.title}</h3>
        <p className="mt-xxs text-200 text-muted-foreground">
          {BREAKING_CHANGE_LABEL[candidate.kind]} · {candidate.item.name}
          {candidate.item.type ? ` (${typeMeta(candidate.item.type).label})` : ""} ·
          owner {ownerOf(candidate) || "not documented"}
        </p>
      </div>
      <div className="grid gap-s sm:grid-cols-2 xl:grid-cols-1">
        {[
          ["Before", candidate.before],
          ["After", candidate.after],
        ].map(([label, value]) => (
          <div key={label as string}>
            <div className="text-200 font-semibold text-muted-foreground">{label as string}</div>
            <pre className="mt-xxs max-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary p-s font-mono text-200">
              {valueText(value)}
            </pre>
          </div>
        ))}
      </div>
      <div>
        <h4 className="text-300 font-semibold">
          Downstream in the earlier snapshot · {downstream.length}
        </h4>
        {downstream.length === 0 ? (
          <p className="mt-xs text-200 text-muted-foreground">
            No downstream item was recorded.
          </p>
        ) : (
          <ul className="mt-xs flex flex-col gap-xxs text-200">
            {downstream.map((entry) => (
              <li key={entry.id} className="break-words">
                {entry.name} · {entry.distance} hop{entry.distance === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        )}
      </div>
      {candidate.dependentObjects.length > 0 && (
        <div>
          <h4 className="text-300 font-semibold">
            Dependent model objects · {candidate.dependentObjects.length}
          </h4>
          <ul className="mt-xs flex flex-col gap-xxs text-200">
            {candidate.dependentObjects.map((entry) => (
              <li key={`${entry.itemId}:${entry.table}:${entry.name}`} className="break-words">
                {entry.itemName}: {entry.table ? `${entry.table}.` : ""}
                {entry.name} ({entry.confidence})
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="text-300 font-semibold">Recent jobs</h4>
        {candidate.recentJobs.length === 0 ? (
          <p className="mt-xs text-200 text-muted-foreground">No job runs recorded.</p>
        ) : (
          <ul className="mt-xs flex flex-col gap-xxs text-200">
            {candidate.recentJobs.map((job, index) => (
              <li key={`${job.jobType}:${job.startedAt}:${index}`}>
                {job.jobType} · {job.status} · {relativeTime(job.startedAt)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="flex items-start gap-s rounded-md bg-secondary p-s text-200 leading-200 text-muted-foreground">
        <AlertTriangle className="icon-size-200 shrink-0" aria-hidden="true" />
        Impact is item-level and DAX-object-level from synchronized evidence.
        Report visual field usage is not exposed by Fabric APIs and is not
        claimed.
      </p>
      <div className="flex flex-wrap gap-s">
        <a
          href={changeCenterHref}
          onClick={(event) => onOpenChangeCenter(event, changeCenterHref)}
          className="inline-flex min-h-[var(--atlas-touch-target)] items-center gap-s rounded-md border border-input bg-card px-l text-300 font-semibold hover:bg-accent sm:min-h-[var(--atlas-control-height)]"
        >
          Open in Change Center
          <ArrowRight className="icon-size-200" aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={() =>
            downloadText(
              breakingChangeBrief(candidate, from, to),
              "text/markdown",
              `breaking-change-${fileSlug(candidate.title)}.md`,
            )
          }
          className="inline-flex min-h-[var(--atlas-touch-target)] items-center gap-s rounded-md border border-input bg-card px-l text-300 font-semibold hover:bg-accent sm:min-h-[var(--atlas-control-height)]"
        >
          <FileDown className="icon-size-200" aria-hidden="true" />
          Export brief
        </button>
      </div>
    </>
  );
}
