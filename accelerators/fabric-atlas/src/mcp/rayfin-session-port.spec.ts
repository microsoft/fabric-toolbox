import { describe, expect, it, vi } from "vitest";
import { AuthError, NetworkError } from "@microsoft/rayfin-lib";
import type { AtlasRayfinClient } from "@/lib/rayfin-client";

const exchange = vi.hoisted(() => vi.fn());

vi.mock("@microsoft/rayfin-auth-provider-fabric", () => ({
  signInWithEntraToken: exchange,
}));

import { rayfinSessionPort } from "./rayfin-session-port";

type Auth = AtlasRayfinClient["auth"];

function auth(overrides: Record<string, unknown> = {}): Auth {
  return {
    getSession: () => ({
      user: null,
      isAuthenticated: true,
      isAnonymous: false,
      expiresAt: new Date(2_000),
    }),
    hasRefreshToken: () => true,
    refreshSession: vi.fn(async () => ({})),
    ...overrides,
  } as unknown as Auth;
}

describe("Rayfin session port", () => {
  it("accepts only unexpired, non-anonymous authenticated sessions", () => {
    expect(rayfinSessionPort(auth(), () => 1_000).isAuthenticated()).toBe(true);
    expect(rayfinSessionPort(auth(), () => 3_000).isAuthenticated()).toBe(false);
    expect(
      rayfinSessionPort(
        auth({
          getSession: () => ({ user: null, isAuthenticated: true, isAnonymous: true }),
        }),
      ).isAuthenticated(),
    ).toBe(false);
  });

  it("treats rejected refresh tokens as signed out and rethrows transport faults", async () => {
    const rejected = rayfinSessionPort(
      auth({ refreshSession: vi.fn(async () => Promise.reject(new AuthError("expired"))) }),
      () => 1_000,
    );
    await expect(rejected.refresh()).resolves.toBe(false);

    const denied = rayfinSessionPort(
      auth({
        refreshSession: vi.fn(async () => {
          const error = new NetworkError("denied");
          error.status = 401;
          throw error;
        }),
      }),
    );
    await expect(denied.refresh()).resolves.toBe(false);

    const outage = new NetworkError("unavailable");
    outage.status = 503;
    const failing = rayfinSessionPort(
      auth({ refreshSession: vi.fn(async () => Promise.reject(outage)) }),
    );
    await expect(failing.refresh()).rejects.toBe(outage);

    const empty = rayfinSessionPort(auth({ hasRefreshToken: () => false }));
    await expect(empty.refresh()).resolves.toBe(false);
  });

  it("exchanges the raw Entra token on the shared auth instance", async () => {
    const instance = auth();
    exchange.mockResolvedValueOnce({ isAuthenticated: true });
    await rayfinSessionPort(instance).exchange("raw-token");
    expect(exchange).toHaveBeenCalledWith(instance, { entraToken: "raw-token" });
  });
});
