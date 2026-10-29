import { AtlasMcpError } from "@/atlas/mcp/contract";

// App-audience session for the local MCP server. A delegated Entra token is
// exchanged for a Rayfin session through the documented direct exchange; the
// platform admits only users with Execute permission on the Atlas app item.

/** Acquires a delegated Microsoft Entra token for the Rayfin exchange. */
export interface EntraTokenProvider {
  acquireToken(): Promise<string>;
}

/** The Rayfin session operations the MCP server needs. */
export interface RayfinSessionPort {
  isAuthenticated(): boolean;
  /** Refreshes with the Rayfin refresh token; false when no session can be refreshed. */
  refresh(): Promise<boolean>;
  exchange(entraToken: string): Promise<void>;
}

export interface AppAudienceSession {
  /** Starts sign-in in the background so the device prompt appears early. */
  start(): void;
  /** Resolves only for an authenticated app-audience session. */
  requireSession(): Promise<void>;
}

export interface AppAudienceSessionOptions {
  tokenProvider: EntraTokenProvider;
  port: RayfinSessionPort;
  /** How long one tool call waits for an in-progress sign-in. */
  waitMs?: number;
  log?: (message: string) => void;
}

type SignInOutcome = { ok: true } | { ok: false; error: AtlasMcpError };

const EXCHANGE_FAILURES: Record<string, { message: string; retryable: boolean }> = {
  EXCHANGE_NOT_ENABLED: {
    message:
      "External Entra exchange is not enabled for this Atlas deployment (services.auth.fabric.externalEntraExchange).",
    retryable: false,
  },
  INSUFFICIENT_PERMISSIONS: {
    message:
      "The signed-in user is outside the Atlas app audience: Execute permission on the Fabric app item is required.",
    retryable: false,
  },
  AUTH_FAILED: {
    message:
      "Microsoft Entra rejected the token for this exchange. Check the tenant, the Item.Execute.All scope and the token expiry.",
    retryable: true,
  },
  NOT_AVAILABLE: {
    message: "External Entra exchange is not available in this Fabric environment.",
    retryable: false,
  },
  INVALID_REQUEST: {
    message:
      "Atlas MCP requires the absolute HTTPS Rayfin backend URL from the deployment configuration.",
    retryable: false,
  },
};

/** Maps Rayfin and MSAL failures to caller-safe errors without token content. */
export function sessionError(error: unknown): AtlasMcpError {
  if (error instanceof AtlasMcpError) return error;
  const fields = error && typeof error === "object"
    ? (error as { code?: unknown; errorCode?: unknown })
    : {};
  if (typeof fields.code === "string" && EXCHANGE_FAILURES[fields.code]) {
    const failure = EXCHANGE_FAILURES[fields.code];
    return new AtlasMcpError("unauthenticated", failure.message, {
      retryable: failure.retryable,
    });
  }
  if (typeof fields.errorCode === "string" && /^[a-z_]{1,60}$/.test(fields.errorCode)) {
    return new AtlasMcpError(
      "unauthenticated",
      `Microsoft Entra device sign-in did not complete (${fields.errorCode}).`,
      { retryable: true },
    );
  }
  return new AtlasMcpError(
    "unauthenticated",
    "Sign-in to the Atlas app audience did not complete.",
    { retryable: true },
  );
}

export function createAppAudienceSession(
  options: AppAudienceSessionOptions,
): AppAudienceSession {
  const waitMs = options.waitMs ?? 20_000;
  const log = options.log ?? (() => undefined);
  let pending: Promise<SignInOutcome> | undefined;

  async function signIn(): Promise<void> {
    if (await options.port.refresh()) return;
    const token = await options.tokenProvider.acquireToken();
    await options.port.exchange(token);
    if (!options.port.isAuthenticated()) {
      throw new AtlasMcpError(
        "unauthenticated",
        "The Rayfin session was not established.",
        { retryable: true },
      );
    }
  }

  // The returned promise never rejects; failures are carried in the outcome.
  function begin(): Promise<SignInOutcome> {
    pending ??= signIn()
      .then(
        (): SignInOutcome => ({ ok: true }),
        (error: unknown): SignInOutcome => {
          const mapped = sessionError(error);
          log(`[atlas-mcp] sign-in failed: ${mapped.message}`);
          return { ok: false, error: mapped };
        },
      )
      .then((outcome) => {
        pending = undefined;
        return outcome;
      });
    return pending;
  }

  return {
    start() {
      if (!options.port.isAuthenticated()) void begin();
    },
    async requireSession() {
      if (options.port.isAuthenticated()) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiting = new Promise<"waiting">((resolve) => {
        timer = setTimeout(() => resolve("waiting"), waitMs);
      });
      const outcome = await Promise.race([begin(), waiting]);
      clearTimeout(timer);
      if (outcome === "waiting") {
        throw new AtlasMcpError(
          "authentication-pending",
          "Complete the Microsoft Entra device sign-in shown in the Atlas MCP server log, then retry.",
        );
      }
      if (!outcome.ok) throw outcome.error;
      if (!options.port.isAuthenticated()) {
        throw new AtlasMcpError("unauthenticated", "The Rayfin session is not authenticated.", {
          retryable: true,
        });
      }
    },
  };
}
