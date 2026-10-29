import { useMemo } from "react";
import { buildGovernanceFindings } from "../governance";
import { useAtlas } from "../store";
import { Card, cn } from "../ui";

type Tone = "risk" | "ok" | "unknown";

interface ControlRow {
  control: string;
  status: string;
  tone: Tone;
  note?: string;
}

const TONE: Record<Tone, string> = {
  risk: "text-status-warning",
  ok: "text-status-healthy",
  unknown: "text-muted-foreground",
};

const HIGHLY_CONFIDENTIAL = /highly\s+confidential/i;
const NETWORK_FINDING = /^workspace-(public|outbound)-network/;

/** Read-only view of the workspace network controls collected by the synchronizer. */
export function NetworkProtectionCard() {
  const { data } = useAtlas();
  const network = data.governanceEvidence?.network;
  const known = network?.status.status === "complete";
  const policy = known ? network?.policy : undefined;
  const highlyConfidential = data.items.filter(
    (item) => item.sensitivity && HIGHLY_CONFIDENTIAL.test(item.sensitivity),
  ).length;
  const protectFindings = useMemo(
    () => buildGovernanceFindings(data).filter((finding) => NETWORK_FINDING.test(finding.id)).length,
    [data],
  );

  const unknown = (control: string): ControlRow => ({
    control,
    status: "Unknown",
    tone: "unknown",
    note: known ? "Not reported by the Fabric API" : "Network settings not collected in this snapshot",
  });

  const rows: ControlRow[] = [
    policy?.inboundPublicAccess
      ? policy.inboundPublicAccess === "Deny"
        ? { control: "Inbound Private Link", status: "Configured", tone: "ok", note: "Public access denied" }
        : {
            control: "Inbound Private Link",
            status: "Not configured",
            tone: "risk",
            note: `Public access allowed${highlyConfidential ? ` • ${highlyConfidential} Highly Confidential item${highlyConfidential === 1 ? "" : "s"}` : ""}`,
          }
      : unknown("Inbound Private Link"),
    policy?.ipFirewall != null
      ? policy.ipFirewall
        ? { control: "Workspace IP firewall", status: "Configured", tone: "ok" }
        : { control: "Workspace IP firewall", status: "Not configured", tone: "risk" }
      : unknown("Workspace IP firewall"),
    policy?.outboundPublicAccess
      ? policy.outboundPublicAccess === "Deny"
        ? { control: "Outbound access protection", status: "On", tone: "ok", note: "Only approved endpoints are reachable" }
        : {
            control: "Outbound access protection",
            status: "Off",
            tone: "risk",
            note: "Notebooks and pipelines can reach any endpoint",
          }
      : unknown("Outbound access protection"),
    policy?.trustedWorkspaceAccess
      ? policy.trustedWorkspaceAccess.enabled
        ? {
            control: "Trusted workspace access",
            status: "Enabled",
            tone: "ok",
            note:
              policy.trustedWorkspaceAccess.shortcuts != null
                ? `Workspace identity used by ${policy.trustedWorkspaceAccess.shortcuts} shortcut${policy.trustedWorkspaceAccess.shortcuts === 1 ? "" : "s"} (ADLS Gen2)`
                : "Workspace identity configured",
          }
        : { control: "Trusted workspace access", status: "Disabled", tone: "unknown" }
      : unknown("Trusted workspace access"),
    policy?.customerManagedKey != null
      ? policy.customerManagedKey
        ? { control: "Customer-managed key", status: "On", tone: "ok", note: "Customer-managed keys" }
        : { control: "Customer-managed key", status: "Off", tone: "unknown", note: "Microsoft-managed keys" }
      : unknown("Customer-managed key"),
  ];

  return (
    <Card className="flex h-full min-w-0 flex-col" data-testid="network-protection">
      <header className="border-b border-border p-l">
        <h2 className="text-400 font-semibold leading-400">
          Network protection • {data.workspace.displayName}
        </h2>
        <p className="mt-xxs text-200 leading-200 text-muted-foreground">
          Workspace-level inbound and outbound controls (read only). Gaps on workspaces holding Confidential+ items raise Protect findings.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-300">
          <thead className="text-100 uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-l py-s font-semibold">Control</th>
              <th scope="col" className="px-m py-s font-semibold">Status</th>
              <th scope="col" className="px-m py-s font-semibold">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.control}>
                <td className="px-l py-s font-medium">{row.control}</td>
                <td className={cn("whitespace-nowrap px-m py-s font-semibold", TONE[row.tone])}>
                  {row.status}
                </td>
                <td className="px-m py-s text-200 text-muted-foreground">{row.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-border px-l py-s text-200 font-semibold">
        {protectFindings} Protect finding{protectFindings === 1 ? "" : "s"}
      </footer>
    </Card>
  );
}
