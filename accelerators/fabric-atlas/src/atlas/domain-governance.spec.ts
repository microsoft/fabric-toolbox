import { describe, expect, it } from "vitest";
import {
  aggregateByDomain,
  coverageRatio,
  domainGovernanceInputs,
  findingDomainKey,
  NO_DOMAIN_KEY,
  parseGovernanceSummary,
  summarizeGovernance,
  UNKNOWN_DOMAIN_KEY,
  workspaceDomainGroups,
  type GovernanceSummary,
} from "./domain-governance";
import { DOMAIN_OPS, DOMAIN_RENTALS, SAMPLE_DATA } from "./model";

function summary(items: number, overrides: Partial<GovernanceSummary> = {}): GovernanceSummary {
  return {
    version: 1,
    items,
    findings: { critical: 1, high: 0, medium: 2, low: 0 },
    pillars: { health: 80, protect: 40, trust: null },
    coverage: {
      endorsed: { numerator: 1, denominator: items, unknown: 0 },
      certified: { numerator: 0, denominator: items, unknown: 0 },
      described: { numerator: 2, denominator: items - 1, unknown: 1 },
      labeled: { numerator: 0, denominator: 0, unknown: items },
      tagged: { numerator: 1, denominator: items, unknown: 0 },
    },
    ...overrides,
  };
}

describe("summarizeGovernance", () => {
  it("summarizes the sample workspace and round-trips through the strict parser", () => {
    const result = summarizeGovernance(SAMPLE_DATA);
    expect(result.items).toBe(SAMPLE_DATA.items.length);
    const { endorsed, described, labeled } = result.coverage;
    for (const entry of [endorsed, described, labeled]) {
      expect(entry.denominator + entry.unknown).toBe(SAMPLE_DATA.items.length);
      expect(entry.numerator).toBeLessThanOrEqual(entry.denominator);
    }
    expect(parseGovernanceSummary(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify(result).length).toBeLessThan(4000);
  });

  it("rejects malformed persisted summaries", () => {
    expect(parseGovernanceSummary("")).toBeUndefined();
    expect(parseGovernanceSummary("{not json")).toBeUndefined();
    expect(parseGovernanceSummary({ ...summary(3), version: 2 })).toBeUndefined();
    const broken = summary(3);
    broken.coverage.endorsed = { numerator: 5, denominator: 3, unknown: 0 };
    expect(parseGovernanceSummary(broken)).toBeUndefined();
    expect(parseGovernanceSummary({ ...summary(3), pillars: { health: 120, protect: null, trust: null } })).toBeUndefined();
  });
});

describe("aggregateByDomain", () => {
  const evidence = SAMPLE_DATA.governanceEvidence!;

  it("reconciles totals and keeps No domain and Unknown as separate rows", () => {
    const rows = aggregateByDomain(
      [
        { workspaceId: "a", displayName: "A", domainId: DOMAIN_OPS, summary: summary(4) },
        { workspaceId: "b", displayName: "B", domainId: DOMAIN_OPS, summary: summary(2, { pillars: { health: 50, protect: null, trust: 90 } }) },
        { workspaceId: "c", displayName: "C", domainId: NO_DOMAIN_KEY, summary: summary(3) },
        { workspaceId: "d", displayName: "D", summary: summary(1) },
        { workspaceId: "e", displayName: "E", domainId: DOMAIN_RENTALS },
      ],
      evidence,
    );
    const ops = rows.find((row) => row.key === DOMAIN_OPS)!;
    expect(ops.domain.kind).toBe("named");
    expect(ops.items).toBe(6);
    expect(ops.findings.critical).toBe(2);
    expect(ops.pillars.health).toBe(Math.round((80 * 4 + 50 * 2) / 6));
    expect(ops.pillars.protect).toBe(40);
    expect(ops.pillars.trust).toBe(90);
    expect(ops.coverage.described).toEqual({ numerator: 4, denominator: 4, unknown: 2 });

    const rentals = rows.find((row) => row.key === DOMAIN_RENTALS)!;
    expect(rentals.workspacesWithoutSummary).toBe(1);
    expect(rentals.empty).toBe(false);
    expect(rentals.domain.label).toContain("›");

    const total = rows.reduce((sum, row) => sum + row.items, 0);
    expect(total).toBe(10);
    expect(rows.at(-2)?.key).toBe(NO_DOMAIN_KEY);
    expect(rows.at(-2)?.domain.label).toBe("No domain");
    expect(rows.at(-1)?.key).toBe(UNKNOWN_DOMAIN_KEY);
  });

  it("lists empty domains only when the domains section is complete", () => {
    const complete = aggregateByDomain([], evidence);
    expect(complete.length).toBe(evidence.domains.entries.length);
    expect(complete.every((row) => row.empty)).toBe(true);
    const reasons = Object.fromEntries(complete.map((row) => [row.domain.label, row.emptyReason]));
    expect(reasons["Finance"]).toBe("empty-in-fabric");
    expect(reasons["Marketing"]).toBe("not-synchronized");
    const unknownCount = aggregateByDomain([], {
      ...evidence,
      domains: { ...evidence.domains, entries: evidence.domains.entries.map((entry) => {
        const rest = { ...entry };
        delete rest.workspaceCount;
        return rest;
      }) },
    });
    expect(unknownCount.every((row) => row.emptyReason === "unknown")).toBe(true);

    const partial = aggregateByDomain([], {
      ...evidence,
      domains: { ...evidence.domains, status: { status: "failed", code: "forbidden" } },
    });
    expect(partial).toEqual([]);
  });

  it("labels a domain with unknown name by its id", () => {
    const [row] = aggregateByDomain([{ workspaceId: "x", domainId: "11111111-2222-3333-4444-555555555555" }]);
    expect(row.domain.kind).toBe("unnamed");
    expect(row.domain.label).toContain("Unknown name");
  });

  it("returns null coverage ratios when nothing was readable", () => {
    expect(coverageRatio({ numerator: 0, denominator: 0, unknown: 5 })).toBeNull();
    expect(coverageRatio({ numerator: 1, denominator: 4, unknown: 0 })).toBe(25);
  });
});

describe("domainGovernanceInputs", () => {
  it("uses persisted summaries for other workspaces and the live summary for the active one", () => {
    const other = summary(4);
    const inputs = domainGovernanceInputs(
      {
        [SAMPLE_DATA.workspace.fabricId.toUpperCase()]: { snapshotId: "old", governanceSummary: other },
        "ws-b": { snapshotId: "s2", displayName: "B", fabricDomainId: DOMAIN_RENTALS, governanceSummary: other },
        "ws-never": { displayName: "Never synchronized" },
      },
      SAMPLE_DATA,
    );
    expect(inputs.map((input) => input.workspaceId)).toEqual(["ws-b", SAMPLE_DATA.workspace.fabricId]);
    expect(inputs[0]).toMatchObject({ displayName: "B", domainId: DOMAIN_RENTALS, summary: other });
    expect(inputs[1]?.summary).toEqual(summarizeGovernance(SAMPLE_DATA));
  });
});

describe("workspaceDomainGroups", () => {
  it("groups the workspace scope by domain with explicit Unassigned and not-collected buckets", () => {
    const active = SAMPLE_DATA.workspace.fabricId;
    const groups = workspaceDomainGroups(
      [{ id: "ws-none" }, { id: active }, { id: "ws-old" }, { id: "ws-ops" }],
      {
        "ws-none": { fabricDomainId: NO_DOMAIN_KEY },
        "ws-ops": { fabricDomainId: DOMAIN_OPS.toUpperCase() },
      },
      SAMPLE_DATA,
    );
    expect(groups.map((group) => [group.label, group.workspaceIds])).toEqual([
      ["Operations", ["ws-ops"]],
      ["Operations › Rentals", [active]],
      ["Unassigned", ["ws-none"]],
      ["Domain not collected", ["ws-old"]],
    ]);
  });
});

describe("findingDomainKey", () => {
  it("routes domain-level findings to their domain and others to the workspace domain", () => {
    expect(findingDomainKey({ id: `domain-empty:${DOMAIN_OPS.toUpperCase()}` }, NO_DOMAIN_KEY)).toBe(DOMAIN_OPS.toLowerCase());
    expect(findingDomainKey({ id: "item-no-owner:x" }, DOMAIN_RENTALS)).toBe(DOMAIN_RENTALS.toLowerCase());
    expect(findingDomainKey({ id: "item-no-owner:x" }, undefined)).toBe(UNKNOWN_DOMAIN_KEY);
  });
});