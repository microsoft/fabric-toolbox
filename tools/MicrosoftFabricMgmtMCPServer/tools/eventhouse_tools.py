"""
Eventhouse and KQL Database tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get/New/Remove-FabricEventhouse, Get/New/Remove-FabricKQLDatabase.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_eventhouse_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register eventhouse and KQL database MCP tools."""

    # ------------------------------------------------------------------
    # Eventhouse
    # ------------------------------------------------------------------

    @mcp.tool(
        name="list_eventhouses",
        description=(
            "List all eventhouses in a Microsoft Fabric workspace.\n\n"
            "Returns eventhouse IDs, display names, and metadata. "
            "Optionally filter by eventhouse_name."
        ),
    )
    def list_eventhouses(
        workspace_id: str,
        eventhouse_name: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if eventhouse_name:
                params += f" -EventhouseName '{eventhouse_name.replace(chr(39), chr(39)*2)}'"
            cmd = f"Get-FabricEventhouse {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_eventhouse",
        description=(
            "Create a new eventhouse in a Microsoft Fabric workspace.\n\n"
            "An eventhouse is a container for KQL databases used in Real-Time Intelligence. "
            "Returns the created eventhouse object including its new GUID."
        ),
    )
    def create_eventhouse(
        workspace_id: str,
        display_name: str,
        description: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = f"-WorkspaceId '{workspace_id}' -DisplayName '{name}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"New-FabricEventhouse {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_eventhouse",
        description=(
            "Delete an eventhouse from a Microsoft Fabric workspace.\n\n"
            "WARNING: This operation is irreversible and deletes all KQL databases within."
        ),
    )
    def delete_eventhouse(workspace_id: str, eventhouse_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricEventhouse -WorkspaceId '{workspace_id}' "
                f"-EventhouseId '{eventhouse_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    # ------------------------------------------------------------------
    # KQL Database
    # ------------------------------------------------------------------

    @mcp.tool(
        name="list_kql_databases",
        description=(
            "List all KQL databases in a Microsoft Fabric workspace.\n\n"
            "Returns KQL database IDs, display names, parent eventhouse, and metadata. "
            "Optionally filter by kql_database_name."
        ),
    )
    def list_kql_databases(
        workspace_id: str,
        kql_database_name: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if kql_database_name:
                params += f" -KQLDatabaseName '{kql_database_name.replace(chr(39), chr(39)*2)}'"
            cmd = f"Get-FabricKQLDatabase {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_kql_database",
        description=(
            "Create a new KQL database within a Microsoft Fabric eventhouse.\n\n"
            "eventhouse_id is the GUID of the parent eventhouse that will host the database. "
            "Returns the created KQL database object including its new GUID."
        ),
    )
    def create_kql_database(
        workspace_id: str,
        display_name: str,
        eventhouse_id: str,
        description: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = (
                f"-WorkspaceId '{workspace_id}' -DisplayName '{name}' "
                f"-EventhouseId '{eventhouse_id}'"
            )
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"New-FabricKQLDatabase {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_kql_database",
        description=(
            "Delete a KQL database from a Microsoft Fabric workspace.\n\n"
            "WARNING: This operation is irreversible and deletes all data in the database."
        ),
    )
    def delete_kql_database(workspace_id: str, kql_database_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricKQLDatabase -WorkspaceId '{workspace_id}' "
                f"-KQLDatabaseId '{kql_database_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
