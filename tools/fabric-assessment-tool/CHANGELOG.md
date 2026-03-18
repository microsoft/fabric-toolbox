# Changelog

All notable changes to the Fabric Assessment Tool will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
