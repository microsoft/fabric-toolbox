"""
MicrosoftFabricMgmt MCP Server — main entry point.

Exposes the MicrosoftFabricMgmt PowerShell module capabilities through the
Model Context Protocol via a persistent pwsh subprocess session.

Start with:
    python server.py
"""
import logging
import sys

from fastmcp import FastMCP

from __version__ import __description__, __version__
from core.powershell_session import PowerShellSession, PowerShellSessionError
from tools.admin_tools import register_admin_tools
from tools.auth_tools import register_auth_tools
from tools.capacity_tools import register_capacity_tools
from tools.environment_tools import register_environment_tools
from tools.escape_hatch_tools import register_escape_hatch_tools
from tools.eventhouse_tools import register_eventhouse_tools
from tools.lakehouse_tools import register_lakehouse_tools
from tools.notebook_tools import register_notebook_tools
from tools.pipeline_tools import register_pipeline_tools
from tools.semantic_model_tools import register_semantic_model_tools
from tools.spark_tools import register_spark_tools
from tools.sql_database_tools import register_sql_database_tools
from tools.warehouse_tools import register_warehouse_tools
from tools.workspace_tools import register_workspace_tools

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FastMCP server instance
# ---------------------------------------------------------------------------

mcp = FastMCP(
    name="Microsoft Fabric Management MCP Server",
    instructions="""
A Model Context Protocol server for managing Microsoft Fabric resources.
This server wraps the MicrosoftFabricMgmt PowerShell module.

## IMPORTANT: Authentication Required
Before calling any resource tools you MUST authenticate using connect_to_fabric.

## Authentication Methods

User Principal (interactive browser login):
  connect_to_fabric(tenant_id="<your-tenant-guid>")

Service Principal (non-interactive, for automation):
  connect_to_fabric(tenant_id="<guid>", app_id="<guid>", app_secret="<secret>")

Managed Identity (Azure VMs / App Services / Functions only):
  connect_to_fabric(use_managed_identity=True)

## Typical Workflow

1. connect_to_fabric(...)                       — authenticate
2. list_workspaces()                            — discover workspace IDs
3. list_lakehouses(workspace_id="<guid>")       — explore resources
4. create_lakehouse(workspace_id="<guid>", display_name="My Lakehouse")

## Available Tool Categories

- **Auth**: connect_to_fabric, get_auth_status, disconnect_from_fabric
- **Workspaces**: list, get, create, update, delete, manage role assignments
- **Lakehouses**: list, get, create, update, delete, list tables, run maintenance
- **Warehouses**: list, get, create, update, delete, get connection string
- **Notebooks**: list, get, create, update, delete
- **Data Pipelines**: list, get, create, update, delete
- **Environments**: list, get, create, delete, publish, spark compute
- **Semantic Models**: list, get, create, update, delete
- **Eventhouses & KQL Databases**: list, create, delete
- **Spark**: workspace settings, custom pool management
- **Admin**: admin workspace views, item listings, user access
- **Capacities & Domains**: list capacities, manage domains
- **SQL Databases**: list, get, create, delete, get connection string
- **Escape Hatches**: invoke_fabric_ps, invoke_fabric_api_request

## Notes
- All tools return JSON strings
- WorkspaceId is a GUID required by most resource tools
- Use list_workspaces first to discover workspace GUIDs
- Use invoke_fabric_ps for any Fabric operation not covered by a dedicated tool
""",
)

# ---------------------------------------------------------------------------
# Shared PowerShell session (singleton — imported by all tool modules)
# ---------------------------------------------------------------------------

try:
    _ps_session = PowerShellSession()
except PowerShellSessionError as exc:
    logger.error("Failed to start PowerShell session: %s", exc)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Register all tool categories
# ---------------------------------------------------------------------------

register_auth_tools(mcp, _ps_session)
register_workspace_tools(mcp, _ps_session)
register_lakehouse_tools(mcp, _ps_session)
register_warehouse_tools(mcp, _ps_session)
register_notebook_tools(mcp, _ps_session)
register_pipeline_tools(mcp, _ps_session)
register_environment_tools(mcp, _ps_session)
register_semantic_model_tools(mcp, _ps_session)
register_eventhouse_tools(mcp, _ps_session)
register_spark_tools(mcp, _ps_session)
register_admin_tools(mcp, _ps_session)
register_capacity_tools(mcp, _ps_session)
register_sql_database_tools(mcp, _ps_session)
register_escape_hatch_tools(mcp, _ps_session)

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logger.info("Starting %s v%s", mcp.name, __version__)
    mcp.run()
