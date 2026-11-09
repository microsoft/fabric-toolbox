import { useState } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { Card, cn } from "../ui";
import { Note } from "./ExternalLineageParts";

type Format = "ndjson" | "json";

const EVENT = {
  eventType: "COMPLETE",
  eventTime: "2026-10-28T06:12:44Z",
  run: { runId: "0198d4f2-…-7c1e" },
  job: { namespace: "source://pricing-db/pricing", name: "pricing.score_members" },
  inputs: [{ namespace: "oracle://crm-prod:1521", name: "CRM.MEMBERS" }],
  outputs: [
    {
      namespace: "abfss://AlpineRent@onelake…",
      name: "alpinerent_lakehouse/Tables/gold/member_segments",
      facets: { columnLineage: "…" },
    },
  ],
};

function example(format: Format) {
  if (format === "ndjson") {
    return `${JSON.stringify(EVENT)}\n${JSON.stringify({ ...EVENT, eventType: "START" }).slice(0, 72)}…`;
  }
  return `[\n${JSON.stringify(EVENT, null, 2)
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n")},\n  …\n]`;
}

const KEPT: [string, string][] = [
  ["job.namespace · job.name", "Job node on the map"],
  ["inputs[] · outputs[]", "External datasets and edges"],
  ["facets.columnLineage", "Column mappings"],
  ["eventType · eventTime · runId", "Last run shown on the edge"],
];

export function ExternalFormatTab() {
  const [format, setFormat] = useState<Format>("ndjson");
  return (
    <div className="grid gap-l lg:grid-cols-2">
      <Card className="min-w-0">
        <div className="flex items-center gap-s border-b border-border px-m py-s">
          <Download className="size-4 text-brand-foreground" aria-hidden="true" />
          <h3 className="text-300 font-semibold">Accepted file</h3>
          <span className="ml-auto rounded-full bg-signal-success-background px-s py-[1px] text-100 font-semibold text-signal-success-foreground">
            OpenLineage 2-0-x
          </span>
        </div>
        <div className="flex flex-col gap-s p-m">
          <div className="text-100 font-semibold text-muted-foreground">Format</div>
          <div role="radiogroup" aria-label="File format" className="inline-flex self-start rounded-md border border-border p-[2px]">
            {(
              [
                ["ndjson", ".ndjson (one event per line)"],
                ["json", ".json (array)"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={format === id}
                onClick={() => setFormat(id)}
                className={cn(
                  "rounded-sm px-m py-xs text-200 font-medium",
                  format === id ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="text-100 font-semibold text-muted-foreground">Example (one RunEvent)</div>
          <pre
            className="max-h-[360px] overflow-auto whitespace-pre-wrap break-all rounded-md bg-secondary p-s font-mono text-100 leading-300"
            data-testid="openlineage-example"
          >
            {example(format)}
          </pre>
          <p className="text-100 text-muted-foreground">
            A single JSON object is also accepted. RunEvent, JobEvent and DatasetEvent are read; max 20 MB.
          </p>
        </div>
      </Card>
      <Card className="min-w-0">
        <div className="flex items-center gap-s border-b border-border px-m py-s">
          <CheckCircle2 className="size-4 text-signal-success-foreground" aria-hidden="true" />
          <h3 className="text-300 font-semibold">What Atlas keeps</h3>
        </div>
        <div className="flex flex-col gap-m p-m">
          <table className="w-full text-left">
            <thead className="border-b border-border text-100 uppercase text-muted-foreground">
              <tr>
                <th className="py-s pr-m font-semibold">Field</th>
                <th className="py-s font-semibold">Used for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {KEPT.map(([field, use]) => (
                <tr key={field}>
                  <td className="py-s pr-m font-mono text-100">{field}</td>
                  <td className="py-s text-200">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Note tone="warning">
            Ignored and never stored: SQL text, source code, data samples, credentials and any other facet.
          </Note>
          <Note>
        Export: <strong>Download OpenLineage</strong> writes the Fabric lineage as an NDJSON file (one
        JobEvent per job, OneLake <code>abfss://</code> dataset names) that any OpenLineage tool can read.
        Later versions: automatic ingestion and Spark runtime events (#86).
      </Note>
        </div>
      </Card>
    </div>
  );
}
