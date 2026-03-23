"""
Lakehouse tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get/New/Update/Remove-FabricLakehouse, Get-FabricLakehouseTable,
       Start-FabricLakehouseTableMaintenance.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_lakehouse_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register lakehouse-related MCP tools."""

    @mcp.tool(
        name="list_lakehouses",
        description=(
            "List all lakehouses in a Microsoft Fabric workspace.\n\n"
            "Returns lakehouse IDs, display names, and metadata. "
            "Optionally filter by lakehouse_name."
        ),
    )
    def list_lakehouses(
        workspace_id: str,
        lakehouse_name: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if lakehouse_name:
                params += f" -LakehouseName '{lakehouse_name.replace(chr(39), chr(39)*2)}'"
            cmd = f"Get-FabricLakehouse {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_lakehouse",
        description="Get details of a specific lakehouse by its GUID within a workspace.",
    )
    def get_lakehouse(workspace_id: str, lakehouse_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricLakehouse -WorkspaceId '{workspace_id}' "
                f"-LakehouseId '{lakehouse_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_lakehouse",
        description=(
            "Create a new lakehouse in a Microsoft Fabric workspace.\n\n"
            "Returns the created lakehouse object including its new GUID."
        ),
    )
    def create_lakehouse(
        workspace_id: str,
        display_name: str,
        description: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = f"-WorkspaceId '{workspace_id}' -DisplayName '{name}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"New-FabricLakehouse {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="update_lakehouse",
        description="Update the display name or description of an existing lakehouse.",
    )
    def update_lakehouse(
        workspace_id: str,
        lakehouse_id: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}' -LakehouseId '{lakehouse_id}'"
            if display_name:
                params += f" -DisplayName '{display_name.replace(chr(39), chr(39)*2)}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"Update-FabricLakehouse {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_lakehouse",
        description=(
            "Delete a lakehouse from a Microsoft Fabric workspace.\n\n"
            "WARNING: This operation is irreversible and deletes all data in the lakehouse."
        ),
    )
    def delete_lakehouse(workspace_id: str, lakehouse_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricLakehouse -WorkspaceId '{workspace_id}' "
                f"-LakehouseId '{lakehouse_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="list_lakehouse_tables",
        description=(
            "List all tables in a Microsoft Fabric lakehouse.\n\n"
            "Returns table names, schemas, and storage locations."
        ),
    )
    def list_lakehouse_tables(workspace_id: str, lakehouse_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricLakehouseTable -WorkspaceId '{workspace_id}' "
                f"-LakehouseId '{lakehouse_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="run_lakehouse_table_maintenance",
        description=(
            "Run table maintenance (OPTIMIZE/VACUUM) on a lakehouse table.\n\n"
            "operation must be one of: Optimize, Vacuum.\n"
            "v_order: Set True to enable V-Order optimization (Optimize only).\n"
            "retention_period_hours: Retention period in hours for Vacuum operation."
        ),
    )
    def run_lakehouse_table_maintenance(
        workspace_id: str,
        lakehouse_id: str,
        table_name: str,
        operation: str = "Optimize",
        v_order: bool = False,
        retention_period_hours: Optional[int] = None,
    ) -> str:
        try:
            tname = table_name.replace("'", "''")
            params = (
                f"-WorkspaceId '{workspace_id}' -LakehouseId '{lakehouse_id}' "
                f"-TableName '{tname}' -SchemaAndTableName '{tname}'"
            )
            if v_order:
                params += " -VOrder"
            if retention_period_hours is not None:
                params += f" -RetentionPeriod {retention_period_hours}"
            cmd = (
                f"Start-FabricLakehouseTableMaintenance {params} "
                "| ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
