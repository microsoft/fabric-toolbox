# Fabric Toolbox - AI Coding Agent Instructions

This repository contains tools, accelerators, scripts, and samples for Microsoft Fabric, developed by the Fabric Customer Advisory Team (CAT).

## Repository Architecture

### Core Structure
- **`accelerators/`** - End-to-end solutions for specific scenarios (BCDR, CI/CD, monitoring)
- **`tools/`** - Reusable utilities (PowerShell modules, Python SDKs, MCP servers)
- **`scripts/`** - SQL/T-SQL scripts for data warehouse operations and DMV queries
- **`samples/`** - Standalone examples demonstrating specific Fabric features
- **`monitoring/`** - Complete monitoring solutions (FCA, FUAM, Spark/Platform monitoring)

### Key Technology Patterns

#### Python Notebooks (Primary Development Pattern)
- **Standard imports**: Always use `semantic-link` or `semantic-link-labs` for Fabric operations
  ```python
  %pip install semantic-link-labs
  import sempy.fabric as fabric
  import sempy_labs as labs
  from sempy.fabric.exceptions import FabricHTTPException, WorkspaceNotFoundException
  ```
- **Workspace context**: Access current workspace via `spark.conf.get("trident.workspace.id")` or `notebookutils.runtime.context['currentWorkspaceId']`
- **REST API client**: Use `fabric.FabricRestClient()` for Fabric API calls
- **Common libraries**: `pandas`, `pyspark.sql`, `notebookutils`, `json`, `time`

#### PowerShell Scripts (Automation & Deployment)
- **MicrosoftFabricMgmt module** (`tools/MicrosoftFabricMgmt/`): PowerShell cmdlets for Fabric management
  - Pattern: `Get-Fabric*`, `New-Fabric*`, `Update-Fabric*`, `Remove-Fabric*`
  - Authentication: Use `Set-FabricApiHeaders` to configure `$FabricConfig` global
  - Token validation: Always call `Test-TokenExpired` before API operations
- **CI/CD automation**: Scripts in `accelerators/CICD/` use Azure DevOps APIs and Fabric REST APIs
- **Naming convention**: Variable groups (`GroupDevOps`, `GroupFabricWorkspaces`), branch names (`Stage1BrancheName`)

#### SQL Scripts (Data Warehouse Operations)
- **Location**: `scripts/dw-*` directories contain T-SQL for warehouse monitoring
- **DMV patterns**: Query `sys.dm_exec_*` views for request/query monitoring
- **Common views**: Create monitoring views for active requests, query execution, DMV snapshots
- **Collation**: Default is `Latin1_General_100_BIN2_UTF8`, case-insensitive alternative is `Latin1_General_100_CI_AS_KS_WS_SC_UTF8`

## Critical Development Workflows

### Fabric REST API Usage
All Fabric operations follow this pattern:
```python
client = fabric.FabricRestClient()
uri = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/{resource_type}"
response = client.get(uri)  # or .post(uri, json=payload), .delete(uri), etc.
data = response.json()
```
Common endpoints:
- `/workspaces/{id}/items` - Create items (warehouses, lakehouses)
- `/workspaces/{id}/warehouses` - List/manage warehouses
- `/workspaces/{id}/warehouses/{id}` - Get/delete specific warehouse

### Notebook-Based Accelerators Pattern
Examples: `accelerators/BCDR/`, `monitoring/fabric-*-monitoring/`
1. **Installation cell**: Always `%pip install semantic-link-labs`
2. **Import common utilities**: Use `notebookutils` for credentials, context, and lakehouse operations
3. **Client instantiation**: Create `FabricRestClient()` and optionally `PowerBIRestClient()`
4. **Helper functions**: Define utilities (e.g., `saveTable()`, `get_capacity_status()`) at notebook level
5. **DataFrame operations**: Convert between `pandas` and `pyspark` DataFrames using `spark.createDataFrame()`

### CI/CD Deployment Pattern
Reference: `accelerators/CICD/Git-based-deployments/`
1. **Variable Groups**: Define environment-specific variables in Azure DevOps (workspace IDs, branch names, file names)
2. **Secure Files**: Store JSON configs (`mapping_connections.json`, `onelake_roles.json`) as pipeline secure files
3. **Pipeline YAML**: Use Python scripts in `pipeline-scripts/` folder to orchestrate Git sync and workspace updates
4. **Pre/Post Deployment**: Execute notebooks from CI/CD workspace for connection mapping and lakehouse role management

## Project-Specific Conventions

### Semantic Link Labs Usage
- **Required version**: `semantic-link-labs` (not just `semantic-link`) for advanced features
- **Common operations**:
  - `labs.list_connections()` - Get all workspace connections
  - `labs.migration.*` - BCDR operations
  - `labs.directlake.*` - Direct Lake semantic model operations
  - `labs.admin.*` - Admin monitoring APIs

### Monitoring Solutions Architecture
All monitoring solutions (`monitoring/fabric-*-monitoring/`) share this pattern:
1. **Lakehouse storage**: Raw data in Files, processed in Delta tables
2. **Notebook extraction**: Scheduled notebooks call Admin APIs via `sempy_labs.admin`
3. **Real-Time Intelligence**: Use Eventhouse/Eventstream for streaming data
4. **Power BI reporting**: Direct Lake semantic models on lakehouse data
5. **Kusto integration**: Azure Data Explorer for advanced analytics (Spark/Platform monitoring)

### Data Warehouse Backup/Recovery
Reference: `accelerators/data-warehouse-backup-and-recovery/`
- **Metadata backup**: Use Git sync with Azure DevOps (required for automated recovery)
- **Data backup**: Enable BCDR feature switch for geo-redundant OneLake storage
- **Security backup**: Script out permissions using `ScriptFabricDWSecurity.sql` and `ScriptWorkspacePermissions.ps1`
- **Recovery**: Execute `RecreateArtifacts.ps1` with new capacity and workspace details

### MCP Server Development
Examples: `tools/SemanticModelMCPServer/`, `tools/DAXPerformanceTunerMCPServer/`
- **Structure**: `server.py` (main MCP server), `tools/` (MCP tool implementations), `core/` (shared utilities)
- **Authentication**: Use Azure token manager with fabric API scopes
- **Setup scripts**: `setup.bat`/`setup.ps1` for virtual environment creation and dependency installation
- **Configuration**: Generate `.vscode/mcp.json` for VS Code MCP client integration

## Common Patterns & Anti-Patterns

### ✅ Do This
- Install `semantic-link-labs` in notebooks before importing `sempy` modules
- Use `FabricRestClient()` for Fabric APIs, not raw `requests` library
- Store workspace/capacity IDs in variables or config files for reusability
- Handle long-running operations with polling loops checking status URIs
- Create Delta tables using `saveTable()` helper in BCDR notebooks
- Use Azure DevOps variable groups for environment-specific configuration

### ❌ Avoid This
- Don't hardcode workspace/item IDs in production code (use parameters or variables)
- Don't create sub-shells in PowerShell scripts unless explicitly requested
- Don't assume default collation for warehouses (always specify if case-insensitive needed)
- Don't skip token validation in PowerShell (`Test-TokenExpired`) before API calls
- Don't use outdated `semantic-link` version (use `semantic-link-labs`)

## Key Integration Points

### Azure Resources
- **Azure DevOps**: Required for Git-based CI/CD workflows
- **Azure Cost Management**: FCA solution extracts cost data in FOCUS format
- **Azure Key Vault**: Used in monitoring solutions for credential storage (`notebookutils.credentials.getSecret()`)
- **Azure Capacity**: Provision via Azure Portal, manage via Fabric APIs

### External Dependencies
- **Kusto/Real-Time Intelligence**: Monitoring solutions ingest to Eventhouse using `azure-kusto-ingest`
- **ODBC Drivers**: SQL endpoint connections require "ODBC Driver 18/17 for SQL Server"
- **Git Providers**: Azure DevOps (API-supported), GitHub (manual sync only)
- **Power BI**: Semantic models use Direct Lake mode on lakehouse data

## Testing & Debugging

### Notebook Execution
- Test notebooks in Fabric workspace environment (not local Jupyter)
- Use `display()` for DataFrames, not `print()` (better formatting in Fabric)
- Check capacity state before long-running operations: `get_capacity_status(capacity_id)`
- Monitor warehouse requests: Query `sys.dm_exec_requests` DMV for active operations

### PowerShell Module Testing
- Source: `tools/MicrosoftFabricMgmt/MicrosoftFabricMgmt/`
- Import module: `Import-Module ./MicrosoftFabricMgmt.psd1`
- Debug logging: Use `Write-Message -Level Debug` in functions
- Token refresh: Module automatically handles token expiration via `Test-TokenExpired`

## File Naming & Organization
- **Notebooks**: Use `.ipynb` extension, PascalCase or kebab-case naming
- **PowerShell**: Use PascalCase with verb-noun pattern (`Get-FabricWorkspace.ps1`)
- **SQL scripts**: Use kebab-case (`dw-active-requests.sql`)
- **JSON configs**: Lowercase with underscores (`mapping_connections.json`)
- **README placement**: Every folder with tools/samples should have a `README.md`

## Additional Resources
- All accelerators/tools include detailed README files with setup instructions
- Sample data/schemas often in `samples/` subdirectories or `media/` folders
- Microsoft Learn documentation links embedded in notebook comments
- Best effort support via [GitHub Issues](https://github.com/microsoft/fabric-toolbox/issues)
