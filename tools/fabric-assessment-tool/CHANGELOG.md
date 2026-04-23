# Changelog

All notable changes to the Fabric Assessment Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-04-22

### Added

- **Databricks Cluster Policies**: Inventory workspace cluster policies — name, description, creator, definition
- **Databricks Instance Pools**: Discover instance pools — name, node type, min/max idle instances, state
- **Databricks Workspace Type Detection**: Classify workspaces as `hybrid` vs `serverless` using the authoritative ARM `properties.computeMode` field (api-version `2026-01-01`), falling back to the presence of a managed resource group when the field is missing. Surface `workspace_type`, `vnet_injected`, `custom_virtual_network_id`, `uses_private_endpoints`, `private_endpoint_count`, `public_network_access` (defaults to `Enabled` when ARM returns null, matching Azure's implicit default), `no_public_ip` (NPIP), `managed_resource_group`, and a grouped `network_settings` object in `workspace_info`; render them as badges/columns on the Databricks overview and workspace detail HTML views
- **Databricks DLT Pipelines**: Discover Delta Live Tables pipelines via REST API (`/api/2.0/pipelines`) — name, state, creator
- **Databricks Git Repos**: Inventory workspace Git repos — path, provider, branch, head commit
- **Databricks MLflow Experiments**: List MLflow experiments — name, lifecycle stage, creation/update timestamps
- **Databricks Model Serving Endpoints**: Enumerate model serving endpoints — name, state, creator, timestamps
- **Databricks SQL Alerts**: Collect SQL alert definitions — display name, query ID, owner, state
- **Databricks Genie Spaces**: Discover Genie AI/BI spaces — title, description, warehouse ID

### Changed

- **Enriched Databricks Clusters**: Added 16 fields — `policy_id`, `driver_node_type_id`, `custom_tags`, `default_tags`, `autotermination_minutes`, `cluster_source`, `state_message`, `creator_user_name`, `start_time`, `terminated_time`, `spark_conf`, `enable_elastic_disk`, `init_scripts_count`, `enable_local_disk_encryption`, `instance_pool_id`, `azure_attributes`, plus `disk_spec` (disk type/count/size) from the follow-up enrichment pass
- **Enriched Databricks SQL Warehouses**: Added 7 fields — `warehouse_id`, `auto_stop_mins`, `state`, `creator_name`, `warehouse_type`, `spot_instance_policy`, `channel`, plus `custom_tags`
- **Enriched Databricks Notebooks**: Added 3 fields — `created_by`, `created_at`, `modified_at`, plus `size` (object content size in bytes)
- **Enriched Databricks Unity Catalog Tables**: Added 9 fields — `full_name`, `storage_location`, `created_at`, `updated_at`, `created_by`, `updated_by`, `table_id`, `properties`, `view_definition`, plus `partition_columns`, `delta_runtime_properties`, `enable_predictive_optimization`, and `sql_path`
- **Enriched Databricks Jobs**: Added 13 fields across Job, JobSettings, and JobTask — `creator_user_name`, `created_time`, `timeout_seconds`, `max_concurrent_runs`, `format`, `schedule`, `email_notifications`, `task_key`, `description`, `max_retries`, `cluster_type`, `cluster_config`; Jobs now also expose `avg_duration_ms_last_3_runs` (computed from `run_duration` with a fallback to the deprecated component fields)
- **Enriched Databricks Unity Catalog Tables**: Added 9 fields — `full_name`, `storage_location`, `created_at`, `updated_at`, `created_by`, `updated_by`, `table_id`, `properties`, `view_definition`
- **Visualization**: Updated Databricks overview, workspace, and data engineering templates with sections for all new resource types
- **Export**: Structured JSON export now includes all new resource types under `resources/`
- **Export**: Databricks `external_locations/`, `connections/`, and `secret_scopes/` now emitted as individual JSON files under `resources/` (previously counted in summary but missing from the file tree)
- **Export**: Databricks `sql_warehouses/` moved under `resources/` to match the layout used by every other Databricks resource category
- **Visualization — Resource Summary**: Two-row layout (full-width chart above, full-width table below), logarithmic y-axis to keep low-cardinality resources readable next to high-cardinality ones, and all 11 Databricks resource types now charted (Notebooks, Clusters, Jobs, SQL Warehouses, Tables, DLT Pipelines, Repos, MLflow Experiments, Serving Endpoints, SQL Alerts, Genie Spaces)
- **Visualization — Workspace & Data Engineering Views**: Notebook tables now show `Size (KB)` and `Uses dbutils`; cluster listings split into "All-Purpose Compute" and "Job Clusters — latest per source" cards (job clusters deduplicated by `job-{id}` source, keeping the latest run); job tables show `Avg duration (last 3 runs)` in seconds

### Fixed

- **Assess**: `Failed to get jobs: 'Namespace' object has no attribute 'request_params'` when the Jobs `runs/list` response contained a `next_page_token` — pagination now initializes `request_params` when missing
- **Assess**: Suppressed noisy `Failed to get functions: 'retry-after'` warnings — `Retry-After` header is now looked up with a case-insensitive `.get()` and a 5-second default
- **Assess**: Suppressed `Failed to get serving endpoints: [NotFound]` on workspaces without Model Serving — 404s now degrade gracefully to an empty collection
- **Assess**: `Rate limit exceeded. Retrying in N seconds` message is now gated behind the `DEBUG` flag to reduce CLI noise during normal runs
- **Visualize**: Tables count on the Databricks overview showed `0` — `_add_databricks_counts` now reads `total_tables` (falling back to `tables`) and four Jinja templates follow the same lookup
- **Visualize**: Workspace detail and Data Engineering / Data Warehousing views rendered every Databricks resource as "Unknown"/"N/A" — aggregators and templates now unwrap the correct typed payload key (`notebook_data`, `cluster_data`, `job_data`, `warehouse_data`, `pipeline_data`, `repo_data`, `experiment_data`, `endpoint_data`, `alert_data`, `space_data`) with fallbacks to legacy `data` and bare items
- **Visualize**: Notebook language resolution now reads `json_response.language` first (where the real value lives), falling back to `default_language` and `language`; notebook display name synthesized from the path basename when absent
- **Visualize**: Job display name now promoted from `settings.name` to top-level `name`, and the tasks list flattened from `tasks.tasks` so `|length` returns the real task count

## [0.2.1] - 2026-04-08

### Added

- **Entra ID Authentication for Dedicated SQL Pools**: New authentication options for connecting to Synapse dedicated SQL pools
  - `--sql-auth-mode` CLI option with four authentication modes:
    - `sql` (default): Traditional SQL authentication with username/password
    - `entra-interactive`: Entra ID interactive authentication with browser popup and MFA support
    - `entra-spn`: Entra ID Service Principal authentication for non-interactive scenarios
    - `entra-default`: Entra ID default authentication using Azure CLI credentials or managed identity
  - `--sql-client-id`: Service principal client ID for SPN authentication
  - `--sql-client-secret`: Service principal client secret for SPN authentication
  - `--sql-tenant-id`: Azure tenant ID for SPN authentication (optional, defaults to 'common')

- **Interactive Authentication Prompt**: When running in interactive mode without specifying `--sql-auth-mode`, the tool now prompts users to choose their preferred authentication method for dedicated SQL pools:
  - Skip - Do not collect dedicated pool statistics
  - SQL Authentication - Use SQL admin username and password
  - Entra ID Interactive - Browser login with MFA support
  - Entra ID Default - Use Azure CLI credentials or managed identity

- **Documentation**: Added comprehensive guide for Entra ID authentication including:
  - Required database permissions for Entra ID users and service principals
  - SQL scripts for creating contained database users from external providers
  - Role assignments for reading system DMVs and creating views

### Changed

- `OdbcClient` refactored to support multiple authentication modes with proper connection string generation
- `SynapseClient` updated with helper methods for credential handling across auth modes

### Fixed

- **Fabric Notebook Hang**: Fixed an issue where the tool would hang indefinitely when running in Microsoft Fabric Notebooks. The root cause was `notebookutils.credentials.getToken()` hanging when requesting the `management.azure.com` scope, which is not supported in that environment. The tool now detects Fabric Notebook authentication and automatically falls back to the ODBC path for schema/table enumeration.

## [0.2.0] - 2026-03-12

### Added

- **Visualization Command** (`fat visualize`): New CLI command to generate interactive HTML reports from assessment results
  - Overview dashboard with global summary across all workspaces
  - Admin view: Integration runtimes, linked services, managed private endpoints, Spark libraries, Spark configurations
  - Data Engineering view: Notebooks, Spark pools, Spark job definitions, clusters, jobs
  - Data Warehousing view: Dedicated SQL pools, serverless databases, tables, stored procedures
  - Data Integration view: Pipelines, dataflows, datasets with activity breakdowns
  - Interactive workspace filter with multi-select checkbox
  - Charts for language distribution, activity types, pool sizes, and more
  - Platform-specific templates (Synapse vs Databricks auto-detection)
  - Standalone HTML files that work offline in any browser

- **Spark Configurations Extraction** (Synapse): Extract Spark configurations from Spark pool `sparkConfigProperties`
  - New `SynapseSparkConfiguration` and `SynapseSparkConfigurations` dataclasses
  - Track reference counts from Notebooks and Spark Job Definitions
  - Export to `admin/spark_configurations/` directory

- **Notebook Enhancements**:
  - `uses_mssparkutils` property on Synapse notebooks to detect mssparkutils usage
  - `uses_dbutils` property on Databricks notebooks to detect dbutils usage
  - `spark_configuration` property to track target Spark configuration name

- **Spark Job Definition Enhancements**:
  - `spark_configuration` property to track target Spark configuration name

### Changed

- Documentation updated with comprehensive `fat visualize` command examples and feature descriptions

## [0.0.1] - 2025-10-03

### Added

- Initial release
- **Assessment Command** (`fat assess`): CLI command to assess Synapse and Databricks workspaces
  - Synapse support: Notebooks, Spark pools, SQL pools (dedicated/serverless), pipelines, dataflows, linked services, integration runtimes, libraries
  - Databricks support: Notebooks, clusters, jobs, SQL warehouses, Unity Catalog (catalogs, schemas, tables, volumes, functions)
  - Hierarchical JSON export structure
  - Interactive workspace selection
- **Authentication**: Support for Azure CLI and Fabric Notebook authentication
- **Dedicated SQL Pool Statistics**: Optional DMV creation for table size statistics
