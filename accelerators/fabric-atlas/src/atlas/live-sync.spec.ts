import { describe, expect, it } from "vitest";
import {
  accountMatchesIdentity,
  buildSyncItemBatches,
  buildSyncRequestBody,
  isUdfTimeoutFailure,
  mapSyncToAtlas,
  mergeSyncEnrichment,
  normalizeFabricTimestamp,
  parseSyncResponseText,
  readBoundedResponseText,
  selectMsalAccount,
  syncDeadlineExceeded,
  tokenNeedsRefresh,
  validateRawSync,
  validateSyncEnrichment,
  type MsalAccount,
  type RawSync,
} from "./live-sync";

const workspaceId = "11111111-1111-4111-8111-111111111111";

function completeSync(): RawSync {
  return {
    workspace: { id: workspaceId, displayName: "Atlas" },
    items: [{ id: "item-1", type: "Lakehouse", displayName: "Lake" }],
    roleAssignments: [{ role: "Admin", principal: { id: "user-1" } }],
    jobs: [],
    lineage: [],
    access: [],
    config: [],
    schema: {},
    errors: [],
  };
}

describe("validateRawSync", () => {
  it("accepts a complete authoritative result", () => {
    expect(() => validateRawSync(completeSync(), workspaceId)).not.toThrow();
  });

  describe("resumable metadata enrichment", () => {
    it("groups item slices by type without limiting the complete workspace", () => {
      const items = [
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `sql-${index}`,
          type: "SQLDatabase",
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          id: `kql-${index}`,
          type: "KQLDatabase",
        })),
      ];

      expect(buildSyncItemBatches(items, 8)).toEqual([
        {
          itemType: "SQLDatabase",
          itemIds: Array.from({ length: 8 }, (_, index) => `sql-${index}`),
          attempt: 0,
        },
        {
          itemType: "SQLDatabase",
          itemIds: ["sql-8", "sql-9"],
          attempt: 0,
        },
        {
          itemType: "KQLDatabase",
          itemIds: ["kql-0", "kql-1"],
          attempt: 0,
        },
      ]);
    });

    it("merges scanner and deep metadata from completed slices", () => {
      const base: RawSync = {
        schema: {
          sql: [
            {
              name: "dbo.Customers",
              objectType: "Table",
              columns: [{ name: "CustomerId", dataType: "int" }],
              measures: [],
            },
          ],
        },
        jobs: [],
        lineage: [],
        config: [],
        artifactMetadata: {},
        itemMetadata: {
          sql: {
            scannerMatched: true,
            ownerAvailable: true,
            sensitivity: { labelId: "scanner-label" },
          },
        },
        objectEdges: [],
        sections: {
          definitions: { status: "unsupported", code: "not-applicable" },
        },
        capabilities: {
          definitionEnrichment: {
            status: "unsupported",
            code: "not-applicable",
          },
        },
        errors: [],
      };
      const enrichment: RawSync = {
        schema: {
          sql: [
            {
              name: "dbo.Customers",
              objectType: "Managed",
              columns: [{ name: "Name", dataType: "nvarchar" }],
              measures: [],
            },
          ],
        },
        jobs: [{ itemId: "sql", jobType: "Refresh", status: "Completed" }],
        lineage: [{ source: "sql", target: "report", relation: "report" }],
        config: [
          {
            itemId: "sql",
            section: "SQL database",
            label: "Server",
            value: "example.database.fabric.microsoft.com",
          },
        ],
        artifactMetadata: { sql: { kind: "sql" } },
        itemMetadata: {
          sql: {
            sensitivity: {
              labelId: "detail-label",
              displayName: "Confidential",
            },
            tags: [{ id: "tag-1", displayName: "Finance" }],
          },
        },
        objectEdges: [{ relation: "contains" }],
        sections: {
          definitions: { status: "complete" },
        },
        capabilities: {
          definitionEnrichment: { status: "complete" },
        },
        errors: [],
      };

      const merged = mergeSyncEnrichment(base, enrichment);

      expect(merged.schema?.sql).toHaveLength(1);
      expect(merged.schema?.sql[0]).toMatchObject({
        objectType: "Managed",
      });
      expect(merged.schema?.sql[0].columns).toHaveLength(2);
      expect(merged.jobs).toHaveLength(1);
      expect(merged.lineage).toHaveLength(1);
      expect(merged.objectEdges).toHaveLength(1);
      expect(merged.capabilities?.definitionEnrichment?.status).toBe("complete");
      expect(merged.itemMetadata?.sql).toMatchObject({
        scannerMatched: true,
        ownerAvailable: true,
        sensitivity: {
          labelId: "detail-label",
          displayName: "Confidential",
        },
        tags: [{ id: "tag-1", displayName: "Finance" }],
      });
    });

    it("accepts a completed prefix with an explicit continuation", () => {
      const enrichment: RawSync = {
        schemaVersion: 2,
        syncMode: "enrichment",
        requestedItemIds: ["one", "two"],
        completedItemIds: ["one"],
        remainingItemIds: ["two"],
        schema: { one: [] },
        config: [],
        jobs: [],
        lineage: [],
        artifactMetadata: {},
        itemMetadata: {},
        objectEdges: [],
        sections: {},
        capabilities: {},
        errors: [],
      };

      expect(() =>
        validateSyncEnrichment(enrichment, ["one", "two"]),
      ).not.toThrow();
      expect(() =>
        validateSyncEnrichment(
          { ...enrichment, remainingItemIds: [] },
          ["one", "two"],
        ),
      ).toThrow(/invalid resumable sync response/i);

      expect(() =>
        validateSyncEnrichment(
          {
            ...enrichment,
            requestedItemIds: ["one"],
            completedItemIds: [],
            remainingItemIds: ["one"],
            schema: {},
          },
          ["one"],
        ),
      ).not.toThrow();
    });

    it("rejects enrichment failures before snapshot publication", () => {
      const enrichment: RawSync = {
        schemaVersion: 2,
        syncMode: "enrichment",
        requestedItemIds: ["one"],
        completedItemIds: ["one"],
        remainingItemIds: [],
        itemFailures: { one: "invalid-response" },
        schema: { one: [] },
        config: [],
        jobs: [],
        lineage: [],
        artifactMetadata: {},
        itemMetadata: {},
        objectEdges: [],
        sections: {},
        capabilities: {},
        errors: ["enrichment:one: invalid-response"],
      };

      expect(() => validateSyncEnrichment(enrichment, ["one"])).toThrow(
        /could not enrich every requested item.*previous snapshot was preserved/i,
      );
    });
  });

  describe("sync request metadata tokens", () => {
    it("passes available audience tokens without manufacturing missing values", () => {
      expect(
        buildSyncRequestBody(workspaceId, {
          fabricToken: "fabric-token",
          kustoToken: "kusto-token",
        }),
      ).toEqual({
        workspaceId,
        fabricToken: "fabric-token",
        kustoToken: "kusto-token",
      });
    });

    it("renews only tokens that are close to expiry", () => {
      const token = (exp: number) => {
        const payload = btoa(JSON.stringify({ exp }))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
        return `header.${payload}.signature`;
      };
      const now = Date.parse("2026-09-05T12:00:00.000Z");

      expect(tokenNeedsRefresh(token(now / 1000 + 60), now)).toBe(true);
      expect(tokenNeedsRefresh(token(now / 1000 + 900), now)).toBe(false);
      expect(tokenNeedsRefresh("opaque-token", now)).toBe(false);
    });

  });

  describe("sync response parsing", () => {
    it("unwraps a Fabric UDF output envelope", () => {
      expect(
        parseSyncResponseText(
          JSON.stringify({ output: completeSync() }),
          100_000,
        ),
      ).toMatchObject({
        workspace: { id: workspaceId },
      });
    });

    it("rejects oversized and malformed payloads", () => {
      expect(() =>
        parseSyncResponseText(JSON.stringify({ output: completeSync() }), 10),
      ).toThrow(/exceeded.*safety limit/i);
      expect(() => parseSyncResponseText("{", 100)).toThrow(
        /invalid sync response/i,
      );
    });

    it("stops reading a streamed response above the byte limit", async () => {
      const response = new Response("0123456789abcdef");

      await expect(readBoundedResponseText(response, 8)).rejects.toThrow(
        /exceeded.*safety limit/i,
      );
    });

    it("recognizes Fabric UDF platform timeout responses", () => {
      expect(isUdfTimeoutFailure(504, "")).toBe(true);
      expect(
        isUdfTimeoutFailure(
          500,
          "fabric.functions.UserDataFunctionTimeoutError: exceeded the timeout limit",
        ),
      ).toBe(true);
      expect(isUdfTimeoutFailure(500, "unrelated error")).toBe(false);
    });
  });

  it("rejects reported scanner errors before persistence", () => {
    const raw = completeSync();
    raw.errors = ["scan: Tenant.Read.All is unavailable"];

    expect(() => validateRawSync(raw, workspaceId)).toThrow(
      /incomplete sync.*previous snapshot was preserved/i,
    );
  });

  it("accepts optional v2 section failures when required sections completed", () => {
    const raw = completeSync();
    raw.schemaVersion = 2;
    raw.sections = {
      workspace: { status: "complete" },
      items: { status: "complete" },
      roleAssignments: { status: "complete" },
      scanner: { status: "complete" },
      schema: { status: "complete" },
      lineage: { status: "complete" },
      access: { status: "complete" },
      config: { status: "complete" },
      jobs: { status: "failed", code: "transient-upstream" },
    };
    raw.capabilities = {
      endorsement: { status: "complete" },
      sensitivity: { status: "complete" },
      tags: { status: "complete" },
      ownership: { status: "complete", code: "type-specific" },
      kqlSchema: { status: "failed", code: "kusto-token-unavailable" },
    };
    raw.itemMetadata = {
      "item-1": { scannerMatched: true },
    };
    raw.errors = ["jobs: transient upstream failure"];

    expect(() => validateRawSync(raw, workspaceId)).not.toThrow();
  });

  it("rejects deadline exhaustion even when it occurred in optional metadata", () => {
    const raw = completeSync();
    raw.schemaVersion = 2;
    raw.sections = {
      workspace: { status: "complete" },
      items: { status: "complete" },
      roleAssignments: { status: "complete" },
      scanner: { status: "complete" },
      schema: { status: "complete" },
      lineage: { status: "complete" },
      access: { status: "complete" },
      config: { status: "complete" },
    };
    raw.capabilities = {
      endorsement: { status: "complete" },
      sensitivity: { status: "complete" },
      tags: { status: "complete" },
      ownership: { status: "complete", code: "type-specific" },
      definitions: { status: "failed", code: "deadline-exhausted" },
    };
    raw.itemMetadata = {
      "item-1": { scannerMatched: true },
    };
    raw.errors = ["definitions:item-1: deadline-exhausted"];

    expect(() => validateRawSync(raw, workspaceId)).toThrow(
      /execution budget.*previous snapshot was preserved/i,
    );
    expect(syncDeadlineExceeded(raw)).toBe(true);
  });

  it("treats request timeouts and deferred retry windows as resumable", () => {
    expect(
      syncDeadlineExceeded({
        errors: ["itemDetails: request-timeout"],
      }),
    ).toBe(true);
    expect(
      syncDeadlineExceeded({
        capabilities: {
          kqlSchema: {
            status: "failed",
            code: "retry-after-deferred",
          },
        },
      }),
    ).toBe(true);
  });

  it("rejects failed required v2 sections", () => {
    const raw = completeSync();
    raw.schemaVersion = 2;
    raw.sections = {
      workspace: { status: "complete" },
      items: { status: "complete" },
      roleAssignments: { status: "complete" },
      scanner: { status: "failed", code: "scanner-failed" },
      schema: { status: "complete" },
      lineage: { status: "complete" },
      access: { status: "complete" },
      config: { status: "complete" },
    };
    raw.capabilities = {
      endorsement: { status: "complete" },
      sensitivity: { status: "complete" },
      tags: { status: "complete" },
      ownership: { status: "complete", code: "type-specific" },
    };
    raw.itemMetadata = {
      "item-1": { scannerMatched: true },
    };
    raw.errors = ["scanner: failed"];

    expect(() => validateRawSync(raw, workspaceId)).toThrow(
      /incomplete sync.*scanner/i,
    );
  });

  it("rejects a missing mandatory result set", () => {
    const raw = completeSync();
    delete raw.roleAssignments;

    expect(() => validateRawSync(raw, workspaceId)).toThrow(
      /missing roleAssignments.*previous snapshot was preserved/i,
    );
  });

  it("accepts an empty workspace when mandatory sections completed", () => {
    const raw = completeSync();
    raw.items = [];

    expect(() => validateRawSync(raw, workspaceId)).not.toThrow();
  });

  it("rejects an empty role snapshot", () => {
    const raw = completeSync();
    raw.roleAssignments = [];

    expect(() => validateRawSync(raw, workspaceId)).toThrow(
      /no workspace role assignments.*previous snapshot was preserved/i,
    );
  });

  it("normalizes Fabric timestamps without zones as UTC", () => {
    expect(normalizeFabricTimestamp("2026-08-30T08:15:00")).toBe(
      "2026-08-30T08:15:00.000Z",
    );
    expect(normalizeFabricTimestamp("2026-08-30T10:15:00+02:00")).toBe(
      "2026-08-30T08:15:00.000Z",
    );
  });

  it("does not invent lineage from matching display names", () => {
    const raw = completeSync();
    raw.items = [
      { id: "lake", type: "Lakehouse", displayName: "Shared" },
      { id: "endpoint", type: "SQLEndpoint", displayName: "Shared" },
    ];
    raw.lineage = [];

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(atlas.edges).toEqual([]);
  });

  it("keeps official lineage IDs and direction intact", () => {
    const raw = completeSync();
    raw.items = [
      { id: "flow-a", type: "Dataflow", displayName: "Flow A" },
      { id: "flow-b", type: "Dataflow", displayName: "Flow B" },
      { id: "model-a", type: "SemanticModel", displayName: "Model A" },
      { id: "model-b", type: "SemanticModel", displayName: "Model B" },
      { id: "mart-a", type: "Datamart", displayName: "Mart A" },
      { id: "mart-b", type: "Datamart", displayName: "Mart B" },
    ];
    raw.itemMetadata = Object.fromEntries(
      raw.items.map((item) => [String(item.id), { scannerMatched: true }]),
    );
    raw.lineage = [
      { source: "flow-a", target: "flow-b", relation: "dataflow" },
      { source: "flow-a", target: "mart-a", relation: "dataflow" },
      { source: "mart-a", target: "flow-a", relation: "datamart" },
      {
        source: "model-a",
        target: "model-b",
        relation: "semantic model",
      },
      { source: "mart-a", target: "mart-b", relation: "datamart" },
    ];

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(atlas.edges).toEqual(raw.lineage);
  });

  it("rejects non-numeric schema rows at the client boundary", () => {
    const raw = completeSync();
    raw.schema = {
      "item-1": [
        {
          name: "Unsafe",
          rows: [{ businessValue: "must not cross" }] as unknown as number,
          columns: [],
          measures: [],
        },
      ],
    };

    expect(() => validateRawSync(raw, workspaceId)).toThrow(
      /non-numeric row count/i,
    );
  });

  it("rejects malformed nested section records", () => {
    const raw = completeSync();
    raw.access = [
      {
        itemId: "item-1",
        accessRight: "Read",
      },
    ];

    expect(() => validateRawSync(raw, workspaceId)).toThrow(
      /malformed section records/i,
    );
  });

  it("maps authoritative scanner metadata without inventing ownership", () => {
    const raw = completeSync();
    raw.schemaVersion = 2;
    raw.sections = {
      workspace: { status: "complete" },
      items: { status: "complete" },
      roleAssignments: { status: "complete" },
      scanner: { status: "complete" },
      schema: { status: "complete" },
      lineage: { status: "complete" },
      access: { status: "complete" },
      config: { status: "complete" },
    };
    raw.capabilities = {
      endorsement: { status: "complete" },
      sensitivity: { status: "complete" },
      tags: { status: "complete" },
      ownership: { status: "complete", code: "type-specific" },
      kqlSchema: { status: "failed", code: "kusto-token-unavailable" },
    };
    raw.syncedAt = "2026-08-30T09:00:00";
    raw.itemMetadata = {
      "item-1": {
        scannerMatched: true,
        ownerAvailable: false,
        configuredBy: "builder@example.com",
        modifiedBy: "editor@example.com",
        modifiedDateTime: "2026-08-30T08:00:00",
        endorsement: {
          value: "Certified",
          certifiedBy: "certifier@example.com",
        },
        sensitivity: { labelId: "label-guid" },
        tags: [{ id: "tag-guid" }],
      },
    };

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(atlas.items[0]).toMatchObject({
      configuredBy: "builder@example.com",
      modifiedBy: "editor@example.com",
      endorsement: "certified",
      endorsementBy: "certifier@example.com",
      sensitivityLabelId: "label-guid",
      tagIds: ["tag-guid"],
      ownerMetadataAvailable: false,
      sensitivityMetadataAvailable: true,
      endorsementMetadataAvailable: true,
      tagMetadataAvailable: true,
      updatedAt: "2026-08-30T08:00:00.000Z",
    });
    expect(atlas.items[0].ownerName).toBeUndefined();
    expect(atlas.workspace).toMatchObject({
      syncedAt: "2026-08-30T09:00:00.000Z",
      syncSections: {
        workspace: { status: "complete" },
        scanner: { status: "complete" },
        metadataEndorsement: { status: "complete" },
        metadataSensitivity: { status: "complete" },
        metadataTags: { status: "complete" },
        metadataOwnership: {
          status: "complete",
          code: "type-specific",
        },
        metadataKqlSchema: {
          status: "failed",
          code: "kusto-token-unavailable",
        },
      },
    });
  });

  it("maps an explicit documented owner and preserves future endorsement values", () => {
    const raw = completeSync();
    raw.itemMetadata = {
      "item-1": {
        scannerMatched: true,
        ownerAvailable: true,
        owner: {
          principalId: "owner-id",
          displayName: "Owner Name",
          email: "owner@example.com",
          source: "workspaceInfo.configuredBy",
        },
        endorsement: {
          value: "NewFutureStatus",
        },
      },
    };
    raw.capabilities = {
      endorsement: { status: "complete" },
      sensitivity: { status: "complete", code: "label-ids" },
      tags: { status: "complete", code: "tag-ids" },
      ownership: { status: "complete", code: "type-specific" },
    };

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(atlas.items[0]).toMatchObject({
      ownerName: "Owner Name",
      ownerEmail: "owner@example.com",
      ownerMetadataAvailable: true,
      endorsement: "none",
      endorsementRaw: "NewFutureStatus",
    });
  });

  it("uses stable principal IDs and models tenant-wide item access", () => {
    const raw = completeSync();
    raw.roleAssignments = [
      {
        role: "Admin",
        principal: {
          id: "principal-1",
          displayName: "Administrator",
          type: "User",
        },
      },
    ];
    raw.access = [
      {
        itemId: "item-1",
        principalId: "principal-1",
        principalName: "Administrator",
        principalType: "User",
        accessRight: "ReadWrite",
      },
      {
        itemId: "item-1",
        principalId: "entire-tenant",
        principalName: "EntireTenant",
        userType: "EntireTenant",
        tenantWide: true,
        accessRight: "Read",
      },
    ];

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(atlas.principals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId: "principal-1",
          displayName: "Administrator",
        }),
        expect.objectContaining({
          principalId: "entire-tenant",
          displayName: "Entire tenant",
          kind: "group",
        }),
      ]),
    );
    expect(atlas.grants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalRef: "principal-1",
          source: "workspaceRole",
        }),
        expect.objectContaining({
          principalRef: "principal-1",
          itemFabricId: "item-1",
        }),
        expect.objectContaining({
          principalRef: "entire-tenant",
          flag: "broad",
        }),
      ]),
    );
  });

  it("uses authoritative guest evidence and preserves unknown external state", () => {
    const raw = completeSync();
    raw.access = [
      {
        itemId: "item-1",
        principalId: "guest-id",
        principalName: "Guest User",
        principalEmail: "guest@vendor.example",
        principalType: "User",
        userType: "Guest",
        accessRight: "Read",
      },
      {
        itemId: "item-1",
        principalId: "unknown-id",
        principalName: "Unknown User",
        principalEmail: "unknown@example.com",
        principalType: "User",
        accessRight: "Read",
      },
    ];

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(
      atlas.principals.find(
        (principal) => principal.principalId === "guest-id",
      ),
    ).toMatchObject({ kind: "guest", external: true });
    expect(
      atlas.principals.find(
        (principal) => principal.principalId === "unknown-id",
      ),
    ).toMatchObject({ kind: "user", external: undefined });
  });

  it("correlates legacy item access with role-assignment principals", () => {
    const raw = completeSync();
    raw.roleAssignments = [
      {
        role: "Member",
        principal: {
          id: "principal-legacy",
          displayName: "Legacy User",
          type: "User",
          userDetails: {
            userPrincipalName: "legacy@example.com",
          },
        },
      },
    ];
    raw.access = [
      {
        itemId: "item-1",
        principalName: "Legacy User",
        principalEmail: "legacy@example.com",
        principalType: "User",
        accessRight: "Read",
      },
    ];

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(atlas.principals).toHaveLength(1);
    expect(atlas.grants.map((grant) => grant.principalRef)).toEqual([
      "principal-legacy",
      "principal-legacy",
    ]);
  });

  it("canonicalizes equivalent principal UUIDs across APIs", () => {
    const raw = completeSync();
    raw.roleAssignments = [
      {
        role: "Member",
        principal: {
          id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
          displayName: "Canonical User",
          type: "User",
        },
      },
    ];
    raw.access = [
      {
        itemId: "item-1",
        principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        principalName: "Canonical User",
        principalType: "User",
        accessRight: "Read",
      },
    ];

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(atlas.principals).toHaveLength(1);
    expect(atlas.principals[0].principalId).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(new Set(atlas.grants.map((grant) => grant.principalRef))).toEqual(
      new Set(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]),
    );
  });

  it("keeps an explicit item principal ID authoritative over a matching name", () => {
    const raw = completeSync();
    raw.roleAssignments = [
      {
        role: "Member",
        principal: {
          id: "workspace-principal",
          displayName: "Shared name",
          type: "User",
        },
      },
    ];
    raw.access = [
      {
        itemId: "item-1",
        principalId: "item-principal",
        principalName: "Shared name",
        principalType: "User",
        accessRight: "Read",
      },
    ];

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(atlas.principals.map((principal) => principal.principalId)).toEqual(
      ["workspace-principal", "item-principal"],
    );
    expect(
      atlas.grants.find((grant) => grant.itemFabricId === "item-1"),
    ).toMatchObject({ principalRef: "item-principal" });
  });

  it("rejects placeholder item IDs and generic item types", () => {
    const missingId = completeSync();
    missingId.items = [{ id: "undefined", type: "Lakehouse" }];
    expect(() => validateRawSync(missingId, workspaceId)).toThrow(
      /invalid workspace item metadata/i,
    );

    const missingType = completeSync();
    missingType.items = [{ id: "real-id", type: "ITEM" }];
    expect(() => validateRawSync(missingType, workspaceId)).toThrow(
      /invalid workspace item metadata/i,
    );
  });

  it("falls back to the real item ID when its display name is missing", () => {
    const raw = completeSync();
    raw.items = [
      { id: "real-item-id", type: "Lakehouse", displayName: " undefined " },
    ];

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(atlas.items[0]).toMatchObject({
      fabricId: "real-item-id",
      displayName: "real-item-id",
      itemType: "Lakehouse",
    });
  });
});

describe("MSAL account binding", () => {
  const accounts: MsalAccount[] = [
    {
      homeAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.tenant",
      localAccountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenantId: "tenant-a",
      username: "first@example.com",
    },
    {
      homeAccountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.tenant",
      localAccountId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      tenantId: "tenant-b",
      username: "guest_name#EXT#@tenant.onmicrosoft.com",
      idTokenClaims: {
        oid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        email: "second@example.com",
      },
    },
  ];

  it("selects the account matching the current Rayfin subject", () => {
    expect(
      selectMsalAccount(accounts, {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        email: "second@example.com",
      }),
    ).toBe(accounts[1]);
  });

  it("does not fall back to the first cached account", () => {
    expect(
      selectMsalAccount(accounts, {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        email: "unknown@example.com",
      }),
    ).toBeUndefined();
  });

  it("does not select a same-email account from another tenant", () => {
    expect(
      selectMsalAccount(
        accounts,
        { email: "first@example.com" },
        "tenant-b",
      ),
    ).toBeUndefined();
  });

  it("matches normalized email claims", () => {
    expect(
      accountMatchesIdentity(accounts[1], {
        email: " SECOND@EXAMPLE.COM ",
      }),
    ).toBe(true);
  });
});

describe("object inventory mapping", () => {
  it("preserves semantic model object metadata", () => {
    const raw = completeSync();
    raw.items = [
      {
        id: "model-1",
        type: "SemanticModel",
        displayName: "Sales model",
      },
    ];
    raw.schema = {
      "model-1": [
        {
          name: "Sales",
          objectType: "Model table",
          source: "Power BI admin scanner",
          description: "Sales facts",
          columns: [
            {
              name: "Amount",
              dataType: "Decimal",
              description: "Net amount",
              isHidden: false,
            },
          ],
          measures: [
            {
              name: "Revenue",
              expression: "SUM(Sales[Amount])",
              description: "Total revenue",
              isHidden: false,
            },
          ],
        },
      ],
    };

    const atlas = mapSyncToAtlas(raw, {
      fabricId: workspaceId,
      displayName: "Atlas",
      capacity: "",
      region: "",
    });

    expect(atlas.schema?.["model-1"]?.[0]).toMatchObject({
      name: "Sales",
      objectType: "Model table",
      source: "Power BI admin scanner",
      description: "Sales facts",
      columns: [{ name: "Amount", description: "Net amount" }],
      measures: [
        {
          name: "Revenue",
          expr: "SUM(Sales[Amount])",
          description: "Total revenue",
        },
      ],
    });
  });
});
