"""
SQL Database tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get/New/Remove-FabricSQLDatabase, Get-FabricSQLDatabaseConnectionString.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_sql_database_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register SQL database MCP tools."""

    @mcp.tool(
        name="list_sql_databases",
        description=(
            "List all SQL databases in a Microsoft Fabric workspace.\n\n"
            "Returns SQL database IDs, display names, and metadata. "
            "Optionally filter by database_name."
        ),
    )
    def list_sql_databases(
        workspace_id: str,
        database_name: Optional[str] = None,
    ) -> str:
        try:
            params = f"-WorkspaceId '{workspace_id}'"
            if database_name:
                params += f" -SQLDatabaseName '{database_name.replace(chr(39), chr(39)*2)}'"
            cmd = f"Get-FabricSQLDatabase {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_sql_database",
        description="Get details of a specific SQL database by its GUID within a workspace.",
    )
    def get_sql_database(workspace_id: str, database_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricSQLDatabase -WorkspaceId '{workspace_id}' "
                f"-SQLDatabaseId '{database_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_sql_database",
        description=(
            "Create a new SQL database in a Microsoft Fabric workspace.\n\n"
            "Returns the created SQL database object including its new GUID."
        ),
    )
    def create_sql_database(
        workspace_id: str,
        display_name: str,
        description: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = f"-WorkspaceId '{workspace_id}' -DisplayName '{name}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"New-FabricSQLDatabase {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_sql_database",
        description=(
            "Delete a SQL database from a Microsoft Fabric workspace.\n\n"
            "WARNING: This operation is irreversible and deletes all data in the database."
        ),
    )
    def delete_sql_database(workspace_id: str, database_id: str) -> str:
        try:
            cmd = (
                f"Remove-FabricSQLDatabase -WorkspaceId '{workspace_id}' "
                f"-SQLDatabaseId '{database_id}'"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="get_sql_database_connection_string",
        description=(
            "Get the connection string for a Microsoft Fabric SQL database.\n\n"
            "Returns the SQL Server connection string for use with SSMS, Azure Data Studio, "
            "or other SQL clients."
        ),
    )
    def get_sql_database_connection_string(workspace_id: str, database_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricSQLDatabaseConnectionString -WorkspaceId '{workspace_id}' "
                f"-SQLDatabaseId '{database_id}' | ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
