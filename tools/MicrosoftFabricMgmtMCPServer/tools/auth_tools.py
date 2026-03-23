"""
Authentication tools for the MicrosoftFabricMgmt MCP Server.

Tools:
  connect_to_fabric        — authenticate via User Principal, Service Principal, or Managed Identity
  get_auth_status          — inspect current authentication state and token expiry
  disconnect_from_fabric   — sign out and clear authentication context
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_auth_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register authentication-related MCP tools."""

    @mcp.tool(
        name="connect_to_fabric",
        description=(
            "Authenticate to Microsoft Fabric using the MicrosoftFabricMgmt PowerShell module.\n\n"
            "Supports three authentication methods:\n"
            "  1. User Principal (interactive browser login) — provide tenant_id only.\n"
            "     NOTE: This opens a browser window from the server process.\n"
            "  2. Service Principal (non-interactive) — provide tenant_id + app_id + app_secret.\n"
            "  3. Managed Identity (Azure VMs/App Services/Functions) — set use_managed_identity=True.\n\n"
            "MUST be called before any resource tools. Returns auth method and expiry on success."
        ),
    )
    def connect_to_fabric(
        tenant_id: Optional[str] = None,
        app_id: Optional[str] = None,
        app_secret: Optional[str] = None,
        use_managed_identity: bool = False,
        client_id: Optional[str] = None,
    ) -> str:
        """
        Args:
            tenant_id: Azure AD tenant GUID. Required for User Principal and Service Principal.
            app_id: Application (client) GUID for Service Principal authentication.
            app_secret: Client secret for Service Principal authentication.
            use_managed_identity: Set True to use Azure Managed Identity.
            client_id: Optional client ID for user-assigned Managed Identity.
        """
        try:
            if use_managed_identity:
                if client_id:
                    cmd = (
                        f"Set-FabricApiHeaders -UseManagedIdentity -ClientId '{client_id}'\n"
                        "$ctx = $script:FabricAuthContext\n"
                        "[PSCustomObject]@{ success = $true; auth_method = $ctx.AuthMethod; "
                        "tenant_id = $ctx.TenantId; token_expires_on = $ctx.TokenExpiresOn } "
                        "| ConvertTo-Json -Compress"
                    )
                else:
                    cmd = (
                        "Set-FabricApiHeaders -UseManagedIdentity\n"
                        "$ctx = $script:FabricAuthContext\n"
                        "[PSCustomObject]@{ success = $true; auth_method = $ctx.AuthMethod; "
                        "tenant_id = $ctx.TenantId; token_expires_on = $ctx.TokenExpiresOn } "
                        "| ConvertTo-Json -Compress"
                    )
            elif app_id and app_secret:
                if not tenant_id:
                    return _err("tenant_id is required for Service Principal authentication.")
                # Escape single quotes in the secret
                escaped_secret = app_secret.replace("'", "''")
                cmd = (
                    f"$secret = ConvertTo-SecureString -String '{escaped_secret}' -AsPlainText -Force\n"
                    f"Set-FabricApiHeaders -TenantId '{tenant_id}' -AppId '{app_id}' -AppSecret $secret\n"
                    "$ctx = $script:FabricAuthContext\n"
                    "[PSCustomObject]@{ success = $true; auth_method = $ctx.AuthMethod; "
                    "tenant_id = $ctx.TenantId; token_expires_on = $ctx.TokenExpiresOn } "
                    "| ConvertTo-Json -Compress"
                )
            else:
                if not tenant_id:
                    return _err(
                        "tenant_id is required for User Principal authentication. "
                        "Alternatively set use_managed_identity=True or provide app_id and app_secret."
                    )
                cmd = (
                    f"Set-FabricApiHeaders -TenantId '{tenant_id}'\n"
                    "$ctx = $script:FabricAuthContext\n"
                    "[PSCustomObject]@{ success = $true; auth_method = $ctx.AuthMethod; "
                    "tenant_id = $ctx.TenantId; token_expires_on = $ctx.TokenExpiresOn } "
                    "| ConvertTo-Json -Compress"
                )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_auth_status",
        description=(
            "Return the current authentication status of the MicrosoftFabricMgmt PowerShell session.\n\n"
            "Shows whether the session is authenticated, which auth method was used, the tenant ID, "
            "and when the token expires. Call this to verify authentication before starting work."
        ),
    )
    def get_auth_status() -> str:
        try:
            cmd = (
                "$ctx = $script:FabricAuthContext\n"
                "$isAuth = ($null -ne $ctx -and $null -ne $ctx.FabricHeaders)\n"
                "$expiresOn = if ($ctx) { $ctx.TokenExpiresOn } else { $null }\n"
                "$method = if ($ctx) { $ctx.AuthMethod } else { $null }\n"
                "$tenant = if ($ctx) { $ctx.TenantId } else { $null }\n"
                "[PSCustomObject]@{\n"
                "    is_authenticated  = $isAuth\n"
                "    auth_method       = $method\n"
                "    tenant_id         = $tenant\n"
                "    token_expires_on  = $expiresOn\n"
                "} | ConvertTo-Json -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="disconnect_from_fabric",
        description=(
            "Sign out from Microsoft Fabric and clear the authentication context.\n\n"
            "Disconnects the underlying Az account and resets the module-scoped auth context. "
            "After calling this you must call connect_to_fabric again before using resource tools."
        ),
    )
    def disconnect_from_fabric() -> str:
        try:
            cmd = (
                "Disconnect-AzAccount -ErrorAction SilentlyContinue | Out-Null\n"
                "$script:FabricAuthContext = @{}\n"
                "[PSCustomObject]@{ success = $true; message = 'Disconnected from Microsoft Fabric.' } "
                "| ConvertTo-Json -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
