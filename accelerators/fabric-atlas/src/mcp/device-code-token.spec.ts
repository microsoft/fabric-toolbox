import { beforeEach, describe, expect, it, vi } from "vitest";

const msal = vi.hoisted(() => {
  class InteractionRequiredAuthError extends Error {}
  const acquireTokenSilent = vi.fn();
  const acquireTokenByDeviceCode = vi.fn();
  const constructed: unknown[] = [];
  class PublicClientApplication {
    constructor(configuration: unknown) {
      constructed.push(configuration);
    }
    acquireTokenSilent = acquireTokenSilent;
    acquireTokenByDeviceCode = acquireTokenByDeviceCode;
  }
  return {
    InteractionRequiredAuthError,
    PublicClientApplication,
    acquireTokenSilent,
    acquireTokenByDeviceCode,
    constructed,
  };
});

vi.mock("@azure/msal-node", () => ({
  InteractionRequiredAuthError: msal.InteractionRequiredAuthError,
  PublicClientApplication: msal.PublicClientApplication,
}));

import { ATLAS_MCP_ENTRA_SCOPE, createDeviceCodeTokenProvider } from "./device-code-token";

const CONFIG = {
  clientId: "6a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d",
  tenantId: "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e",
};
const ACCOUNT = { homeAccountId: "account" };

describe("device code token provider", () => {
  beforeEach(() => {
    msal.acquireTokenSilent.mockReset();
    msal.acquireTokenByDeviceCode.mockReset();
    msal.constructed.length = 0;
  });

  it("requests only Item.Execute.All from the configured tenant and logs the prompt", async () => {
    const log = vi.fn();
    msal.acquireTokenByDeviceCode.mockImplementation(async (request) => {
      request.deviceCodeCallback({ message: "Open https://microsoft.com/devicelogin and enter ABC" });
      return { accessToken: "first", account: ACCOUNT };
    });
    const provider = createDeviceCodeTokenProvider({ ...CONFIG, log });

    await expect(provider.acquireToken()).resolves.toBe("first");
    expect(msal.constructed).toEqual([
      {
        auth: {
          clientId: CONFIG.clientId,
          authority: `https://login.microsoftonline.com/${CONFIG.tenantId}`,
        },
      },
    ]);
    expect(msal.acquireTokenByDeviceCode).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: [ATLAS_MCP_ENTRA_SCOPE] }),
    );
    expect(ATLAS_MCP_ENTRA_SCOPE).toBe(
      "https://analysis.windows.net/powerbi/api/Item.Execute.All",
    );
    expect(log).toHaveBeenCalledWith(
      "[atlas-mcp] Open https://microsoft.com/devicelogin and enter ABC",
    );
  });

  it("logs nothing when Entra returns a device code response without a prompt", async () => {
    const log = vi.fn();
    msal.acquireTokenByDeviceCode.mockImplementation(async (request) => {
      request.deviceCodeCallback({});
      throw Object.assign(new Error("tenant not found"), { errorCode: "post_request_failed" });
    });
    const provider = createDeviceCodeTokenProvider({ ...CONFIG, log });

    await expect(provider.acquireToken()).rejects.toMatchObject({
      errorCode: "post_request_failed",
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("refreshes silently and returns to device code only when interaction is required", async () => {
    msal.acquireTokenByDeviceCode
      .mockResolvedValueOnce({ accessToken: "first", account: ACCOUNT })
      .mockResolvedValueOnce({ accessToken: "third", account: ACCOUNT });
    msal.acquireTokenSilent
      .mockResolvedValueOnce({ accessToken: "second" })
      .mockRejectedValueOnce(new msal.InteractionRequiredAuthError("consent"));
    const provider = createDeviceCodeTokenProvider({ ...CONFIG, log: () => undefined });

    await expect(provider.acquireToken()).resolves.toBe("first");
    await expect(provider.acquireToken()).resolves.toBe("second");
    await expect(provider.acquireToken()).resolves.toBe("third");
    expect(msal.acquireTokenSilent).toHaveBeenCalledWith({
      account: ACCOUNT,
      scopes: [ATLAS_MCP_ENTRA_SCOPE],
    });
    expect(msal.constructed).toHaveLength(1);
  });

  it("does not hide other silent failures or empty results", async () => {
    const outage = new TypeError("network");
    msal.acquireTokenByDeviceCode.mockResolvedValueOnce({ accessToken: "first", account: ACCOUNT });
    msal.acquireTokenSilent.mockRejectedValueOnce(outage);
    const provider = createDeviceCodeTokenProvider({ ...CONFIG, log: () => undefined });
    await provider.acquireToken();
    await expect(provider.acquireToken()).rejects.toBe(outage);

    const empty = createDeviceCodeTokenProvider({ ...CONFIG, log: () => undefined });
    msal.acquireTokenByDeviceCode.mockResolvedValueOnce(null);
    await expect(empty.acquireToken()).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
