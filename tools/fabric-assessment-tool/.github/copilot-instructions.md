# Copilot Instructions for Fabric Assessment Tool

## Build, Test & Lint

```bash
# Install in development mode
pip install -e .

# Run all tests with coverage
tox run -e py312           # or py310, py311

# Run a single test file
pytest tests/test_clients/test_synapse_client.py

# Run a single test
pytest tests/test_clients/test_synapse_client.py::test_get_workspace_info_success -v

# Lint/format (uses Black)
tox run -e lint

# Type checking (uses mypy)
tox run -e type

# Build distributable package
pip install build && python -m build
```

## Architecture

### CLI Structure
Entry point is `fat` command defined in `pyproject.toml` → `main:main` → `CLIRouter`.

Commands follow a pattern:
- `cli/router.py` - Routes to command handlers
- `commands/base.py` - Abstract `BaseCommand` with `get_name()`, `configure_parser()`, `handle()`
- `commands/assess.py`, `commands/visualize.py` - Concrete command implementations

### Core Flow
```
CLI Command → Service Layer → Platform Client → Assessment Dataclasses → Export
```

1. **Services** (`services/`) orchestrate the assessment workflow
   - `AssessmentService` - Main entry point, handles workspace iteration
     and dispatches to a platform client
   - `StructuredExportService` - Writes assessment dataclasses to a
     hierarchical on-disk tree. Today only the JSON exporter is
     implemented; `CSVExporter` and `ParquetExporter` are scaffolding
     stubs. See [`json-export-service.md`](./json-export-service.md)
     for the folder layout, wrapped-JSON shape, and extension points.
   - `VisualizationService` - Generates HTML reports from assessment
     data. See [`html-generator.md`](./html-generator.md).

2. **Clients** (`clients/`) handle platform-specific API calls
   - `SynapseClient` - Azure Synapse Analytics APIs (ARM + dev data plane)
   - `DatabricksClient` - Databricks APIs (uses `databricks-sdk`)
   - `OdbcClient` - ODBC/TDS access to Synapse dedicated SQL pools via
     `mssql-python`; supports SQL auth and three Entra ID modes
     (`entra-interactive`, `entra-spn`, `entra-default`)
   - `ApiClient` - Generic REST client wrapper
   - `TokenProvider` - Authentication (Azure CLI or Fabric notebook)

> **Platform-specific conventions live in dedicated docs**:
> [`synapse-platform.md`](./synapse-platform.md) for Synapse client /
> ODBC / dedicated-pool statistics, and
> [`databricks-platform.md`](./databricks-platform.md) for Databricks
> API quirks, workspace-type detection, and rate-limiting.
> Read them before touching the corresponding client.

3. **Assessment Dataclasses** (`assessment/`)
   - `synapse.py` - All Synapse-specific dataclasses (`SynapseAssessment`, `SynapseNotebook`, etc.)
   - `databricks.py` - All Databricks-specific dataclasses (`DatabricksAssessment`, etc.)
   - `common.py` - Shared types like `AssessmentStatus`

### HTML Templates (Visualization)
Templates use Jinja2 and are organized for platform-specific reporting.
See [`html-generator.md`](./html-generator.md) for the full pipeline,
JSON unwrapping convention, workspace-filter/Chart.js patterns,
view/resource extension steps, and Databricks-specific cluster-split /
avg-duration / network-badge rendering.

Quick layout:

```
templates/
├── base.html                    # Master layout (navbar, CSS, Chart.js, filter JS)
├── index.html                   # Redirects to platform-specific index
├── workspace.html               # Fallback workspace detail
├── synapse/   {index,workspace}.html + views/
├── databricks/{index,workspace}.html + views/
└── views/                       # Generic fallbacks (Synapse)
```

Key conventions at a glance:

- All view templates `{% extends "base.html" %}` with `{% block content %}` and `{% block scripts %}`.
- Row filtering: `data-workspace="{{ ws_name }}"` + optional `updateFilteredStats(selectedWorkspaces)`.
- Custom filters: `format_number`, `format_size` (registered in `VisualizationService`).
- Platform detection: `_detect_platform()` → `platform` template variable.
- Workspace filter persistence: localStorage key `fat-workspace-filter`.
- **Always unwrap wrapped resource JSON** with `item.<kind>_data or item.data or item` — see `html-generator.md`.

## Assessment Dataclass Hierarchy

Assessment data is modeled with Python dataclasses in `assessment/`. Each platform has a top-level assessment class containing nested dataclasses for each resource type.

### Synapse Hierarchy (`assessment/synapse.py`)

```
SynapseAssessment
├── status: AssessmentStatus
├── workspace_info: SynapseWorkspaceInfo
├── sql_pools: SynapseSqlPools
│   ├── dedicated_pools: List[SynapseDedicatedPool]
│   │   └── database: SynapseDedicatedDatabase
│   │       └── schemas: SynapseSchemas → List[SynapseSchema]
│   │           ├── tables: SynapseTables → List[SynapseTable]
│   │           │   └── statistics: TableStatistics (optional)
│   │           └── views: SynapseViews → List[SynapseView]
│   └── serverless_pool: SynapseServerlessPool
│       └── databases: SynapseServerlessDatabases → List[SynapseServerlessDatabase]
├── spark_pools: SynapseSparkPools → List[SynapseSparkPool]
├── notebooks: SynapseNotebooks → List[SynapseNotebook]
├── pipelines: SynapsePipelines → List[SynapsePipeline]
├── dataflows: SynapseDataflows → List[SynapseDataflow]
├── spark_job_definitions: SynapseSparkJobDefinitions → List[SynapseSparkJobDefinition]
├── sql_scripts: SynapseSqlScripts → List[SynapseSqlScript]
├── integration_runtimes: SynapseIntegrationRuntimes → List[SynapseIntegrationRuntime]
├── linked_services: SynapseLinkedServices → List[SynapseLinkedService]
├── datasets: SynapseDatasets → List[SynapseDataset]
├── managed_private_endpoints: SynapseManagedPrivateEndpoints → List[SynapseManagedPrivateEndpoint]
├── libraries: SynapseLibraries → List[SynapseLibrary]
├── spark_configurations: SynapseSparkConfigurations → List[SynapseSparkConfiguration]
└── assessment_metadata: SynapseAssessmentMetadata
```

### Databricks Hierarchy (`assessment/databricks.py`)

```
DatabricksAssessment
├── status: AssessmentStatus
├── workspace_info: DatabricksWorkspaceInfo
│   └── network_settings: DatabricksNetworkSettings  (grouped network fields)
├── clusters: DatabricksClusters → List[DatabricksCluster]
├── sql_warehouses: DatabricksSqlWarehouses → List[DatabricksSqlWarehouse]
├── notebooks: DatabricksNotebooks → List[DatabricksNotebook]
├── jobs: DatabricksJobs → List[DatabricksJob]
│   ├── tasks: DatabricksJobTasks → List[DatabricksJobTask]
│   ├── settings: DatabricksJobSettings
│   ├── latest_runs: DatabricksJobRuns → List[DatabricksJobRun]
│   └── avg_duration_ms_last_3_runs: Optional[float]
├── catalogs: DatabricksCatalogs → List[DatabricksCatalog] (Unity Catalog)
│   └── schemas: DatabricksSchemas → List[DatabricksSchema]
│       ├── tables: List[DatabricksTable]
│       ├── volumes: List[DatabricksVolume]
│       └── functions: List[DatabricksFunction]
├── external_locations: DatabricksExternalLocations → List[DatabricksExternalLocation]
├── connections: DatabricksConnections → List[DatabricksConnection]
├── secret_scopes: DatabricksSecretScopes → List[DatabricksSecretScope]
├── pipelines: DatabricksPipelines → List[DatabricksPipeline]            (DLT)
├── repos: DatabricksRepos → List[DatabricksRepo]
├── experiments: DatabricksExperiments → List[DatabricksExperiment]      (MLflow)
├── serving_endpoints: DatabricksServingEndpoints → List[DatabricksServingEndpoint]
├── alerts: DatabricksAlerts → List[DatabricksAlert]
├── genie_spaces: DatabricksGenieSpaces → List[DatabricksGenieSpace]
├── cluster_policies: DatabricksClusterPolicies → List[DatabricksClusterPolicy]
├── instance_pools: DatabricksInstancePools → List[DatabricksInstancePool]
└── assessment_metadata: DatabricksAssessmentMetadata
```

> **Databricks API quirks, workspace-type detection, duration fields,
> rate-limiting, and JSON-shape conventions live in
> [`databricks-platform.md`](./databricks-platform.md).** Read it before
> touching `clients/databricks_client.py` or any Databricks template.

### Dataclass Conventions
- **Collection wrapper pattern**: Each resource type has a plural wrapper (e.g., `SynapseNotebooks` contains `notebooks: List[SynapseNotebook]`)
- **`json_response: Any`**: Always include to preserve raw API response for debugging/extended analysis
- **Optional fields with defaults**: Place after required fields (e.g., `uses_mssparkutils: bool = False`)
- **`get_summary()` method**: Top-level assessment classes implement this for generating summary statistics
- **`AssessmentStatus`**: Shared status class in `common.py` with `status` and `description` fields

### Adding a New Resource Type
1. Define item dataclass (e.g., `SynapseNewResource`) with `json_response: Any`
2. Define collection wrapper (e.g., `SynapseNewResources` with `new_resources: List[SynapseNewResource]`)
3. Add field to top-level `SynapseAssessment` or `DatabricksAssessment`
4. Update `get_summary()` to include counts
5. Implement extraction in corresponding client (e.g., `SynapseClient._get_new_resources()`)
6. Add to `StructuredExportService` export logic

## Key Conventions

### Adding a New Platform Source
1. Create assessment dataclasses in `assessment/new_platform.py`
2. Create client in `clients/new_platform_client.py` with `assess_workspace()` method
3. Register in `AssessmentService._get_client()`
4. Add templates in `templates/new_platform/`

### Dataclass Pattern
Assessment data uses Python dataclasses with `json_response: Any` field to preserve raw API responses:
```python
@dataclass
class SynapseNotebook:
    name: str
    language: str
    json_response: Any  # Always include raw response
```

### Error Handling
Custom exceptions in `errors/api.py`:
- `FATError` - Base exception with status code support
- `AzureAPIError` - Parses Azure REST API error responses

### Authentication

**Azure / Databricks token acquisition** (via `TokenProvider`):
- `azure-cli` (default) - Uses `az login` credentials
- `fabric` - Uses `notebookutils.credentials.getToken()` in Fabric notebooks.
  Note: Fabric notebook auth **cannot reach `management.azure.com`**
  (the call hangs), so `DatabricksClient` and Synapse ARM fallbacks
  skip it in this mode — see `_ensure_azure_client`.

**Synapse dedicated SQL pool auth** (via `OdbcClient.auth_mode`):
- `sql` (default) - SQL login + password
- `entra-interactive` - Browser popup with MFA
- `entra-spn` - Service Principal (needs `--sql-client-id` /
  `--sql-client-secret`; `--sql-tenant-id` defaults to `common`)
- `entra-default` - `DefaultAzureCredential` chain (Azure CLI, MI, etc.)

See [`synapse-platform.md`](./synapse-platform.md) for the full auth
selection flow (including the interactive prompt in
`_get_sql_admin_credentials`).

### Output Structure
Assessment creates a hierarchical folder structure per workspace.
Full layout and the `{ "type": ..., "<kind>_data": {...}, "exported_at": ... }`
wrapper convention are documented in
[`json-export-service.md`](./json-export-service.md). Quick sketch:

```
output/
├── <workspace>/
│   ├── summary.json                 # assessment_data.get_summary()
│   ├── workspace.json               # Synapse only
│   ├── resources/                   # flat per-kind folders
│   │   ├── notebooks/*.json
│   │   ├── clusters/*.json          # Databricks
│   │   ├── sql_warehouses/*.json    # Databricks
│   │   ├── jobs/*.json              # Databricks
│   │   ├── pipelines/*.json         # Synapse + Databricks (DLT)
│   │   └── ...
│   ├── admin/                       # Synapse only
│   │   ├── integration_runtimes/
│   │   ├── linked_services/
│   │   └── datasets/
│   └── data/                        # nested tree for databases/schemas/tables
│       ├── serverless_databases/    # Synapse
│       ├── dedicated_databases/     # Synapse
│       ├── unity_catalog/           # Databricks
│       └── legacy_databases/        # Databricks (pre-UC)
└── assessment_summary.json          # aggregated summary across workspaces
```
