import { Layers } from "lucide-react";
import {
  isMaterializedLakeViewRefreshJob,
  itemFamilyCapability,
} from "../item-families";
import type { Job } from "../model";
import {
  FamilyCoverageNotes,
  FamilyCoverageRows,
} from "./FamilyCoverageEvidence";
import { familySubtitle } from "../item-family-display";

/** Catalog drawer section that states each coverage dimension of an item's family. */
export function ItemCoveragePanel({
  itemType,
  jobs = [],
}: {
  itemType: string;
  jobs?: readonly Pick<Job, "jobType">[];
}) {
  const capability = itemFamilyCapability(itemType);
  const mlvRefreshJobs = jobs.filter((job) => isMaterializedLakeViewRefreshJob(job.jobType)).length;
  const headingId = `coverage-${capability.key.replace(/[^A-Za-z0-9]+/g, "-")}`;
  return (
    <section
      data-section-key="coverage"
      aria-labelledby={headingId}
      className="scroll-mt-l overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-s border-b border-border bg-secondary px-l py-m">
        <Layers className="icon-size-200 text-muted-foreground" aria-hidden="true" />
        <h3
          id={headingId}
          className="text-200 font-semibold uppercase tracking-[0.12em] text-muted-foreground"
        >
          Atlas coverage
        </h3>
      </div>
      <p className="px-l pt-m text-200 text-muted-foreground">
        <span className="font-semibold text-foreground">{capability.label}</span>
        {" · "}
        {familySubtitle(capability)}
      </p>
      <div className="px-l">
        <FamilyCoverageRows capability={capability} />
      </div>
      {(capability.adapters.length > 0 || mlvRefreshJobs > 0) && (
        <div className="border-t border-border p-l">
          <FamilyCoverageNotes capability={capability} mlvRefreshJobs={mlvRefreshJobs} />
        </div>
      )}
    </section>
  );
}
