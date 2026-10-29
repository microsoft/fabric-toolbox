import { afterEach, describe, expect, it, vi } from "vitest";
import { AtlasMcpError } from "@/atlas/mcp/contract";
import {
  createAppAudienceSession,
  sessionError,
  type RayfinSessionPort,
} from "./app-audience-session";

function port(overrides: Partial<RayfinSessionPort> = {}) {
  let authenticated = false;
  const value: RayfinSessionPort & { calls: string[] } = {
    calls: [],
    isAuthenticated: () => authenticated,
    refresh: vi.fn(async () => {
      value.calls.push("refresh");
      return false;
    }),
    exchange: vi.fn(async (token: string) => {
      value.calls.push(`exchange:${token}`);
      authenticated = true;
    }),
    ...overrides,
  };
  return value;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("app-audience session", () => {
  it("exchanges a delegated token only when no session can be refreshed", async () => {
    const session = port();
    const acquireToken = vi.fn(async () => "entra-token");
    const audience = createAppAudienceSession({ port: session, tokenProvider: { acquireToken } });

    await audience.requireSession();
    await audience.requireSession();

    expect(session.calls).toEqual(["refresh", "exchange:entra-token"]);
    expect(acquireToken).toHaveBeenCalledTimes(1);
  });

  it("prefers the Rayfin refresh token over a new Entra sign-in", async () => {
    let authenticated = false;
    const session = port({
      isAuthenticated: () => authenticated,
      refresh: vi.fn(async () => {
        authenticated = true;
        return true;
      }),
    });
    const acquireToken = vi.fn(async () => "unused");
    await createAppAudienceSession({ port: session, tokenProvider: { acquireToken } }).requireSession();
    expect(acquireToken).not.toHaveBeenCalled();
  });

  it("reports a pending device sign-in without blocking the caller", async () => {
    vi.useFakeTimers();
    let finish: (token: string) => void = () => undefined;
    const acquireToken = () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      });
    const session = port();
    const audience = createAppAudienceSession({
      port: session,
      tokenProvider: { acquireToken },
      waitMs: 1_000,
    });

    audience.start();
    const first = audience.requireSession();
    const assertion = expect(first).rejects.toMatchObject({
      code: "authentication-pending",
      retryable: true,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;

    finish("late-token");
    await vi.advanceTimersByTimeAsync(0);
    await expect(audience.requireSession()).resolves.toBeUndefined();
    expect(session.calls).toEqual(["refresh", "exchange:late-token"]);
  });

  it("maps exchange failures to explicit errors and retries on the next call", async () => {
    let authenticated = false;
    const failure = Object.assign(new Error("redacted"), { code: "INSUFFICIENT_PERMISSIONS" });
    const exchange = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(async () => {
        authenticated = true;
      });
    const log = vi.fn();
    const audience = createAppAudienceSession({
      port: port({ isAuthenticated: () => authenticated, exchange }),
      tokenProvider: { acquireToken: async () => "token" },
      log,
    });

    await expect(audience.requireSession()).rejects.toMatchObject({
      code: "unauthenticated",
      retryable: false,
      message:
        "The signed-in user is outside the Atlas app audience: Execute permission on the Fabric app item is required.",
    });
    expect(log.mock.calls.flat().join(" ")).not.toContain("token");
    await expect(audience.requireSession()).resolves.toBeUndefined();
    expect(exchange).toHaveBeenCalledTimes(2);
  });
});

describe("session error mapping", () => {
  it("names the deployment gate when external exchange is disabled", () => {
    expect(
      sessionError(Object.assign(new Error("x"), { code: "EXCHANGE_NOT_ENABLED" })),
    ).toMatchObject({
      code: "unauthenticated",
      message: expect.stringContaining("externalEntraExchange"),
      retryable: false,
    });
  });

  it("keeps MSAL error codes but never raw messages", () => {
    const mapped = sessionError(
      Object.assign(new Error("AADSTS70016 secret detail"), { errorCode: "authorization_pending" }),
    );
    expect(mapped.message).toBe(
      "Microsoft Entra device sign-in did not complete (authorization_pending).",
    );
    expect(sessionError(new Error("token=abc")).message).toBe(
      "Sign-in to the Atlas app audience did not complete.",
    );
    const original = new AtlasMcpError("authentication-pending", "wait");
    expect(sessionError(original)).toBe(original);
  });
});
