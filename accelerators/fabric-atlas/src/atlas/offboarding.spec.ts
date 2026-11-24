import { describe, expect, it } from "vitest";
import { buildOffboardingReport } from "./offboarding";
import type { ConnectionRole, FabricConnectionRecord } from "./connections";
import type { AtlasData, Item, Principal } from "./model";

const person: Principal = {
  principalId: "person-1",
  displayName: "Marie",
  email: "marie@example.com",
  kind: "user",
  workspaceRole: "Viewer",
};
const successor: Principal = {
  principalId: "person-2",
  displayName: "Alex",
  email: "alex@example.com",
  kind: "user",
  workspaceRole: "Viewer",
};
const item = (
  fabricId: string,
  ownerEmail?: string,
): Item => ({
  fabricId,
  displayName: fabricId,
  itemType: "Lakehouse",
  ownerEmail,
  ownerMetadataAvailable: true,
  health: "healthy",
  endorsement: "none",
  tags: [],
});

function data(): AtlasData {
  return {
    workspace: {
      fabricId: "workspace",
      displayName: "Workspace",
      capacity: "",
      region: "",
    },
    items: [
      item("upstream", successor.email),
      item("owned", "MARIE@example.com"),
      item("consumer"),
    ],
    principals: [person, successor],
    grants: [
      {
        principalRef: person.principalId,
        itemFabricId: "owned",
        accessLevel: "owner",
        source: "directShare",
      },
      {
        principalRef: successor.principalId,
        itemFabricId: "upstream",
        accessLevel: "owner",
        source: "directShare",
      },
    ],
    edges: [
      { source: "upstream", target: "owned", relation: "feeds" },
      { source: "owned", target: "consumer", relation: "feeds" },
    ],
    jobs: [],
    config: [],
    comments: [],
    syncRuns: [],
    schema: {},
  };
}

describe("buildOffboardingReport", () => {
  it("finds case-insensitive ownership, orphan risk and nearest successor", () => {
    const report = buildOffboardingReport(data(), person.principalId);

    expect(report.blocked).toBe(false);
    expect(report.owned.map((value) => value.fabricId)).toEqual(["owned"]);
    expect(report.soleOwned.map((value) => value.fabricId)).toEqual(["owned"]);
    expect(report.orphanRisk[0].consumers.map((value) => value.id)).toEqual([
      "consumer",
    ]);
    expect(report.reassignment[0]).toMatchObject({
      suggested: { principalId: successor.principalId },
      reasonCode: "nearest-upstream-owner",
    });
  });

  it("blocks ambiguous subjects instead of guessing", () => {
    const value = data();
    value.principals.push({ ...person, principalId: "person-duplicate" });
    value.grants[0].principalRef = "Marie";
    const report = buildOffboardingReport(value, "Marie");

    expect(report.blocked).toBe(true);
    expect(report.subject.resolution).toBe("ambiguous");
    expect(report.ownership).toEqual([]);
  });

  it("does not use owner display names as ownership evidence", () => {
    const value = data();
    value.items[1].ownerEmail = undefined;
    value.items[1].ownerName = "Marie";
    expect(
      buildOffboardingReport(value, person.principalId).owned,
    ).toEqual([]);
  });

  it("checks the principal against the roles of every connection", () => {
    const ids = {
      sole: "11111111-1111-4111-8111-111111111111",
      shared: "22222222-2222-4222-8222-222222222222",
      upn: "33333333-3333-4333-8333-333333333333",
      other: "44444444-4444-4444-8444-444444444444",
      pending: "55555555-5555-4555-8555-555555555555",
      unknown: "66666666-6666-4666-8666-666666666666",
      personal: "77777777-7777-4777-8777-777777777777",
    };
    const role = (principalId: string, name: string, displayName?: string): ConnectionRole => ({
      principalId,
      principalType: "User",
      role: name,
      ...(displayName ? { displayName } : {}),
    });
    const connection = (
      id: string,
      roles: ConnectionRole[],
      rolesStatus: FabricConnectionRecord["rolesStatus"] = "complete",
    ): FabricConnectionRecord => ({
      id,
      displayName: Object.entries(ids).find(([, value]) => value === id)![0],
      connectivityType: "ShareableCloud",
      connectorType: "AzureDataLakeStorage",
      rolesStatus,
      roles,
    });
    const value = data();
    value.connections = {
      collectedAt: "2026-11-09T12:00:00.000Z",
      status: "complete",
      truncated: false,
      roleLookups: { done: 5, skipped: 1, failed: 0 },
      connections: [
        connection(ids.sole, [role(person.principalId, "Owner"), role(successor.principalId, "PendingOwner")]),
        connection(ids.shared, [role("PERSON-1", "Owner"), role(successor.principalId, "Owner")]),
        // Fabric returns another object ID but the user principal name of the same person.
        connection(ids.upn, [role("88888888-8888-4888-8888-888888888888", "User", "Marie@Example.com")]),
        connection(ids.other, [role(successor.principalId, "Owner")]),
        connection(ids.pending, [role(person.principalId, "PendingOwner")]),
        connection(ids.unknown, [], "skipped"),
        connection(ids.personal, [], "personal"),
      ],
    };
    value.config = [
      {
        itemFabricId: "consumer",
        section: "Source provenance",
        label: "OneLake shortcut",
        value: `connection=${ids.sole}; consumer=consumer`,
      },
      {
        itemFabricId: "consumer",
        section: "Source provenance",
        label: "Mirroring source",
        value: `connection=${ids.pending}; consumer=consumer`,
      },
    ];

    const report = buildOffboardingReport(value, person.principalId);

    expect(
      report.connections.map((entry) => [entry.connection.displayName, entry.status, entry.match, entry.urgent]),
    ).toEqual([
      ["sole", "sole-owner", "object-id", true],
      ["pending", "pending-owner", "object-id", true],
      ["shared", "co-owner", "object-id", false],
      ["upn", "user", "upn", false],
    ]);
    expect(report.connections[0].otherPendingOwners).toHaveLength(1);
    expect(report.connections[0].usages).toEqual([
      expect.objectContaining({ itemName: "consumer", workspaceName: "Workspace" }),
    ]);
    expect(report.connectionRisk.map((entry) => entry.connection.displayName)).toEqual(["sole", "pending"]);
    expect(report.connectionCoverage).toEqual({
      available: true,
      collectedAt: "2026-11-09T12:00:00.000Z",
      checked: 5,
      unknown: 1,
      personal: 1,
    });

    const blocked = buildOffboardingReport(value, "nobody");
    expect(blocked.blocked).toBe(true);
    expect(blocked.connections).toEqual([]);
    expect(blocked.connectionCoverage.checked).toBe(5);
  });

  it("surfaces privileged and identity-linked items without claiming ownership", () => {
    const value = data();
    value.items.push({
      ...item("notebook"),
      itemType: "Notebook",
      ownerEmail: undefined,
      ownerMetadataAvailable: false,
      configuredBy: person.email,
    });
    value.grants.push({
      principalRef: person.principalId,
      itemFabricId: "notebook",
      accessLevel: "edit",
      source: "directShare",
    });

    const report = buildOffboardingReport(value, person.principalId);

    expect(report.workspaceOwnershipCoverage).toEqual({
      documented: 3,
      total: 4,
      unknown: 1,
      percentage: 75,
    });
    expect(report.privilegedReview).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({ fabricId: "notebook" }),
        evidence: expect.arrayContaining(["direct-edit-access"]),
      }),
    ]);
    expect(report.identityDependencies).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({ fabricId: "notebook" }),
        evidence: ["configured-by"],
      }),
    ]);
    expect(report.ownershipUnknown.map((entry) => entry.fabricId)).toContain(
      "notebook",
    );
  });
});
