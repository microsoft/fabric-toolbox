// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  collectTenantConnections,
  safeConnectionPath,
} from "../../rayfin/functions/src/tenant-connections";

const API = "https://api.fabric.microsoft.com";
const SHARED = "11111111-1111-4111-8111-111111111111";
const PERSONAL = "22222222-2222-4222-8222-222222222222";
const GATEWAY = "33333333-3333-4333-8333-333333333333";
const OWNER = "44444444-4444-4444-8444-444444444444";
const GROUP = "55555555-5555-4555-8555-555555555555";
const NO_SLEEP = async () => undefined;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

interface Call {
  url: URL;
  token: string;
}

function recordingFetch(handler: (call: Call) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const call = { url, token: headers.get("authorization")?.replace(/^Bearer /, "") ?? "" };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

describe("tenantCollectConnections", () => {
  it("pages with the continuation token, looks up shared owners only and keeps no credential", async () => {
    const { fetch, calls } = recordingFetch(({ url }) => {
      if (url.pathname === "/v1/admin/connections" && !url.searchParams.has("continuationToken")) {
        return json({
          value: [
            {
              id: SHARED,
              displayName: "adls-landing",
              connectivityType: "ShareableCloud",
              connectionDetails: { type: "AzureDataLakeStorage", path: "https://user:pw@lake.dfs.core.windows.net/landing?sig=secret#frag" },
              privacyLevel: "Organizational",
              credentialDetails: { credentialType: "Key", singleSignOnType: "None", connectionEncryption: "NotEncrypted", skipTestConnection: false },
              connectionRecency: { lastCredentialUsedDateTime: "2026-11-01T10:00:00Z" },
            },
            { id: "not-a-uuid", displayName: "broken", connectivityType: "ShareableCloud" },
          ],
          continuationToken: "page-2",
          continuationUri: `${API}/v1/connections?continuationToken=page-2`,
        });
      }
      if (url.pathname === "/v1/admin/connections") {
        expect(url.searchParams.get("continuationToken")).toBe("page-2");
        return json({
          value: [
            { id: PERSONAL, connectivityType: "PersonalCloud", connectionDetails: { type: "AdminInsights", path: "AdminInsights" } },
            {
              id: GATEWAY,
              displayName: "oracle-erp",
              connectivityType: "OnPremisesGateway",
              gatewayId: OWNER,
              connectionDetails: { type: "Oracle", path: "10.0.0.4:1521/ERP" },
              credentialDetails: { credentialType: "Basic", connectionEncryption: "NotEncrypted" },
            },
          ],
        });
      }
      if (url.pathname === `/v1/admin/connections/${SHARED}/roleAssignments`) {
        return json({
          value: [
            { principal: { id: OWNER, type: "User", userDetails: { userPrincipalName: "owner@contoso.com" } }, role: "Owner" },
            { principal: { id: OWNER, type: "User" }, role: "Owner" },
            { principal: { id: GROUP, type: "Group" }, role: "User" },
            { principal: { id: "bad", type: "User" }, role: "Owner" },
          ],
        });
      }
      return json({ errorCode: "NotFound" }, 404);
    });

    const envelope = await collectTenantConnections("app-token", { correlationId: null, delegatedToken: "delegated-token" }, {
      fetch,
      sleep: NO_SLEEP,
      limits: { maxAttempts: 1 },
    });

    expect(envelope.status).toEqual({ status: "complete" });
    expect(envelope.connections.map((connection) => connection.id)).toEqual([SHARED, PERSONAL, GATEWAY]);
    const [shared, personal, gateway] = envelope.connections;
    expect(shared).toMatchObject({
      displayName: "adls-landing",
      connectorType: "AzureDataLakeStorage",
      path: "https://lake.dfs.core.windows.net/landing",
      credentialType: "Key",
      connectionEncryption: "NotEncrypted",
      lastCredentialUsedAt: "2026-11-01T10:00:00.000Z",
      rolesStatus: "complete",
    });
    expect(shared.roles).toEqual([
      { principalId: OWNER, principalType: "User", role: "Owner", displayName: "owner@contoso.com" },
      { principalId: GROUP, principalType: "Group", role: "User" },
    ]);
    expect(personal).toMatchObject({ displayName: "Unnamed connection (AdminInsights)", rolesStatus: "personal", roles: [] });
    expect(gateway.rolesStatus).toBe("failed");
    expect(envelope.roleLookups).toEqual({ done: 1, skipped: 0, failed: 1 });
    expect(calls.some((call) => call.url.pathname.includes(PERSONAL))).toBe(false);
    expect(calls.every((call) => call.token === "delegated-token")).toBe(true);
    expect(JSON.stringify(envelope)).not.toMatch(/secret|pw@|frag/);
  });

  it("falls back to the application token when the delegated token is refused", async () => {
    const { fetch, calls } = recordingFetch(({ url, token }) => {
      if (token !== "app-token") return json({ errorCode: "Unauthorized" }, 401);
      if (url.pathname === "/v1/admin/connections") {
        return json({ value: [{ id: SHARED, displayName: "shared", connectivityType: "ShareableCloud" }] });
      }
      return json({ value: [{ principal: { id: GROUP, type: "Group" }, role: "Owner" }] });
    });

    const envelope = await collectTenantConnections("app-token", { correlationId: null, delegatedToken: "delegated-token" }, {
      fetch,
      sleep: NO_SLEEP,
      limits: { maxAttempts: 1 },
    });

    expect(envelope.status.status).toBe("complete");
    expect(envelope.connections[0].roles).toEqual([{ principalId: GROUP, principalType: "Group", role: "Owner" }]);
    expect(calls.filter((call) => call.url.pathname.endsWith("/roleAssignments")).every((call) => call.token === "app-token")).toBe(true);
  });

  it("reports the inventory as unsupported when both identities are refused", async () => {
    const { fetch } = recordingFetch(() => json({ errorCode: "InsufficientPrivileges" }, 403));

    const envelope = await collectTenantConnections("app-token", { correlationId: null, delegatedToken: "delegated-token" }, {
      fetch,
      sleep: NO_SLEEP,
      limits: { maxAttempts: 1 },
    });

    expect(envelope.status).toEqual({ status: "unsupported", code: "authorization-failed" });
    expect(envelope.connections).toEqual([]);
  });

  it("keeps endpoint paths without user info, query strings or fragments", () => {
    expect(safeConnectionPath("https://key:secret@api.example.com/v2?apikey=1#x")).toBe("https://api.example.com/v2");
    expect(safeConnectionPath("server.database.windows.net;sales")).toBe("server.database.windows.net;sales");
    expect(safeConnectionPath("https://host/?token=1")).toBe("https://host");
    expect(safeConnectionPath("")).toBeUndefined();
  });
});
