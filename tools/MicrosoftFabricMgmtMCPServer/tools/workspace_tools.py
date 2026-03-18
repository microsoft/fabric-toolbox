"""
Workspace management tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get/New/Update/Remove-FabricWorkspace and workspace role assignment functions.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_workspace_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register workspace-related MCP tools."""

    @mcp.tool(
        name="list_workspaces",
        description=(
            "List all Microsoft Fabric workspaces accessible to the authenticated user.\n\n"
            "Returns workspace IDs, display names, capacity IDs, and type. "
            "Call this first to discover the workspace GUIDs needed by other resource tools.\n\n"
            "Optionally filter by workspace_name to find a specific workspace."
        ),
    )
    def list_workspaces(workspace_name: Optional[str] = None) -> str:
        try:
            if workspace_name:
                name = workspace_name.replace("'", "''")
                cmd = f"Get-FabricWorkspace -WorkspaceName '{name}' | ConvertTo-Json -Depth 5 -Compress"
            else:
                cmd = "Get-FabricWorkspace | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_workspace",
        description=(
            "Get details of a specific Microsoft Fabric workspace by its GUID.\n\n"
            "Returns workspace properties including id, displayName, capacityId, and type."
        ),
    )
    def get_workspace(workspace_id: str) -> str:
        try:
            cmd = f"Get-FabricWorkspace -WorkspaceId '{workspace_id}' | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_workspace",
        description=(
            "Create a new Microsoft Fabric workspace.\n\n"
            "Returns the created workspace object including its new GUID (id)."
        ),
    )
    def create_workspace(
        display_name: str,
        capacity_id: Optional[str] = None,
        description: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = f"-DisplayName '{name}'"
            if capacity_id:
                params += f" -CapacityId '{capacity_id}'"
            if description:
                desc = description.replace("'", "''")
                params += f" -Description '{desc}'"
            cmd = f"New-FabricWorkspace {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="update_workspace",
        description=(
            "Update properties of an existing Microsoft Fabric workspace.\n\n"
            "Provide at least one of display_name or description to update."
        ),
    )
    def update_workspace(
        workspace_id: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if display_name:
                params += f" -DisplayName '{display_name.replace(chr(39), chr(39)*2)}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"Update-FabricWorkspace {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_workspace",
        description=(
            "Delete a Microsoft Fabric workspace by its GUID.\n\n"
            "WARNING: This operation is irreversible and deletes all items in the workspace."
        ),
    )
    def delete_workspace(workspace_id: str) -> str:
        try:
            cmd = f"Remove-FabricWorkspace -WorkspaceId '{workspace_id}'"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="list_workspace_role_assignments",
        description=(
            "List all role assignments for a Microsoft Fabric workspace.\n\n"
            "Returns principals (users, groups, service principals) and their roles "
            "(Admin, Contributor, Member, Viewer)."
        ),
    )
    def list_workspace_role_assignments(workspace_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricWorkspaceRoleAssignment -WorkspaceId '{workspace_id}' "
                "| ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="add_workspace_role_assignment",
        description=(
            "Add a role assignment to a Microsoft Fabric workspace.\n\n"
            "principal_type must be one of: User, Group, ServicePrincipal, ServicePrincipalProfile.\n"
            "role must be one of: Admin, Contributor, Member, Viewer."
        ),
    )
    def add_workspace_role_assignment(
        workspace_id: str,
        principal_id: str,
        principal_type: str,
        role: str,
    ) -> str:
        try:
            cmd = (
                f"Add-FabricWorkspaceRoleAssignment -WorkspaceId '{workspace_id}' "
                f"-PrincipalId '{principal_id}' -PrincipalType '{principal_type}' "
                f"-WorkspaceRole '{role}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="remove_workspace_role_assignment",
        description=(
            "Remove a role assignment from a Microsoft Fabric workspace.\n\n"
            "Removes the specified principal's access to the workspace."
        ),
    )
    def remove_workspace_role_assignment(workspace_id: str, principal_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricWorkspaceRoleAssignment -WorkspaceId '{workspace_id}' "
                f"-PrincipalId '{principal_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
