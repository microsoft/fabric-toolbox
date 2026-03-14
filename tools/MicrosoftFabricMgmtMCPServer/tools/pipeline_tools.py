"""
Data pipeline tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get/New/Update/Remove-FabricDataPipeline.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_pipeline_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register data pipeline MCP tools."""

    @mcp.tool(
        name="list_data_pipelines",
        description=(
            "List all data pipelines in a Microsoft Fabric workspace.\n\n"
            "Returns pipeline IDs, display names, and metadata. "
            "Optionally filter by pipeline_name."
        ),
    )
    def list_data_pipelines(
        workspace_id: str,
        pipeline_name: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if pipeline_name:
                params += f" -DataPipelineName '{pipeline_name.replace(chr(39), chr(39)*2)}'"
            cmd = f"Get-FabricDataPipeline {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_data_pipeline",
        description="Get details of a specific data pipeline by its GUID within a workspace.",
    )
    def get_data_pipeline(workspace_id: str, pipeline_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricDataPipeline -WorkspaceId '{workspace_id}' "
                f"-DataPipelineId '{pipeline_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_data_pipeline",
        description=(
            "Create a new data pipeline in a Microsoft Fabric workspace.\n\n"
            "Returns the created pipeline object including its new GUID."
        ),
    )
    def create_data_pipeline(
        workspace_id: str,
        display_name: str,
        description: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = f"-WorkspaceId '{workspace_id}' -DisplayName '{name}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"New-FabricDataPipeline {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="update_data_pipeline",
        description="Update the display name or description of an existing data pipeline.",
    )
    def update_data_pipeline(
        workspace_id: str,
        pipeline_id: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}' -DataPipelineId '{pipeline_id}'"
            if display_name:
                params += f" -DisplayName '{display_name.replace(chr(39), chr(39)*2)}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"Update-FabricDataPipeline {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_data_pipeline",
        description=(
            "Delete a data pipeline from a Microsoft Fabric workspace.\n\n"
            "WARNING: This operation is irreversible."
        ),
    )
    def delete_data_pipeline(workspace_id: str, pipeline_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricDataPipeline -WorkspaceId '{workspace_id}' "
                f"-DataPipelineId '{pipeline_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
