"""
Notebook tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get/New/Update/Remove-FabricNotebook.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_notebook_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register notebook-related MCP tools."""

    @mcp.tool(
        name="list_notebooks",
        description=(
            "List all notebooks in a Microsoft Fabric workspace.\n\n"
            "Returns notebook IDs, display names, and metadata. "
            "Optionally filter by notebook_name."
        ),
    )
    def list_notebooks(
        workspace_id: str,
        notebook_name: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if notebook_name:
                params += f" -NotebookName '{notebook_name.replace(chr(39), chr(39)*2)}'"
            cmd = f"Get-FabricNotebook {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_notebook",
        description="Get details of a specific notebook by its GUID within a workspace.",
    )
    def get_notebook(workspace_id: str, notebook_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricNotebook -WorkspaceId '{workspace_id}' "
                f"-NotebookId '{notebook_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_notebook",
        description=(
            "Create a new notebook in a Microsoft Fabric workspace.\n\n"
            "Returns the created notebook object including its new GUID."
        ),
    )
    def create_notebook(
        workspace_id: str,
        display_name: str,
        description: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = f"-WorkspaceId '{workspace_id}' -DisplayName '{name}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"New-FabricNotebook {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="update_notebook",
        description="Update the display name or description of an existing notebook.",
    )
    def update_notebook(
        workspace_id: str,
        notebook_id: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}' -NotebookId '{notebook_id}'"
            if display_name:
                params += f" -DisplayName '{display_name.replace(chr(39), chr(39)*2)}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"Update-FabricNotebook {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_notebook",
        description=(
            "Delete a notebook from a Microsoft Fabric workspace.\n\n"
            "WARNING: This operation is irreversible."
        ),
    )
    def delete_notebook(workspace_id: str, notebook_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricNotebook -WorkspaceId '{workspace_id}' "
                f"-NotebookId '{notebook_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
