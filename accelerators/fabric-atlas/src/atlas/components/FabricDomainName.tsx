import { domainLabel, type GovernanceEvidence } from "../governance-evidence";
import { cn } from "../ui";

/** Fabric domain shown as `Domain › Subdomain`, the GUID with "Unknown name", "No domain" or "Not collected". */
export function FabricDomainName({
  evidence,
  domainId,
  className,
}: {
  evidence: GovernanceEvidence | undefined;
  domainId: string | undefined;
  className?: string;
}) {
  const domain = domainLabel(evidence, domainId);
  if (domain.kind === "named") {
    return (
      <span className={className} title={domain.id}>
        {domain.label}
      </span>
    );
  }
  if (domain.kind === "unnamed") {
    const adminRefused = evidence?.domains.status.code === "authorization-failed";
    return (
      <span
        className={cn("font-normal", className)}
        title={
          adminRefused
            ? "Assigned to this Fabric domain. Its name needs the Fabric admin API (Tenant.Read.All): synchronize as a Fabric administrator."
            : "Assigned to this Fabric domain. Its name was not collected yet: synchronize again."
        }
      >
        <span className="font-monospace">{domain.id}</span>{" "}
        <span className="text-muted-foreground">
          {adminRefused ? "(Assigned, name needs Fabric admin)" : "(Assigned, unknown name)"}
        </span>
      </span>
    );
  }
  return (
    <span className={cn("font-normal text-muted-foreground", className)}>
      {domain.kind === "unassigned" ? "No domain assigned" : "Not collected"}
    </span>
  );
}
