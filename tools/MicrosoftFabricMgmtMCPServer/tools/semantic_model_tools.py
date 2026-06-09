"""
Semantic model tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get/New/Update/Remove-FabricSemanticModel.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_semantic_model_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register semantic model MCP tools."""

    @mcp.tool(
        name="list_semantic_models",
        description=(
            "List all semantic models (datasets) in a Microsoft Fabric workspace.\n\n"
            "Returns semantic model IDs, display names, and metadata. "
            "Optionally filter by model_name."
        ),
    )
    def list_semantic_models(
        workspace_id: str,
        model_name: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if model_name:
                params += f" -SemanticModelName '{model_name.replace(chr(39), chr(39)*2)}'"
            cmd = f"Get-FabricSemanticModel {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_semantic_model",
        description="Get details of a specific semantic model by its GUID within a workspace.",
    )
    def get_semantic_model(workspace_id: str, model_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricSemanticModel -WorkspaceId '{workspace_id}' "
                f"-SemanticModelId '{model_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_semantic_model",
        description=(
            "Create a new semantic model in a Microsoft Fabric workspace.\n\n"
            "Returns the created semantic model object including its new GUID."
        ),
    )
    def create_semantic_model(
        workspace_id: str,
        display_name: str,
        description: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = f"-WorkspaceId '{workspace_id}' -DisplayName '{name}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"New-FabricSemanticModel {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="update_semantic_model",
        description="Update the display name or description of an existing semantic model.",
    )
    def update_semantic_model(
        workspace_id: str,
        model_id: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}' -SemanticModelId '{model_id}'"
            if display_name:
                params += f" -DisplayName '{display_name.replace(chr(39), chr(39)*2)}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"Update-FabricSemanticModel {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_semantic_model",
        description=(
            "Delete a semantic model from a Microsoft Fabric workspace.\n\n"
            "WARNING: This operation is irreversible."
        ),
    )
    def delete_semantic_model(workspace_id: str, model_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricSemanticModel -WorkspaceId '{workspace_id}' "
                f"-SemanticModelId '{model_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
