import { describe, expect, it } from "vitest";
import {
  buildAccessReviewRows,
  buildGovernanceFindings,
  getCoverageDiagnostics,
  parseInactiveDays,
  publicNetworkFindings,
  externalShareFindings,
  selectAccessByItem,
  selectAccessByPrincipal,
  summarizeAccessReview,
  workspaceAdminStatus,
} from "./governance";
import { SAMPLE_DATA, type AtlasData, type Item } from "./model";
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

describe("OneLake catalog alignment findings", () => {
  const rules = (data: AtlasData) =>
    buildGovernanceFindings(data).map((finding) => finding.id.split(":")[0]);

  it("escalates certified items without description or sensitivity", () => {
    const data = atlas({
      items: [
        item("cert", { endorsement: "certified", sensitivityMetadataAvailable: true }),
        item("plain", { sensitivityMetadataAvailable: true, description: "Documented" }),
      ],
    });
    const findings = buildGovernanceFindings(data);
    const certified = findings.filter((finding) => finding.itemId === "cert");
    expect(certified.map((finding) => finding.id.split(":")[0]).sort()).toEqual([
      "certified-missing-description",
      "certified-missing-sensitivity",
    ]);
    expect(certified.find((f) => f.id.startsWith("certified-missing-sensitivity"))?.severity).toBe("high");
    expect(findings.filter((finding) => finding.itemId === "plain").map((f) => f.id.split(":")[0])).toEqual([
      "missing-sensitivity",
    ]);
  });

  it("flags endorsed items inactive beyond the threshold only when activity is recorded", () => {
    const data = atlas({
      workspace: { ...atlas().workspace, syncedAt: "2026-06-01T00:00:00.000Z" },
      items: [
        item("stale", { endorsement: "promoted", description: "x", lastRefresh: "2026-01-01T00:00:00.000Z" }),
        item("fresh", { endorsement: "promoted", description: "x", updatedAt: "2026-05-20T00:00:00.000Z" }),
        item("unknown", { endorsement: "certified", description: "x" }),
        item("unendorsed", { lastRefresh: "2025-01-01T00:00:00.000Z" }),
      ],
    });
    const inactive = buildGovernanceFindings(data).filter((f) => f.id.startsWith("endorsed-inactive:"));
    expect(inactive.map((finding) => finding.itemId)).toEqual(["stale"]);
    expect(rules(atlas({ items: data.items }))).not.toContain("endorsed-inactive");
  });

  it("flags non-endorsed items with no observed activity and keeps missing signals Unknown", () => {
    const data = atlas({
      workspace: { ...atlas().workspace, syncedAt: "2026-06-01T00:00:00.000Z" },
      items: [
        item("idle", { lastRefresh: "2025-12-01T00:00:00.000Z" }),
        item("jobbed", { updatedAt: "2025-01-01T00:00:00.000Z" }),
        item("silent"),
        item("endorsed", { endorsement: "promoted", updatedAt: "2025-01-01T00:00:00.000Z" }),
      ],
      jobs: [
        { itemFabricId: "jobbed", itemName: "jobbed", jobType: "Pipeline", status: "completed", startedAt: "2026-05-30T00:00:00.000Z", durationSec: 1 },
      ],
    });
    const inactive = buildGovernanceFindings(data).filter((f) => f.id.startsWith("item-inactive:"));
    expect(inactive.map((finding) => finding.itemId)).toEqual(["idle"]);
    expect(inactive[0].title).toBe("Inactive item: idle");
    expect(parseInactiveDays("30")).toBe(30);
    expect(parseInactiveDays("abc")).toBe(90);
    expect(parseInactiveDays("-5")).toBe(90);
  });

  it("reports undocumented visible objects of endorsed semantic models once per model", () => {
    const model = item("model", { itemType: "SemanticModel", endorsement: "promoted", description: "x" });
    const data = atlas({
      items: [model, item("draft", { itemType: "SemanticModel", description: "x" })],
      schema: {
        model: [
          {
            name: "Sales",
            description: "Sales facts",
            columns: [
              { name: "Amount", dataType: "decimal" },
              { name: "Key", dataType: "int64", isHidden: true },
            ],
            measures: [{ name: "Total", description: "Sum of amount" }],
          },
          { name: "Hidden", isHidden: true, columns: [], measures: [] },
        ],
        draft: [{ name: "T", columns: [{ name: "c", dataType: "string" }], measures: [] }],
      },
    });
    const findings = buildGovernanceFindings(data).filter((f) =>
      f.id.startsWith("missing-object-description:"),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ itemId: "model", severity: "low" });
    expect(findings[0].detail).toContain("1 of 3");
  });

  it("flags a workspace without domain only when the absence is confirmed", () => {
    const base = atlas().workspace;
    expect(rules(atlas({ workspace: { ...base, fabricDomainId: "unassigned" } }))).toContain(
      "workspace-no-domain",
    );
    expect(rules(atlas())).not.toContain("workspace-no-domain");
    expect(
      rules(atlas({ workspace: { ...base, fabricDomainId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" } })),
    ).not.toContain("workspace-no-domain");
  });

  it("raises workspace-no-admin only from a complete role collection without Admin", () => {
    const member = { principalId: "u", displayName: "Member", kind: "user" as const, workspaceRole: "Member" as const };
    const complete = { access: { status: "complete" as const } };
    const workspace = (syncSections?: AtlasData["workspace"]["syncSections"]) => ({ ...atlas().workspace, syncSections });

    const missing = atlas({ workspace: workspace(complete), principals: [member] });
    expect(workspaceAdminStatus(missing)).toEqual({ status: "missing" });
    expect(rules(missing)).toContain("workspace-no-admin");

    const withAdmin = atlas({ workspace: workspace(complete), principals: [member, { ...member, principalId: "a", displayName: "Owner", workspaceRole: "Admin" }] });
    expect(workspaceAdminStatus(withAdmin)).toEqual({ status: "identified", admins: ["Owner"] });
    expect(rules(withAdmin)).not.toContain("workspace-no-admin");

    for (const data of [
      atlas({ principals: [member] }),
      atlas({ workspace: workspace({ access: { status: "failed", code: "403" } }), principals: [member] }),
      atlas({ workspace: workspace(complete) }),
    ]) {
      expect(workspaceAdminStatus(data).status).toBe("unknown");
      expect(rules(data)).not.toContain("workspace-no-admin");
    }
  });

  it("reports unlabeled items against the domain default label only when it is known", () => {
    const evidence = SAMPLE_DATA.governanceEvidence!;
    const workspace = { ...atlas().workspace, fabricDomainId: SAMPLE_DATA.workspace.fabricDomainId };
    const items = [item("labeled", { sensitivity: "Confidential" }), item("unlabeled")];
    const prefixes = (data: AtlasData) =>
      buildGovernanceFindings(data)
        .filter((f) => f.itemId === "unlabeled")
        .map((f) => f.id.split(":")[0]);

    const inherited = buildGovernanceFindings(atlas({ workspace, items, governanceEvidence: evidence }));
    const finding = inherited.find((f) => f.id.startsWith("domain-default-label-missing:"));
    expect(finding).toMatchObject({ itemId: "unlabeled", severity: "medium" });
    expect(finding!.detail).toContain("Operations › Rentals");
    expect(inherited.some((f) => f.itemId === "labeled" && f.id.startsWith("domain-default"))).toBe(false);
    expect(prefixes(atlas({ workspace, items, governanceEvidence: evidence }))).not.toContain("missing-sensitivity");

    const denied = {
      ...evidence,
      domains: { ...evidence.domains, status: { status: "unsupported" as const, code: "authorization-failed" } },
    };
    expect(prefixes(atlas({ workspace, items, governanceEvidence: denied }))).toEqual(["missing-sensitivity"]);
    const noDefault = {
      ...evidence,
      domains: {
        ...evidence.domains,
        entries: evidence.domains.entries.map((d) => ({ ...d, defaultSensitivityLabelId: undefined })),
      },
    };
    expect(prefixes(atlas({ workspace, items, governanceEvidence: noDefault }))).toEqual(["missing-sensitivity"]);
  });

  it("flags standard labels below the domain default label", () => {
    const evidence = SAMPLE_DATA.governanceEvidence!;
    const workspace = { ...atlas().workspace, fabricDomainId: SAMPLE_DATA.workspace.fabricDomainId };
    const labelId = evidence.domains.entries.find((d) => d.defaultSensitivityLabelId)!.defaultSensitivityLabelId!;
    const items = [
      item("source", { sensitivity: "Confidential", sensitivityLabelId: labelId }),
      item("general", { sensitivity: "General" }),
      item("custom", { sensitivity: "Team only" }),
      item("higher", { sensitivity: "Highly Confidential" }),
    ];
    const below = buildGovernanceFindings(atlas({ workspace, items, governanceEvidence: evidence })).filter((f) =>
      f.id.startsWith("domain-default-label-below:"),
    );
    expect(below.map((f) => f.itemId)).toEqual(["general"]);
    expect(below[0].groupDetail).toContain("sets default label Confidential");
    expect(below[0].recommendation).toBe("Raise the label to Confidential or record a justified exception.");

    const unresolved = items.map((i) => ({ ...i, sensitivityLabelId: undefined }));
    expect(
      buildGovernanceFindings(atlas({ workspace, items: unresolved, governanceEvidence: evidence })).some((f) =>
        f.id.startsWith("domain-default-label-below:"),
      ),
    ).toBe(false);
  });

  it("flags a domain as empty only from a complete domain list with a zero count", () => {
    const evidence = SAMPLE_DATA.governanceEvidence!;
    const empty = buildGovernanceFindings(atlas({ governanceEvidence: evidence })).filter((f) =>
      f.id.startsWith("domain-empty:"),
    );
    expect(empty.map((f) => f.title)).toEqual(["Domain Finance has no workspace"]);
    expect(empty[0]).toMatchObject({ severity: "low", category: "metadata" });
    const partial = buildGovernanceFindings(
      atlas({
        governanceEvidence: {
          ...evidence,
          domains: { ...evidence.domains, status: { status: "failed", code: "forbidden" } },
        },
      }),
    );
    expect(partial.some((f) => f.id.startsWith("domain-empty:"))).toBe(false);
  });
});

describe("workspace network finding", () => {
  const withNetwork = (status: "complete" | "failed", inbound?: "Allow" | "Deny"): AtlasData => ({
    ...SAMPLE_DATA,
    governanceEvidence: {
      ...SAMPLE_DATA.governanceEvidence!,
      network: { status: { status }, policy: inbound ? { inboundPublicAccess: inbound } : undefined },
    },
  });

  it("flags public inbound access only when Highly Confidential items are present", () => {
    const [finding] = publicNetworkFindings(withNetwork("complete", "Allow"));
    expect(finding).toMatchObject({ severity: "low", category: "access", target: { kind: "workspace" } });
    expect(finding.title).toMatch(/Highly Confidential/);
    const unlabeled = { ...withNetwork("complete", "Allow"), items: SAMPLE_DATA.items.map((item) => ({ ...item, sensitivity: undefined })) };
    expect(publicNetworkFindings(unlabeled)).toEqual([]);
  });

  it("never raises from a denied policy or an Unknown section", () => {
    expect(publicNetworkFindings(withNetwork("complete", "Deny"))).toEqual([]);
    expect(publicNetworkFindings(withNetwork("failed", "Allow"))).toEqual([]);
    expect(publicNetworkFindings({ ...SAMPLE_DATA, governanceEvidence: undefined })).toEqual([]);
  });
});

describe("external share finding", () => {
  const evidence = SAMPLE_DATA.governanceEvidence!;
  const share = evidence.externalShares.entries[0];

  it("flags an active external share on a Confidential-or-above item", () => {
    const [finding] = externalShareFindings(SAMPLE_DATA);
    expect(finding).toMatchObject({
      severity: "high",
      category: "access",
      target: { kind: "item", itemId: share.itemId },
    });
    expect(finding.evidenceIds).toEqual(
      evidence.externalShares.entries
        .filter((s) => s.itemId === share.itemId)
        .map((s) => `item:${share.itemId}:external-share:${s.shareId}`),
    );
    const general = SAMPLE_DATA.items.map((item) => (item.fabricId === share.itemId ? { ...item, sensitivity: "General" } : item));
    expect(externalShareFindings({ ...SAMPLE_DATA, items: general })).toEqual([]);
  });

  it("ignores revoked shares and an Unknown section", () => {
    const revoked = { ...evidence, externalShares: { ...evidence.externalShares, entries: [{ ...share, status: "Revoked" }] } };
    expect(externalShareFindings({ ...SAMPLE_DATA, governanceEvidence: revoked })).toEqual([]);
    const failed = { ...evidence, externalShares: { status: { status: "failed" as const }, entries: [share] } };
    expect(externalShareFindings({ ...SAMPLE_DATA, governanceEvidence: failed })).toEqual([]);
  });
});
