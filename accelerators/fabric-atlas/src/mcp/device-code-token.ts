import type { AccountInfo, PublicClientApplication } from "@azure/msal-node";
import { AtlasMcpError } from "@/atlas/mcp/contract";
import type { EntraTokenProvider } from "./app-audience-session";
import type { AtlasMcpRuntimeConfig } from "./runtime-config";

/** Delegated Power BI scope required by the Rayfin direct Entra exchange. */
export const ATLAS_MCP_ENTRA_SCOPE =
  "https://analysis.windows.net/powerbi/api/Item.Execute.All";

/**
 * Device code sign-in for a public client registration. Tokens stay in the
 * in-memory MSAL cache of this process and are never written or logged.
 */
export function createDeviceCodeTokenProvider(
  options: AtlasMcpRuntimeConfig & { log: (message: string) => void },
): EntraTokenProvider {
  const msal = () => import("@azure/msal-node");
  let application: Promise<PublicClientApplication> | undefined;
  let account: AccountInfo | null = null;
  const client = () =>
    (application ??= msal().then(
      ({ PublicClientApplication }) =>
        new PublicClientApplication({
          auth: {
            clientId: options.clientId,
            authority: `https://login.microsoftonline.com/${options.tenantId}`,
          },
        }),
    ));

  return {
    async acquireToken() {
      const app = await client();
      if (account) {
        try {
          const silent = await app.acquireTokenSilent({
            account,
            scopes: [ATLAS_MCP_ENTRA_SCOPE],
          });
          if (silent.accessToken) return silent.accessToken;
        } catch (error) {
          const { InteractionRequiredAuthError } = await msal();
          if (!(error instanceof InteractionRequiredAuthError)) throw error;
        }
      }
      const result = await app.acquireTokenByDeviceCode({
        scopes: [ATLAS_MCP_ENTRA_SCOPE],
        deviceCodeCallback: (response) => {
          // Entra error responses can reach the callback without a user prompt.
          if (typeof response?.message === "string" && response.message.trim()) {
            options.log(`[atlas-mcp] ${response.message.trim()}`);
          }
        },
      });
      if (!result?.accessToken) {
        throw new AtlasMcpError(
          "unauthenticated",
          "Microsoft Entra returned no access token.",
          { retryable: true },
        );
      }
      account = result.account;
      return result.accessToken;
    },
  };
}
