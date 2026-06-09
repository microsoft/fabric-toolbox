"""
Escape hatch tools for the MicrosoftFabricMgmt MCP Server.

Provides two generic tools that cover all 295+ PowerShell functions
beyond the dedicated tool set:

  invoke_fabric_ps           — run any PS command in the authenticated session
  invoke_fabric_api_request  — call any Fabric REST API endpoint
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_escape_hatch_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register generic escape-hatch MCP tools."""

    @mcp.tool(
        name="invoke_fabric_ps",
        description=(
            "Execute an arbitrary PowerShell command in the authenticated MicrosoftFabricMgmt session.\n\n"
            "Use this escape hatch for any Fabric operation not exposed as a dedicated tool. "
            "The command runs in the same persistent pwsh process that has the module imported "
            "and authentication already configured.\n\n"
            "BEST PRACTICE: End Get-* commands with '| ConvertTo-Json -Depth 5 -Compress' for "
            "structured JSON output.\n\n"
            "EXAMPLES:\n"
            "  Get-FabricReport -WorkspaceId '<guid>' | ConvertTo-Json -Depth 5 -Compress\n"
            "  Get-FabricMirroredDatabase -WorkspaceId '<guid>' | ConvertTo-Json -Depth 5 -Compress\n"
            "  Get-FabricOneLakeShortcut -WorkspaceId '<guid>' -ItemId '<guid>' | ConvertTo-Json -Depth 5 -Compress\n"
            "  Start-FabricDataflowJob -WorkspaceId '<guid>' -DataflowId '<guid>' | ConvertTo-Json -Depth 5 -Compress\n\n"
            "NOTE: Only use trusted, reviewed commands. Input is not sanitised — do not pass "
            "untrusted user input directly into this tool."
        ),
    )
    def invoke_fabric_ps(command: str) -> str:
        """
        Args:
            command: A PowerShell statement or pipeline to execute. Should end with
                     '| ConvertTo-Json -Depth 5 -Compress' for structured output.
        """
        try:
            return session.run(command)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="invoke_fabric_api_request",
        description=(
            "Call a Microsoft Fabric REST API endpoint directly using the authenticated session.\n\n"
            "Wraps the Invoke-FabricAPIRequest helper from the MicrosoftFabricMgmt module. "
            "Use this for API operations not yet covered by dedicated tools.\n\n"
            "uri: Relative path after /v1/ — e.g. 'workspaces' or 'workspaces/{id}/lakehouses'.\n"
            "method: HTTP method — Get, Post, Patch, Delete, Put.\n"
            "body: Optional JSON string for POST/PATCH/PUT request body.\n\n"
            "EXAMPLES:\n"
            "  invoke_fabric_api_request(method='Get', uri='workspaces')\n"
            "  invoke_fabric_api_request(method='Get', uri='workspaces/<guid>/reports')\n"
            "  invoke_fabric_api_request(method='Post', uri='workspaces/<guid>/lakehouses',\n"
            "      body='{\"displayName\": \"MyLakehouse\", \"type\": \"Lakehouse\"}')"
        ),
    )
    def invoke_fabric_api_request(
        method: str,
        uri: str,
        body: Optional[str] = None,
    ) -> str:
        """
        Args:
            method: HTTP method (Get, Post, Patch, Delete, Put).
            uri: Relative API path after /v1/ (e.g. 'workspaces' or 'workspaces/{id}/items').
            body: Optional JSON string for request body (POST/PATCH/PUT operations).
        """
        try:
            # Escape single quotes in the URI
            safe_uri = uri.replace("'", "''")
            if body:
                # Escape single quotes in the body string
                safe_body = body.replace("'", "''")
                cmd = (
                    f"$apiBody = '{safe_body}' | ConvertFrom-Json | ConvertTo-Json -Compress\n"
                    f"Invoke-FabricAPIRequest -Method '{method}' "
                    f"-BaseURI (New-FabricAPIUri -Resource '{safe_uri}') "
                    "-Headers $script:FabricAuthContext.FabricHeaders "
                    "-Body $apiBody "
                    "| ConvertTo-Json -Depth 10 -Compress"
                )
            else:
                cmd = (
                    f"Invoke-FabricAPIRequest -Method '{method}' "
                    f"-BaseURI (New-FabricAPIUri -Resource '{safe_uri}') "
                    "-Headers $script:FabricAuthContext.FabricHeaders "
                    "| ConvertTo-Json -Depth 10 -Compress"
                )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
