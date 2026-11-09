import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY_DRAFT,
  connectionBadges,
  connectionFlags,
  connectionRiskScore,
  connectionsCsv,
  connectorGlyph,
  diffConnectionInventories,
  endpointLabel,
  evaluateReadiness,
  ownerCell,
  parseConnectionEnvelope,
  principalLabel,
  readinessBadges,
  workspaceConnectionUsages,
  type ConnectionInventoryView,
  type ConnectionRole,
  type FabricConnectionRecord,
} from "./connections";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const DAY = 86_400_000;
const ID = "11111111-1111-4111-8111-111111111111";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const GROUP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function role(principalId: string, principalType: string, value = "Owner"): ConnectionRole {
  return { principalId, principalType, role: value };
}

function connection(overrides: Partial<FabricConnectionRecord> = {}): FabricConnectionRecord {
  return {
    id: ID,
    displayName: "adls-landing",
    connectivityType: "ShareableCloud",
    connectorType: "AzureDataLakeStorage",
    path: "https://lake.dfs.core.windows.net/landing",
    credentialType: "WorkspaceIdentity",
    singleSignOnType: "None",
    lastCredentialUsedAt: new Date(NOW - DAY).toISOString(),
    rolesStatus: "complete",
    roles: [role(USER_A, "User"), role(USER_B, "User")],
    ...overrides,
  };
}

describe("connection envelope", () => {
  it("keeps unnamed personal connections and drops records outside the contract", () => {
    const view = parseConnectionEnvelope({
      protocolVersion: 1,
      authoritative: false,
      collectedAt: "2026-11-09T10:00:00Z",
      status: { status: "complete" },
      truncated: false,
      roleLookups: { done: 1, skipped: 0, failed: 0 },
      connections: [
        { id: ID, connectivityType: "PersonalCloud", connectorType: "AdminInsights", rolesStatus: "personal", roles: [] },
        { id: ID, displayName: "duplicate", connectivityType: "ShareableCloud", rolesStatus: "complete", roles: [] },
        { id: "nope", displayName: "bad", connectivityType: "ShareableCloud" },
      ],
    });
    expect(view?.connections).toEqual([
      { id: ID, displayName: "Unnamed connection (AdminInsights)", connectivityType: "PersonalCloud", connectorType: "AdminInsights", rolesStatus: "personal", roles: [] },
    ]);
    expect(parseConnectionEnvelope({ protocolVersion: 2, authoritative: false })).toBeUndefined();
  });
});

describe("connection flags", () => {
  it("flags a single user owner but not a single group or service principal", () => {
    expect(connectionFlags(connection({ roles: [role(USER_A, "User")] }), NOW)).toEqual(["single-owner"]);
    expect(connectionFlags(connection({ roles: [role(GROUP, "Group")] }), NOW)).toEqual([]);
    expect(connectionFlags(connection({ roles: [role(GROUP, "ServicePrincipal")] }), NOW)).toEqual([]);
    expect(connectionFlags(connection(), NOW)).toEqual(["user-owners-only"]);
  });

  it("separates missing, pending and unknown owners", () => {
    expect(connectionFlags(connection({ roles: [role(USER_A, "User", "PendingOwner")] }), NOW)).toEqual(["pending-owner"]);
    expect(connectionFlags(connection({ roles: [role(USER_A, "User", "User")] }), NOW)).toEqual(["no-owner"]);
    expect(connectionFlags(connection({ rolesStatus: "failed", roles: [] }), NOW)).toEqual(["owners-unknown"]);
    expect(connectionFlags(connection({ rolesStatus: "personal", roles: [] }), NOW)).toEqual([]);
  });

  it("flags stale credentials and unencrypted gateway connections only", () => {
    const stale = connection({ roles: [role(GROUP, "Group")], lastCredentialUsedAt: new Date(NOW - 90 * DAY).toISOString() });
    expect(connectionFlags(stale, NOW)).toEqual(["credentials-unused"]);
    const cloud = connection({ roles: [role(GROUP, "Group")], connectionEncryption: "NotEncrypted", path: "lake;db" });
    expect(connectionFlags(cloud, NOW)).toEqual([]);
    const gateway = { ...cloud, connectivityType: "OnPremisesGateway", path: "10.0.0.4:1521/ERP" };
    expect(connectionFlags(gateway, NOW)).toEqual(["not-encrypted"]);
    expect(connectionFlags({ ...gateway, path: "https://intranet/api" }, NOW)).toEqual([]);
  });
});

describe("policy readiness", () => {
  it("leaves gateways out, fails disallowed methods and asks to check OAuth issuers", () => {
    expect(evaluateReadiness(connection({ connectivityType: "OnPremisesGateway" }), DEFAULT_POLICY_DRAFT).status)
      .toBe("not-applicable");
    expect(evaluateReadiness(connection({ credentialType: "Key" }), DEFAULT_POLICY_DRAFT))
      .toEqual({ status: "fail", reasons: ["Key is not in the draft allowlist."] });
    expect(evaluateReadiness(connection({ credentialType: "OAuth2" }), DEFAULT_POLICY_DRAFT).status).toBe("check");
    expect(evaluateReadiness(connection(), DEFAULT_POLICY_DRAFT).status).toBe("pass");
  });

  it("blocks a connector kind except on allowed endpoint prefixes", () => {
    const draft = { methods: [], blockedKinds: [{ kind: "AzureDataLakeStorage", allowedEndpoints: ["https://lake.dfs"] }] };
    expect(evaluateReadiness(connection(), draft).status).toBe("pass");
    expect(evaluateReadiness(connection({ path: "https://other.dfs.core.windows.net" }), draft))
      .toEqual({ status: "fail", reasons: ["Connection kind AzureDataLakeStorage is blocked."] });
  });

  it("explains each draft result as a badge", () => {
    expect(readinessBadges(evaluateReadiness(connection({ credentialType: "Key" }), DEFAULT_POLICY_DRAFT)))
      .toEqual([{ id: "readiness-0", label: "Key is not in the draft allowlist", tone: "danger" }]);
    expect(readinessBadges({ status: "check", reasons: ["The API does not say whether this OAuth 2.0 issuer is Entra ID: check the connection."] }))
      .toEqual([{ id: "readiness-0", label: "Check the OAuth 2.0 issuer", tone: "info" }]);
  });
});

describe("table presentation", () => {
  it("orders badges and connections by urgency", () => {
    const pending = connection({ roles: [role(USER_A, "User", "PendingOwner")], credentialType: "Key" });
    const pendingBadges = connectionBadges(pending, connectionFlags(pending, NOW), evaluateReadiness(pending, DEFAULT_POLICY_DRAFT), NOW);
    expect(pendingBadges.map((badge) => badge.label)).toEqual(["Pending owner", "Fails allowlist"]);
    const healthy = connection({ roles: [role(GROUP, "Group")] });
    const healthyBadges = connectionBadges(healthy, connectionFlags(healthy, NOW), evaluateReadiness(healthy, DEFAULT_POLICY_DRAFT), NOW);
    expect(healthyBadges).toEqual([]);
    expect(connectionRiskScore(pendingBadges)).toBeGreaterThan(connectionRiskScore(healthyBadges));
    const stale = connection({ roles: [role(GROUP, "Group")], lastCredentialUsedAt: new Date(NOW - 147 * DAY).toISOString() });
    expect(connectionBadges(stale, connectionFlags(stale, NOW), { status: "pass", reasons: [] }, NOW))
      .toEqual([{ id: "credentials-unused", label: "Unused 147 d", tone: "muted" }]);
  });

  it("summarizes owners as one qualified name or a count", () => {
    const directory = [{ principalId: USER_A.toUpperCase(), displayName: "Julien Martin" }];
    expect(ownerCell(connection({ roles: [role(USER_A, "User")] }), directory)).toEqual({ text: "Julien Martin" });
    expect(ownerCell(connection({ roles: [{ ...role(GROUP, "Group"), displayName: "Finance" }] }))).toEqual({ text: "Finance", suffix: "group" });
    expect(ownerCell(connection())).toEqual({ text: "2 users" });
    expect(ownerCell(connection({ roles: [role(USER_A, "User"), role(GROUP, "Group")] }))).toEqual({ text: "2 owners" });
    expect(ownerCell(connection({ roles: [role(USER_A, "User", "PendingOwner")] }), directory))
      .toEqual({ text: "Julien Martin", suffix: "pending" });
    expect(ownerCell(connection({ rolesStatus: "personal", roles: [] })).suffix).toBe("personal");
    expect(principalLabel(role(USER_B, "User"))).toBe("User bbbbbbbb");
  });

  it("shortens endpoints and connector names for the table", () => {
    expect(endpointLabel("https://lake.dfs.core.windows.net/landing/")).toBe("lake.dfs.core.windows.net/landing");
    expect(endpointLabel('{"endpoint":"ns-events","entityPath":"orders","consumerGroup":"$Default"}'))
      .toBe("ns-events · orders · $Default");
    expect(endpointLabel("server;db")).toBe("server;db");
    expect(connectorGlyph("AzureDataLakeStorage")).toBe("ADLS");
    expect(connectorGlyph("MetricsDataConnector")).toBe("MDC");
    expect(connectorGlyph("http")).toBe("HTTP");
    expect(connectorGlyph(undefined)).toBe("?");
  });
});

describe("usage, changes and export", () => {
  it("names consuming items and workspaces from stored provenance rows", () => {
    const usages = workspaceConnectionUsages([{
      workspaceId: "ws-2",
      workspaceName: "Finance-Bronze",
      config: [
        { itemFabricId: "item-1", section: "Source provenance", label: "external-shortcut", value: `provider=AdlsGen2; connection=${ID.toUpperCase()}; consumer=item-1; field=target.adlsGen2.connectionId; location=Files/landing` },
        { itemFabricId: "item-1", section: "Source provenance", label: "Shortcut", value: "name=x; type=OneLake; location=Files/x" },
      ],
      items: [{ fabricId: "item-1", displayName: "lh_bronze", itemType: "Lakehouse" }],
    }]);
    expect(usages).toEqual([{
      connectionId: ID,
      itemId: "item-1",
      relation: "external-shortcut",
      provider: "AdlsGen2",
      field: "target.adlsGen2.connectionId",
      location: "Files/landing",
      workspaceId: "ws-2",
      workspaceName: "Finance-Bronze",
      itemName: "lh_bronze",
      itemType: "Lakehouse",
    }]);
  });

  it("compares two inventories", () => {
    const before: ConnectionInventoryView = {
      collectedAt: "2026-11-01T00:00:00Z", status: "complete", truncated: false,
      roleLookups: { done: 1, skipped: 0, failed: 0 }, connections: [connection({ roles: [role(USER_A, "User")] })],
    };
    const after: ConnectionInventoryView = {
      ...before,
      collectedAt: "2026-11-09T00:00:00Z",
      connections: [
        connection({ roles: [role(USER_A, "User"), role(GROUP, "Group")], credentialType: "Key" }),
        connection({ id: "22222222-2222-4222-8222-222222222222", displayName: "new" }),
      ],
    };
    expect(diffConnectionInventories(before, after).map((change) => change.kind).sort())
      .toEqual(["added", "authentication", "owners"]);
  });

  it("neutralizes spreadsheet formulas in the CSV export", () => {
    const csv = connectionsCsv([connection({ displayName: "=HYPERLINK(\"x\")" })], { now: NOW });
    expect(csv.split("\r\n")[1].startsWith("\"'=HYPERLINK(\"\"x\"\")\"")).toBe(true);
  });
});
