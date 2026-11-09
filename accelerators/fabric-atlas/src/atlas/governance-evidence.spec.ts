import { describe, expect, it } from "vitest";
import {
  domainLabel,
  domainPath,
  domainReference,
  parseGovernanceEvidence,
  type GovernanceEvidence,
} from "./governance-evidence";

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const MISSING = "33333333-3333-4333-8333-333333333333";

function evidence(domains: unknown, status = "complete"): GovernanceEvidence {
  const section = { status: { status: "unsupported", code: "not-collected" }, entries: [] };
  const parsed = parseGovernanceEvidence({
    collectedAt: "2026-10-01T00:00:00.000Z",
    domains: { status: { status }, entries: domains },
    tags: section,
    tenantSettings: section,
    network: { status: { status: "unsupported" } },
    externalShares: section,
    oneLakeRoles: section,
  });
  if (!parsed) throw new Error("fixture did not parse");
  return parsed;
}

describe("domain hierarchy resolution", () => {
  const named = evidence([
    { id: PARENT.toUpperCase(), displayName: "Operations" },
    { id: CHILD, displayName: "Rentals", parentDomainId: PARENT.toUpperCase(), workspaceCount: 2 },
    { id: "", displayName: "Dropped" },
  ]);

  it("resolves Domain › Subdomain with case-insensitive ids", () => {
    expect(named.domains.entries.map((d) => d.id)).toEqual([PARENT, CHILD]);
    expect(domainPath(named, CHILD.toUpperCase())).toBe("Operations › Rentals");
    expect(domainPath(named, PARENT)).toBe("Operations");
    expect(domainLabel(named, CHILD)).toEqual({ kind: "named", id: CHILD, label: "Operations › Rentals" });
    expect(domainReference(named, CHILD)).toEqual({
      status: "named",
      domainId: CHILD,
      name: "Rentals",
      path: "Operations › Rentals",
      parentDomainId: PARENT,
      parentName: "Operations",
    });
  });

  it("keeps the GUID with Unknown name when the admin domain list was denied", () => {
    const denied = evidence([], "failed");
    expect(domainPath(denied, CHILD)).toBeUndefined();
    expect(domainLabel(denied, CHILD)).toEqual({ kind: "unnamed", id: CHILD, label: `Unknown name (${CHILD.slice(0, 8)}…)` });
    expect(domainReference(denied, CHILD)).toMatchObject({ status: "unknown-name", domainId: CHILD, name: null });
    expect(domainReference(undefined, MISSING)).toMatchObject({ status: "unknown-name", domainId: MISSING });
  });

  it("separates unassigned workspaces from domains that were not collected", () => {
    expect(domainLabel(named, "unassigned")).toEqual({ kind: "unassigned", label: "No domain" });
    expect(domainLabel(named, undefined).kind).toBe("unknown");
    expect(domainReference(named, "unassigned").status).toBe("unassigned");
    expect(domainReference(named, undefined).status).toBe("not-collected");
  });

  it("rejects envelopes without a collection timestamp", () => {
    expect(parseGovernanceEvidence({ domains: [] })).toBeUndefined();
    expect(parseGovernanceEvidence(null)).toBeUndefined();
  });
});
