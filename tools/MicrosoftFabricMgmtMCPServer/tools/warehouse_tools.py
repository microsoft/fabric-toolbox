"""
Warehouse tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get/New/Update/Remove-FabricWarehouse, Get-FabricWarehouseConnectionString.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_warehouse_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register warehouse-related MCP tools."""

    @mcp.tool(
        name="list_warehouses",
        description=(
            "List all warehouses in a Microsoft Fabric workspace.\n\n"
            "Returns warehouse IDs, display names, and metadata. "
            "Optionally filter by warehouse_name."
        ),
    )
    def list_warehouses(
        workspace_id: str,
        warehouse_name: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if warehouse_name:
                params += f" -WarehouseName '{warehouse_name.replace(chr(39), chr(39)*2)}'"
            cmd = f"Get-FabricWarehouse {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_warehouse",
        description="Get details of a specific warehouse by its GUID within a workspace.",
    )
    def get_warehouse(workspace_id: str, warehouse_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricWarehouse -WorkspaceId '{workspace_id}' "
                f"-WarehouseId '{warehouse_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_warehouse",
        description=(
            "Create a new warehouse in a Microsoft Fabric workspace.\n\n"
            "Returns the created warehouse object including its new GUID."
        ),
    )
    def create_warehouse(
        workspace_id: str,
        display_name: str,
        description: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = f"-WorkspaceId '{workspace_id}' -DisplayName '{name}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"New-FabricWarehouse {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="update_warehouse",
        description="Update the display name or description of an existing warehouse.",
    )
    def update_warehouse(
        workspace_id: str,
        warehouse_id: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}' -WarehouseId '{warehouse_id}'"
            if display_name:
                params += f" -DisplayName '{display_name.replace(chr(39), chr(39)*2)}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"Update-FabricWarehouse {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_warehouse",
        description=(
            "Delete a warehouse from a Microsoft Fabric workspace.\n\n"
            "WARNING: This operation is irreversible."
        ),
    )
    def delete_warehouse(workspace_id: str, warehouse_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricWarehouse -WorkspaceId '{workspace_id}' "
                f"-WarehouseId '{warehouse_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_warehouse_connection_string",
        description=(
            "Get the SQL connection string for a Microsoft Fabric warehouse.\n\n"
            "Returns the TDS (SQL Server) endpoint connection string that can be used "
            "to connect from SSMS, Azure Data Studio, or other SQL clients."
        ),
    )
    def get_warehouse_connection_string(workspace_id: str, warehouse_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricWarehouseConnectionString -WorkspaceId '{workspace_id}' "
                f"-WarehouseId '{warehouse_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
