import type { GovernanceEvidence } from "../governance-evidence";
import type { Item } from "../model";
import { Card } from "../ui";

function age(iso: string | undefined): string {
  if (!iso) return "Unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "Unknown";
  const days = Math.max(0, Math.floor(ms / 86_400_000));
  return days === 0 ? "Today" : `${days} day${days === 1 ? "" : "s"}`;
}

export function ExternalSharesCard({
  evidence,
  items,
}: {
  evidence: GovernanceEvidence | undefined;
  items: readonly Item[];
}) {
  const section = evidence?.externalShares;
  const known = section?.status.status === "complete";
  const names = new Map(items.map((item) => [item.fabricId, item]));
  const active = known ? section.entries.filter((share) => /^active$/i.test(share.status)).length : 0;
  return (
    <section id="external-shares" tabIndex={-1} aria-label="External data shares" className="scroll-mt-l rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <Card className="overflow-hidden">
      <header className="border-b border-border px-l py-m">
        <h2 className="text-400 font-semibold leading-400">
          External data shares{known ? ` • ${active} active` : ""}
        </h2>
        <p className="mt-xxs text-200 leading-200 text-muted-foreground">
          OneLake data shared with other tenants (in-place, no copy). Read with the admin external data shares API.
        </p>
      </header>
      {!known ? (
        <p className="px-l py-m text-200 text-muted-foreground">
          External shares: Unknown — the external data shares API was not available to the synchronizer.
        </p>
      ) : section.entries.length === 0 ? (
        <p className="px-l py-m text-200 text-muted-foreground">No external data share recorded for this workspace.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-300" aria-label="External shares">
            <thead className="text-100 uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th scope="col" className="px-l py-s font-semibold">Shared data</th>
                <th scope="col" className="px-m py-s font-semibold">Recipient</th>
                <th scope="col" className="px-m py-s font-semibold">Created by</th>
                <th scope="col" className="px-m py-s font-semibold">Age</th>
                <th scope="col" className="px-m py-s font-semibold">Label</th>
                <th scope="col" className="px-m py-s font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {section.entries.map((share) => {
                const item = names.get(share.itemId);
                const paths = share.paths.length ? share.paths.join(", ") : "*";
                return (
                  <tr key={share.shareId}>
                    <td className="px-l py-s">
                      <span className="font-medium">{item?.displayName ?? share.itemId}</span>
                      <span className="text-muted-foreground"> / {paths}</span>
                    </td>
                    <td className="px-m py-s">
                      {share.recipient ?? "Unknown"}
                      {share.recipientTenantId && (
                        <span className="text-muted-foreground"> • tenant {share.recipientTenantId}</span>
                      )}
                    </td>
                    <td className="px-m py-s">{share.createdBy ?? "Unknown"}</td>
                    <td className="whitespace-nowrap px-m py-s">{age(share.createdAt)}</td>
                    <td className="px-m py-s">{item?.sensitivity ?? "No label"}</td>
                    <td className="px-m py-s font-semibold">{share.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
    </section>
  );
}
