"""
Spark tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get-FabricSparkWorkspaceSettings, Get/New/Remove-FabricSparkCustomPool.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_spark_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register Spark-related MCP tools."""

    @mcp.tool(
        name="get_spark_workspace_settings",
        description=(
            "Get the Spark settings for a Microsoft Fabric workspace.\n\n"
            "Returns automatic log settings, high concurrency settings, and default pool configuration."
        ),
    )
    def get_spark_workspace_settings(workspace_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricSparkWorkspaceSettings -WorkspaceId '{workspace_id}' "
                "| ConvertTo-Json -Depth 10 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="list_spark_custom_pools",
        description=(
            "List all custom Spark pools defined in a Microsoft Fabric workspace.\n\n"
            "Returns pool IDs, names, node sizes, node families, and auto-scale settings."
        ),
    )
    def list_spark_custom_pools(workspace_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricSparkCustomPool -WorkspaceId '{workspace_id}' "
                "| ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_spark_custom_pool",
        description=(
            "Create a custom Spark pool in a Microsoft Fabric workspace.\n\n"
            "node_family: 'MemoryOptimized' (currently the only supported value).\n"
            "node_size: 'Small', 'Medium', 'Large', 'XLarge', 'XXLarge', 'XXXLarge'.\n"
            "auto_scale_enabled: Enable dynamic scaling of nodes.\n"
            "min_node_count / max_node_count: Node count range for auto-scale.\n"
            "auto_pause_enabled: Pause the pool automatically when idle.\n"
            "auto_pause_delay_in_minutes: Minutes of idle time before auto-pause."
        ),
    )
    def create_spark_custom_pool(
        workspace_id: str,
        display_name: str,
        node_family: str = "MemoryOptimized",
        node_size: str = "Medium",
        auto_scale_enabled: bool = True,
        min_node_count: int = 1,
        max_node_count: int = 3,
        auto_pause_enabled: bool = True,
        auto_pause_delay_in_minutes: int = 10,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            auto_scale = "$true" if auto_scale_enabled else "$false"
            auto_pause = "$true" if auto_pause_enabled else "$false"
            cmd = (
                f"New-FabricSparkCustomPool -WorkspaceId '{workspace_id}' "
                f"-DisplayName '{name}' -NodeFamily '{node_family}' "
                f"-NodeSize '{node_size}' -AutoScaleEnabled {auto_scale} "
                f"-MinNodeCount {min_node_count} -MaxNodeCount {max_node_count} "
                f"-AutoPauseEnabled {auto_pause} "
                f"-AutoPauseDelayInMinutes {auto_pause_delay_in_minutes} "
                "| ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_spark_custom_pool",
        description=(
            "Delete a custom Spark pool from a Microsoft Fabric workspace.\n\n"
            "WARNING: This operation is irreversible. Jobs using this pool will fail."
        ),
    )
    def delete_spark_custom_pool(workspace_id: str, pool_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricSparkCustomPool -WorkspaceId '{workspace_id}' "
                f"-CustomPoolId '{pool_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
