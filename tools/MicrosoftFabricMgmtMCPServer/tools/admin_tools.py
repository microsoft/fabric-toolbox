"""
Admin tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get-FabricAdminWorkspace, Get-FabricAdminItem,
       Get-FabricAdminWorkspaceUser, Get-FabricAdminUserAccess.

These tools require tenant-level admin permissions.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_admin_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register admin-level MCP tools. Requires Fabric tenant admin permissions."""

    @mcp.tool(
        name="admin_list_workspaces",
        description=(
            "List Microsoft Fabric workspaces across the entire tenant (admin view).\n\n"
            "Requires Fabric tenant admin permissions.\n"
            "Returns all workspaces the admin can see, including personal workspaces.\n"
            "Optionally filter by workspace_name or limit results with top."
        ),
    )
    def admin_list_workspaces(
        workspace_name: Optional[str] = None,
        top: Optional[int] = None,
    ) -> str:
        try:
            params = ""
            if workspace_name:
                params += f" -WorkspaceName '{workspace_name.replace(chr(39), chr(39)*2)}'"
            if top is not None:
                params += f" -Top {top}"
            cmd = f"Get-FabricAdminWorkspace{params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="admin_list_items",
        description=(
            "List items in a workspace using tenant admin permissions.\n\n"
            "Requires Fabric tenant admin permissions.\n"
            "Returns all items (lakehouses, notebooks, etc.) in the specified workspace.\n"
            "Optionally filter by item_type (e.g. 'Lakehouse', 'Notebook', 'Warehouse')."
        ),
    )
    def admin_list_items(
        workspace_id: str,
        item_type: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if item_type:
                params += f" -Type '{item_type}'"
            cmd = f"Get-FabricAdminItem {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="admin_get_workspace_users",
        description=(
            "Get all users with access to a workspace using tenant admin permissions.\n\n"
            "Requires Fabric tenant admin permissions.\n"
            "Returns user principals, roles, and access type for the specified workspace."
        ),
    )
    def admin_get_workspace_users(workspace_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricAdminWorkspaceUser -WorkspaceId '{workspace_id}' "
                "| ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="admin_get_user_access",
        description=(
            "Get all workspace access entries for a specific user (admin view).\n\n"
            "Requires Fabric tenant admin permissions.\n"
            "Returns all workspaces the specified user has access to and their roles."
        ),
    )
    def admin_get_user_access(user_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricAdminUserAccess -UserId '{user_id}' "
                "| ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
