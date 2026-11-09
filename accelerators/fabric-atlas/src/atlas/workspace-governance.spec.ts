// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  collectWorkspaceGovernance,
  sanitizeOneLakeRole,
} from "../../rayfin/functions/src/workspace-governance";

const WS = "11111111-1111-4111-8111-111111111111";
const LAKE = "22222222-2222-4222-8222-222222222222";
const REPORT = "33333333-3333-4333-8333-333333333333";
const DOMAIN = "44444444-4444-4444-8444-444444444444";
const SUB = "55555555-5555-4555-8555-555555555555";
const SHARE = "66666666-6666-4666-8666-666666666666";
const USER = "77777777-7777-4777-8777-777777777777";
const API = "https://api.fabric.microsoft.com";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fetchFor(routes: Record<string, () => Response>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const handler = routes[`${url.origin}${url.pathname}`];
    return handler ? handler() : json({ errorCode: "NotFound" }, 404);
  }) as typeof fetch;
}

const NO_SLEEP = async () => undefined;

describe("workspaceCollectGovernance", () => {
  it("collects every optional section as sanitized read-only evidence", async () => {
    const envelope = await collectWorkspaceGovernance("token", { workspaceId: WS, correlationId: null }, {
      sleep: NO_SLEEP,
      fetch: fetchFor({
        [`${API}/v1/admin/domains`]: () => json({ domains: [
          { id: DOMAIN, displayName: "Finance", description: "money", defaultLabelId: USER },
          { id: SUB, displayName: "Payables", parentDomainId: DOMAIN },
          { id: "bad" },
        ] }),
        [`${API}/v1/admin/tags`]: () => json({ value: [
          { id: USER, displayName: "Certified-EU", scope: { type: "Domain", domainId: DOMAIN } },
        ] }),
        [`${API}/v1/admin/tenantsettings`]: () => json({ tenantSettings: [
          { settingName: "AllowExternalDataSharingSwitch", title: "External data sharing", enabled: true, tenantSettingGroup: "Export" },
          { settingName: "NoEnabledFlag" },
        ] }),
        [`${API}/v1/workspaces/${WS}/networking/communicationPolicy`]: () => json({
          inbound: { publicAccessRules: { defaultAction: "Deny" } },
          outbound: { publicAccessRules: { defaultAction: "Allow" } },
        }),
        [`${API}/v1/workspaces/${WS}/items`]: () => json({ value: [
          { id: LAKE, type: "Lakehouse", displayName: "Sales" },
          { id: REPORT, type: "Report", displayName: "R" },
        ] }),
        [`${API}/v1/workspaces/${WS}/items/${LAKE}/externalDataShares`]: () => json({ value: [{
          id: SHARE, status: "Active", paths: ["Tables/orders"], expirationTimeUtc: "2030-01-01T00:00:00Z",
          recipient: { userPrincipalName: "guest@contoso.com", tenantId: DOMAIN },
          creatorPrincipal: { displayName: "Alice" },
        }] }),
        [`${API}/v1/workspaces/${WS}/items/${LAKE}/dataAccessRoles`]: () => json({ value: [{
          name: "EUReaders",
          decisionRules: [{
            effect: "Permit",
            permission: [
              { attributeName: "Path", attributeValueIncludedIn: ["/Tables/orders"] },
              { attributeName: "Action", attributeValueIncludedIn: ["Read"] },
            ],
            constraints: { rows: [{ tablePath: "/Tables/orders", value: "region = 'EU'" }] },
          }],
          members: { microsoftEntraMembers: [{ tenantId: DOMAIN, objectId: USER }], fabricItemMembers: [{}] },
        }] }),
      }),
    });

    expect(envelope.authoritative).toBe(false);
    expect(envelope.domains).toEqual({
      status: { status: "complete" },
      entries: [
        { id: DOMAIN, displayName: "Finance", description: "money", defaultSensitivityLabelId: USER },
        { id: SUB, displayName: "Payables", parentDomainId: DOMAIN },
      ],
    });
    expect(envelope.tags.entries).toEqual([{ id: USER, displayName: "Certified-EU", scope: "domain", domainId: DOMAIN }]);
    expect(envelope.tenantSettings.entries).toEqual([
      { settingName: "AllowExternalDataSharingSwitch", title: "External data sharing", enabled: true, group: "Export" },
    ]);
    expect(envelope.network).toEqual({ status: { status: "complete" }, policy: { inboundPublicAccess: "Deny", outboundPublicAccess: "Allow" } });
    expect(envelope.externalShares.entries).toEqual([{
      itemId: LAKE, shareId: SHARE, status: "Active", recipient: "guest@contoso.com", recipientTenantId: DOMAIN,
      createdBy: "Alice", expiresAt: "2030-01-01T00:00:00Z", paths: ["Tables/orders"],
    }]);
    expect(envelope.oneLakeRoles.entries).toEqual([{
      itemId: LAKE, roleName: "EUReaders", permissions: ["Read"], paths: ["/Tables/orders"],
      memberIds: [USER], itemMemberCount: 1, rowSecurity: true, columnSecurity: false,
      rowFilters: [{ tablePath: "/Tables/orders", predicate: "region = 'EU'" }],
    }]);
  });

  it("degrades forbidden admin endpoints to unsupported instead of failing the sync", async () => {
    const forbidden = () => json({ errorCode: "Forbidden" }, 403);
    const envelope = await collectWorkspaceGovernance("token", { workspaceId: WS, correlationId: null }, {
      sleep: NO_SLEEP,
      fetch: fetchFor({
        [`${API}/v1/admin/domains`]: forbidden,
        [`${API}/v1/admin/tags`]: forbidden,
        [`${API}/v1/admin/tenantsettings`]: forbidden,
        [`${API}/v1/workspaces/${WS}/items`]: () => json({ value: [] }),
      }),
    });
    expect(envelope.domains.status).toEqual({ status: "unsupported", code: "authorization-failed" });
    expect(envelope.tags.status.status).toBe("unsupported");
    expect(envelope.tenantSettings.status.status).toBe("unsupported");
    expect(envelope.network.status).toEqual({ status: "unsupported", code: "endpoint-unsupported" });
    expect(envelope.network.policy).toBeUndefined();
    expect(envelope.externalShares.status.status).toBe("complete");
  });

  it("reads admin sections with the delegated administrator token when the app token is refused", async () => {
    const delegated = "aaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc";
    const seen: string[] = [];
    const base = fetchFor({
      [`${API}/v1/admin/domains`]: () => json({ domains: [{ id: DOMAIN, displayName: "Finance" }] }),
      [`${API}/v1/admin/domains/${DOMAIN}/workspaces`]: () => json({ value: [{ id: WS }] }),
      [`${API}/v1/admin/tags`]: () => json({ value: [] }),
      [`${API}/v1/admin/tenantsettings`]: () => json({ tenantSettings: [] }),
      [`${API}/v1/workspaces/${WS}/items`]: () => json({ value: [] }),
    });
    const envelope = await collectWorkspaceGovernance("token", { workspaceId: WS, correlationId: null, delegatedToken: delegated }, {
      sleep: NO_SLEEP,
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const auth = new Headers(init?.headers).get("authorization") ?? "";
        const path = new URL(String(input)).pathname;
        seen.push(`${path}:${auth.endsWith(delegated) ? "delegated" : "app"}`);
        if (path.startsWith("/v1/admin/") && !auth.endsWith(delegated)) return json({ errorCode: "Forbidden" }, 403);
        return base(input, init);
      }) as typeof fetch,
    });
    expect(envelope.domains.status).toEqual({ status: "complete" });
    expect(envelope.domains.entries).toEqual([{ id: DOMAIN, displayName: "Finance", workspaceCount: 1 }]);
    expect(envelope.tags.status).toEqual({ status: "complete" });
    expect(envelope.tenantSettings.status).toEqual({ status: "complete" });
    expect(seen).toContain("/v1/admin/domains:delegated");
    expect(seen).toContain(`/v1/workspaces/${WS}/items:app`);
  });

  it("counts tenant-wide workspaces per domain and stops at the first failed lookup", async () => {
    const envelope = await collectWorkspaceGovernance("token", { workspaceId: WS, correlationId: null }, {
      sleep: NO_SLEEP,
      fetch: fetchFor({
        [`${API}/v1/admin/domains`]: () => json({ domains: [
          { id: DOMAIN, displayName: "Finance" },
          { id: SUB, displayName: "Payables", parentDomainId: DOMAIN },
          { id: SHARE, displayName: "Later" },
        ] }),
        [`${API}/v1/admin/domains/${DOMAIN}/workspaces`]: () => json({ value: [{ id: WS }, { id: LAKE }] }),
        [`${API}/v1/admin/domains/${SUB}/workspaces`]: () => json({ value: [] }),
        [`${API}/v1/workspaces/${WS}/items`]: () => json({ value: [] }),
      }),
    });
    const [finance, payables, later] = envelope.domains.entries;
    expect(finance.workspaceCount).toBe(2);
    expect(payables.workspaceCount).toBe(0);
    expect(later.workspaceCount).toBeUndefined();
    expect(envelope.domains.status).toEqual({ status: "complete" });
  });

  it("flags column security from role constraints", () => {
    const role = sanitizeOneLakeRole({
      name: "NoPII",
      decisionRules: [{ constraints: { columns: [{ tablePath: "/Tables/c", columnNames: ["email"] }] } }],
    }, LAKE);
    expect(role).toMatchObject({ rowSecurity: false, columnSecurity: true, memberIds: [] });
  });
});
