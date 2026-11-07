import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  workspaceId: "11111111-1111-4111-8111-111111111111",
  tenantId: "33333333-3333-4333-8333-333333333333",
  correlationId: "55555555-5555-4555-8555-555555555555",
  udfUrl:
    "https://atlas.userdatafunctions.fabric.microsoft.com/v1/workspaces/11111111-1111-4111-8111-111111111111/userDataFunctions/44444444-4444-4444-8444-444444444444/functions/sync_all/invoke",
  acquireTokenSilent: vi.fn(),
}));
const WORKSPACE_ID = harness.workspaceId;
const TENANT_ID = harness.tenantId;
const CORRELATION_ID = harness.correlationId;

vi.mock("./config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config")>();
  return {
    ...actual,
    ATLAS_CONFIG: {
      ...actual.ATLAS_CONFIG,
      clientId: "66666666-6666-4666-8666-666666666666",
      tenantId: harness.tenantId,
      workspaceId: harness.workspaceId,
    },
    getUdfUrl: () => harness.udfUrl,
  };
});

vi.mock("@azure/msal-browser", () => ({
  PublicClientApplication: class {
    initialize = vi.fn(async () => undefined);
    handleRedirectPromise = vi.fn(async () => null);
    getAllAccounts = () => [{
      localAccountId: "22222222-2222-4222-8222-222222222222",
      tenantId: harness.tenantId,
      username: "admin@example.com",
    }];
    acquireTokenSilent = harness.acquireTokenSilent;
    ssoSilent = vi.fn();
    acquireTokenPopup = vi.fn();
  },
}));

const identity = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Admin",
  email: "admin@example.com",
};

function token(expiresInSeconds = 3_600): string {
  const payload = btoa(JSON.stringify({
    exp: Math.floor(Date.now() / 1_000) + expiresInSeconds,
  }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
}

function syncBody(correlationId = CORRELATION_ID) {
  return {
    output: {
      workspace: { id: WORKSPACE_ID, displayName: "Atlas" },
      items: [],
      roleAssignments: [{
        role: "Admin",
        principal: { id: identity.id, displayName: identity.name },
      }],
      jobs: [],
      lineage: [],
      access: [],
      config: [],
      schema: {},
      correlationId,
      errors: [],
    },
  };
}

function okResponse(body: unknown = syncBody()): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("live synchronization transport", () => {
  beforeEach(() => {
    vi.resetModules();
    harness.acquireTokenSilent.mockReset().mockResolvedValue({
      accessToken: token(),
      account: {
        localAccountId: identity.id,
        tenantId: TENANT_ID,
        username: identity.email,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("posts a bounded non-redirecting request and validates correlation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { invokeSyncAll } = await import("./live-sync");

    await expect(
      invokeSyncAll(
        WORKSPACE_ID,
        identity,
        undefined,
        undefined,
        CORRELATION_ID,
      ),
    ).resolves.toMatchObject({
      workspace: { id: WORKSPACE_ID },
      correlationId: CORRELATION_ID,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST",
      redirect: "error",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      workspaceId: WORKSPACE_ID,
      correlationId: CORRELATION_ID,
      deferEnrichment: "true",
    });
  });

  it("retries a Fabric timeout and renews tokens close to expiry", async () => {
    vi.useFakeTimers();
    const nearExpiry = token(60);
    const refreshed = token(3_600);
    harness.acquireTokenSilent
      .mockResolvedValueOnce({
        accessToken: nearExpiry,
        account: {
          localAccountId: identity.id,
          tenantId: TENANT_ID,
          username: identity.email,
        },
      })
      .mockResolvedValue({
        accessToken: refreshed,
        account: {
          localAccountId: identity.id,
          tenantId: TENANT_ID,
          username: identity.email,
        },
      });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 504 }))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    const { invokeSyncAll } = await import("./live-sync");

    const result = invokeSyncAll(
      WORKSPACE_ID,
      identity,
      undefined,
      undefined,
      CORRELATION_ID,
    );
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(result).resolves.toMatchObject({
      workspace: { id: WORKSPACE_ID },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(harness.acquireTokenSilent.mock.calls.length).toBeGreaterThan(4);
  });

  it("rejects oversized responses before parsing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-length": String(27 * 1024 * 1024) },
      }),
    ));
    const { invokeSyncAll } = await import("./live-sync");

    await expect(
      invokeSyncAll(
        WORKSPACE_ID,
        identity,
        undefined,
        undefined,
        CORRELATION_ID,
      ),
    ).rejects.toThrow(/authoritative workspace topology.*safe function slice/i);
  });

  it("rejects a response from the wrong correlation context", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      okResponse(syncBody("77777777-7777-4777-8777-777777777777")),
    ));
    const { invokeSyncAll } = await import("./live-sync");

    await expect(
      invokeSyncAll(
        WORKSPACE_ID,
        identity,
        undefined,
        undefined,
        CORRELATION_ID,
      ),
    ).rejects.toThrow(/invalid correlation ID/i);
  });

  it("reuses compatibility credentials across planned slices", async () => {
    const compatibilityBody = {
        output: {
          schemaVersion: 2,
          syncMode: "compatibility",
          correlationId: CORRELATION_ID,
          requestedItemIds: [],
          completedItemIds: [],
          remainingItemIds: [],
          itemFailures: {},
          schema: {},
          config: [],
          jobs: [],
          lineage: [],
          access: [],
          objectEdges: [],
          artifactMetadata: {},
          itemMetadata: {},
          sections: {},
          capabilities: {},
          errors: [],
        },
      };
    const fetchMock = vi.fn().mockImplementation(async () =>
      okResponse(compatibilityBody),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createCompatibilityInvoker } = await import("./live-sync");
    const invoke = createCompatibilityInvoker(
      WORKSPACE_ID,
      identity,
      CORRELATION_ID,
    );
    const plan = {
      version: 1 as const,
      stage: "items" as const,
      items: [],
      schemaItemIds: [],
    };

    await invoke(plan);
    await invoke(plan);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(harness.acquireTokenSilent).toHaveBeenCalledOnce();
  });
});
