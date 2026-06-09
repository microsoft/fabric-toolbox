"""
Capacity and domain tools for the MicrosoftFabricMgmt MCP Server.

Wraps: Get-FabricCapacity, Get/New/Update/Remove-FabricDomain,
       Get-FabricDomainWorkspace.
"""
import json
from typing import Optional

from fastmcp import FastMCP

from core.powershell_session import PowerShellSession, PowerShellSessionError


def _err(msg: str, err_type: str = "tool_error") -> str:
    return json.dumps({"success": False, "error": msg, "error_type": err_type}, indent=2)


def register_capacity_tools(mcp: FastMCP, session: PowerShellSession) -> None:
    """Register capacity and domain MCP tools."""

    # ------------------------------------------------------------------
    # Capacities
    # ------------------------------------------------------------------

    @mcp.tool(
        name="list_capacities",
        description=(
            "List all Microsoft Fabric capacities accessible to the authenticated user.\n\n"
            "Returns capacity IDs, display names, SKU, region, and state. "
            "Use the capacity ID when assigning workspaces to a specific capacity."
        ),
    )
    def list_capacities() -> str:
        try:
            cmd = "Get-FabricCapacity | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    # ------------------------------------------------------------------
    # Domains
    # ------------------------------------------------------------------

    @mcp.tool(
        name="list_domains",
        description=(
            "List all domains in the Microsoft Fabric tenant.\n\n"
            "Returns domain IDs, display names, descriptions, and parent domain. "
            "Domains are used to organise workspaces for governance."
        ),
    )
    def list_domains() -> str:
        try:
            cmd = "Get-FabricDomain | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="create_domain",
        description=(
            "Create a new domain in the Microsoft Fabric tenant.\n\n"
            "Returns the created domain object including its new GUID.\n"
            "parent_domain_id: Optional GUID of a parent domain for a sub-domain hierarchy."
        ),
    )
    def create_domain(
        display_name: str,
        description: Optional[str] = None,
        parent_domain_id: Optional[str] = None,
    ) -> str:
        try:
            name = display_name.replace("'", "''")
            params = f"-DisplayName '{name}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            if parent_domain_id:
                params += f" -ParentDomainId '{parent_domain_id}'"
            cmd = f"New-FabricDomain {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="update_domain",
        description="Update the display name or description of an existing domain.",
    )
    def update_domain(
        domain_id: str,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> str:
        try:
            params = f"-DomainId '{domain_id}'"
            if display_name:
                params += f" -DisplayName '{display_name.replace(chr(39), chr(39)*2)}'"
            if description:
                params += f" -Description '{description.replace(chr(39), chr(39)*2)}'"
            cmd = f"Update-FabricDomain {params} | ConvertTo-Json -Depth 5 -Compress"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="delete_domain",
        description=(
            "Delete a domain from the Microsoft Fabric tenant.\n\n"
            "WARNING: This operation is irreversible. Workspaces assigned to this domain "
            "will be unassigned."
        ),
    )
    def delete_domain(domain_id: str) -> str:
        try:
            cmd = f"Remove-FabricDomain -DomainId '{domain_id}'"
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))

    @mcp.tool(
        name="list_domain_workspaces",
        description=(
            "List all workspaces assigned to a specific domain.\n\n"
            "Returns workspace IDs and display names that belong to the specified domain."
        ),
    )
    def list_domain_workspaces(domain_id: str) -> str:
        try:
            cmd = (
                f"Get-FabricDomainWorkspace -DomainId '{domain_id}' "
                "| ConvertTo-Json -Depth 5 -Compress"
            )
            return session.run(cmd)
        except PowerShellSessionError as exc:
            return _err(str(exc), "powershell_session_error")
        except Exception as exc:
            return _err(str(exc))
