"""
Environment tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get/New/Remove-FabricEnvironment, Publish-FabricEnvironment,
       Get-FabricEnvironmentSparkCompute, Update-FabricEnvironmentStagingSparkCompute.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_environment_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register environment-related MCP tools."""

    @mcp.tool(
        name="list_environments",
        description=(
            "List all environments in a Microsoft Fabric workspace.\n\n"
            "Returns environment IDs, display names, and publish state. "
            "Optionally filter by environment_name."
        ),
    )
    def list_environments(
        workspace_id: str,
        environment_name: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if environment_name:
                params += f" -EnvironmentName '{environment_name.replace(chr(39), chr(39)*2)}'"
            cmd = f"Get-FabricEnvironment {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_environment",
        description="Get details of a specific environment by its GUID within a workspace.",
    )
    def get_environment(workspace_id: str, environment_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricEnvironment -WorkspaceId '{workspace_id}' "
                f"-EnvironmentId '{environment_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_environment",
        description=(
            "Create a new environment in a Microsoft Fabric workspace.\n\n"
            "Returns the created environment object including its new GUID."
        ),
    )
    def create_environment(
        workspace_id: str,
        display_name: str,
        description: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = f"-WorkspaceId '{workspace_id}' -DisplayName '{name}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"New-FabricEnvironment {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_environment",
        description=(
            "Delete an environment from a Microsoft Fabric workspace.\n\n"
            "WARNING: This operation is irreversible."
        ),
    )
    def delete_environment(workspace_id: str, environment_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricEnvironment -WorkspaceId '{workspace_id}' "
                f"-EnvironmentId '{environment_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="publish_environment",
        description=(
            "Publish a Microsoft Fabric environment to make staged changes live.\n\n"
            "Environments must be published after making library or Spark compute changes "
            "before they take effect in notebooks and jobs."
        ),
    )
    def publish_environment(workspace_id: str, environment_id: str) -> str:
        try:
            cmd = (
                f"Publish-FabricEnvironment -WorkspaceId '{workspace_id}' "
                f"-EnvironmentId '{environment_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_environment_spark_compute",
        description=(
            "Get the published Spark compute configuration for a Microsoft Fabric environment.\n\n"
            "Returns the active Spark pool configuration including instance type and node count."
        ),
    )
    def get_environment_spark_compute(workspace_id: str, environment_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricEnvironmentSparkCompute -WorkspaceId '{workspace_id}' "
                f"-EnvironmentId '{environment_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
