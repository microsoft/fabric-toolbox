import { describe, expect, it } from "vitest";
import {
  buildAccessReviewRows,
  buildGovernanceFindings,
  getCoverageDiagnostics,
  selectAccessByItem,
  selectAccessByPrincipal,
  summarizeAccessReview,
} from "./governance";
import type { AtlasData, Item } from "./model";
import { searchJobId } from "./search";

function item(
  fabricId: string,
  overrides: Partial<Item> = {},
): Item {
  return {
    fabricId,
    displayName: fabricId,
    itemType: "Lakehouse",
    health: "healthy",
    endorsement: "none",
    tags: [],
    ...overrides,
  };
}

function atlas(overrides: Partial<AtlasData> = {}): AtlasData {
  return {
    workspace: {
      fabricId: "workspace",
      displayName: "Workspace",
      capacity: "F2",
      region: "West Europe",
    },
    items: [],
    edges: [],
    principals: [],
    grants: [],
    jobs: [],
    config: [],
    comments: [],
    syncRuns: [],
    ...overrides,
  };
}

describe("effective access", () => {
  it("combines workspace and item grants without reducing inherited access", () => {
    const data = atlas({
      items: [item("a"), item("b")],
      principals: [
        {
          principalId: "user-1",
          displayName: "Analyst",
          email: "analyst@example.com",
          kind: "user",
          workspaceRole: "Member",
        },
      ],
      grants: [
        {
          principalRef: "analyst@example.com",
          accessLevel: "edit",
          source: "workspaceRole",
        },
        {
          itemFabricId: "a",
          principalRef: "Analyst",
          accessLevel: "view",
          source: "directShare",
          flag: "broad",
        },
      ],
    });

    const rows = buildAccessReviewRows(data);
    const itemA = selectAccessByItem(rows, "a")[0];
    const itemB = selectAccessByItem(rows, "b")[0];

    expect(itemA).toMatchObject({
      principalId: "user-1",
      effectiveAccess: "edit",
      origin: "mixed",
      flags: ["broad"],
    });
    expect(itemA.applicableGrants).toHaveLength(2);
    expect(itemA.effectiveGrants).toEqual([
      expect.objectContaining({ accessLevel: "edit" }),
    ]);
    expect(itemB).toMatchObject({
      effectiveAccess: "edit",
      origin: "workspace",
    });
    expect(selectAccessByPrincipal(rows, "user-1")).toHaveLength(2);
  });

  it("keeps item-only, unresolved, and ambiguous principals distinct", () => {
    const data = atlas({
      items: [item("a"), item("b")],
      principals: [
        {
          principalId: "one",
          displayName: "Duplicate",
          kind: "user",
          workspaceRole: "Viewer",
        },
        {
          principalId: "two",
          displayName: "Duplicate",
          kind: "guest",
          workspaceRole: "Viewer",
        },
      ],
      grants: [
        {
          itemFabricId: "a",
          principalRef: "Duplicate",
          accessLevel: "view",
          source: "directShare",
        },
        {
          principalRef: "Missing principal",
          accessLevel: "view",
          source: "workspaceRole",
        },
      ],
    });

    const rows = buildAccessReviewRows(data);
    expect(
      rows.find((row) => row.principalRef === "Duplicate"),
    ).toMatchObject({
      itemId: "a",
      principalResolution: "ambiguous",
      origin: "item",
    });
    expect(
      rows.filter((row) => row.principalRef === "Missing principal"),
    ).toHaveLength(2);
    expect(
      rows.filter((row) => row.principalResolution === "unresolved"),
    ).toHaveLength(2);

    const summary = summarizeAccessReview(rows);
    expect(summary).toMatchObject({
      rows: 3,
      items: 2,
      principals: 2,
      unresolved: 2,
      ambiguous: 1,
      byOrigin: { workspace: 2, item: 1, mixed: 0 },
    });
  });

  it("is deterministic when input order changes", () => {
    const data = atlas({
      items: [item("b"), item("a")],
      principals: [
        {
          principalId: "user",
          displayName: "User",
          kind: "user",
          workspaceRole: "Viewer",
        },
      ],
      grants: [
        {
          itemFabricId: "b",
          principalRef: "User",
          accessLevel: "view",
          source: "directShare",
        },
        {
          principalRef: "User",
          accessLevel: "view",
          source: "workspaceRole",
        },
      ],
    });
    const reversed = {
      ...data,
      items: [...data.items].reverse(),
      grants: [...data.grants].reverse(),
    };

    expect(buildAccessReviewRows(reversed)).toEqual(
      buildAccessReviewRows(data),
    );
  });
});

describe("governance findings", () => {
  it("does not report missing owner or sensitivity when those fields were not collected", () => {
    const findings = buildGovernanceFindings(
      atlas({ items: [item("a"), item("b")] }),
    );

    expect(findings.map((finding) => finding.id)).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("missing-owner"),
        expect.stringContaining("missing-sensitivity"),
      ]),
    );
  });

  it("reports metadata gaps only after the snapshot demonstrates collection", () => {
    const findings = buildGovernanceFindings(
      atlas({
        items: [
          item("complete", {
            ownerName: "Owner",
            sensitivity: "Confidential",
          }),
          item("missing"),
        ],
      }),
    );

    expect(
      findings.filter((finding) => finding.id.startsWith("missing-owner:")),
    ).toHaveLength(1);
    expect(
      findings.filter((finding) =>
        finding.id.startsWith("missing-sensitivity:"),
      ),
    ).toHaveLength(1);
    expect(findings.every((finding) => finding.itemId !== "complete")).toBe(
      true,
    );
  });

  it("emits actionable findings only from explicit access and operational evidence", () => {
    const data = atlas({
      items: [
        item("failing", { health: "failing" }),
        item("stale", { health: "stale" }),
      ],
      principals: [
        {
          principalId: "guest",
          displayName: "Guest",
          kind: "guest",
          external: true,
          workspaceRole: "Viewer",
        },
        {
          principalId: "group",
          displayName: "All analysts",
          kind: "group",
          workspaceRole: "Viewer",
        },
        {
          principalId: "sp",
          displayName: "Automation",
          kind: "servicePrincipal",
          workspaceRole: "Contributor",
        },
      ],
      grants: [
        {
          itemFabricId: "failing",
          principalRef: "Guest",
          accessLevel: "view",
          source: "directShare",
        },
        {
          principalRef: "All analysts",
          accessLevel: "view",
          source: "workspaceRole",
        },
        {
          principalRef: "Automation",
          accessLevel: "edit",
          source: "orgLink",
          flag: "servicePrincipal",
        },
      ],
      jobs: [
        {
          itemFabricId: "failing",
          itemName: "failing",
          jobType: "Refresh",
          status: "failed",
          startedAt: "2026-08-29T20:00:00.000Z",
          durationSec: 12,
          message: "Gateway unavailable",
        },
      ],
      edges: [
        {
          source: "failing",
          target: "missing",
          relation: "depends on",
        },
      ],
    });

    const findings = buildGovernanceFindings(data);
    const rules = findings.map((finding) => finding.id.split(":")[0]);
    expect(rules).toEqual(
      expect.arrayContaining([
        "external-access",
        "item-only-access",
        "broad-access",
        "service-principal-access",
        "failing-item",
        "stale-item",
        "failed-job",
        "broken-lineage",
      ]),
    );
    expect(
      findings.some(
        (finding) =>
          finding.id.startsWith("broad-access:") &&
          finding.principalId === "group",
      ),
    ).toBe(false);
    expect(
      findings.every(
        (finding) =>
          finding.recommendation.length > 0 &&
          finding.evidenceIds.length > 0,
      ),
    ).toBe(true);
    expect(
      findings.find((finding) => finding.id.startsWith("failed-job:"))
        ?.jobId,
    ).toBe(
      searchJobId(
        "failing",
        "Refresh",
        "2026-08-29T20:00:00.000Z",
      ),
    );
  });

  it("reports excess explicit workspace administrators above two", () => {
    const grants = ["One", "Two", "Three"].map((principalRef) => ({
      principalRef,
      accessLevel: "owner" as const,
      source: "workspaceRole" as const,
      roleName: "Admin",
    }));

    const findings = buildGovernanceFindings(atlas({ grants }));
    expect(
      findings.filter((finding) =>
        finding.id.startsWith("excess-workspace-admins:"),
      ),
    ).toHaveLength(1);
  });
});

describe("coverage diagnostics", () => {
  it("uses explicit schema with correct denominators and states", () => {
    const data = atlas({
      items: [
        item("model", {
          itemType: "SemanticModel",
          description: "Documented",
          ownerName: "Owner",
          sensitivity: "Confidential",
          endorsement: "certified",
        }),
        item("warehouse", { itemType: "Warehouse" }),
        item("report", { itemType: "Report" }),
      ],
      schema: {
        model: [
          {
            name: "Sales",
            objectType: "Table",
            description: "Sales facts",
            columns: [
              {
                name: "Amount",
                dataType: "double",
                description: "Gross amount",
              },
              { name: "Code", dataType: "", description: "" },
            ],
            measures: [
              {
                name: "Revenue",
                expr: "SUM(Sales[Amount])",
              },
            ],
          },
        ],
      },
    });

    const coverage = getCoverageDiagnostics(data).byId;
    expect(coverage.descriptions).toMatchObject({
      numerator: 1,
      denominator: 3,
      state: "partial",
    });
    expect(coverage["schema-inventory"]).toMatchObject({
      numerator: 1,
      denominator: 2,
      percentage: 50,
      state: "partial",
    });
    expect(coverage["table-descriptions"]).toMatchObject({
      numerator: 1,
      denominator: 1,
      state: "complete",
    });
    expect(coverage["column-descriptions"]).toMatchObject({
      numerator: 1,
      denominator: 2,
      percentage: 50,
    });
    expect(coverage["measure-descriptions"]).toMatchObject({
      numerator: 0,
      denominator: 1,
      state: "no-values",
    });
    expect(coverage["technical-metadata"]).toMatchObject({
      numerator: 3,
      denominator: 4,
      percentage: 75,
    });
  });

  it("returns not-applicable and a null percentage for zero denominators", () => {
    const coverage = getCoverageDiagnostics(
      atlas({ items: [item("report", { itemType: "Report" })] }),
    ).byId;

    expect(coverage["schema-inventory"]).toMatchObject({
      numerator: 0,
      denominator: 0,
      percentage: null,
      state: "not-applicable",
    });
    expect(coverage["column-descriptions"].percentage).toBeNull();
  });

  it("excludes items whose governance metadata was not collected", () => {
    const coverage = getCoverageDiagnostics(
      atlas({
        items: [
          item("scanner-item", {
            sensitivityMetadataAvailable: true,
            endorsementMetadataAvailable: true,
            ownerMetadataAvailable: false,
            sensitivityLabelId: "label-id",
            endorsement: "certified",
          }),
          item("fabric-only-item", {
            sensitivityMetadataAvailable: false,
            endorsementMetadataAvailable: false,
            ownerMetadataAvailable: false,
          }),
        ],
      }),
    ).byId;

    expect(coverage.sensitivity).toMatchObject({
      numerator: 1,
      denominator: 1,
      percentage: 100,
    });
    expect(coverage.endorsement).toMatchObject({
      numerator: 1,
      denominator: 1,
      percentage: 100,
    });
    expect(coverage.owners).toMatchObject({
      numerator: 0,
      denominator: 0,
      percentage: null,
      state: "not-applicable",
    });
  });
});
