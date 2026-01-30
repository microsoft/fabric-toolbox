# Querying Assessment Results with DuckDB

This guide shows how to query assessment results exported by the Fabric Assessment Tool using DuckDB. The tool now exports data in a hierarchical folder structure for better organization.

## Install DuckDB

```bash
pip install duckdb
```

```bash
curl https://install.duckdb.org | sh
```

## Folder Structure Overview

The exported assessment data follows this hierarchical structure:

```
output_path/
├── {workspace_name}/
│   ├── summary.json
│   ├── resources/
│   │   ├── notebooks/
│   │   ├── pipelines/ (Synapse) or jobs/ (Databricks)
│   │   └── sql_pools/ (Synapse) or clusters/ (Databricks)
│   ├── admin/ (Synapse only)
│   └── data/
│       ├── serverless_databases/ (Synapse)
│       │   └── databases/{db_name}/
│       │       ├── {db_name}.json
│       │       └── schemas/{schema_name}/
│       │           ├── {schema_name}.json
│       │           ├── tables/{table_name}.json
│       │           └── views/{view_name}.json
│       ├── dedicated_databases/ (Synapse)
│       └── unity_catalog/ (Databricks)
│           └── catalogs/{catalog_name}/
│               ├── {catalog_name}.json
│               └── schemas/{schema_name}/
│                   ├── {schema_name}.json
│                   ├── tables/{table_name}.json
│                   ├── volumes/{volume_name}.json
│                   └── functions/{function_name}.json
```

## Synapse Assessment Queries

### Notebooks

```sql
-- Create table from all notebook files
CREATE TABLE synapse_notebooks AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/resources/notebooks/*.json');

-- Query notebooks by language
SELECT data.language AS language, COUNT(*) AS notebook_count 
FROM synapse_notebooks 
GROUP BY data.language
ORDER BY notebook_count DESC;

-- Find notebooks with specific patterns
SELECT data.name, data.language
FROM synapse_notebooks 
WHERE data.name ILIKE '%etl%' OR data.name ILIKE '%transform%';
```

### SQL Pools

```sql
-- Create table from SQL pool files
CREATE TABLE synapse_sql_pools AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/resources/sql_pools/*.json');

-- Query pool information
SELECT pool_data.name AS pool_name,
       pool_data.status,
       pool_data.sku,
       type AS pool_type
FROM synapse_sql_pools;
```

### Serverless Databases

```sql
-- Create table from serverless database files
CREATE TABLE synapse_serverless_databases AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/data/serverless_databases/databases/*/*.json');

-- Query database information
SELECT data.name AS database_name,
       data.source_provider,
       data.origin_type
FROM synapse_serverless_databases
WHERE type = 'serverless_database';
```

### Serverless Schemas

```sql
-- Create table from serverless schema files
CREATE TABLE synapse_serverless_schemas AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/data/serverless_databases/databases/*/schemas/*/*.json');

-- Query schema information with database context
SELECT data.name AS schema_name,
       data.database AS database_name,
FROM synapse_serverless_schemas
WHERE type = 'schema';

-- Group schemas by database
SELECT data.database AS database_name,
       COUNT(*) AS schema_count
FROM synapse_serverless_schemas
WHERE type = 'schema'
GROUP BY database_name;
```

### Serverless Tables

```sql
-- Create table from serverless table files
CREATE TABLE synapse_serverless_tables AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/data/serverless_databases/databases/*/schemas/*/tables/*.json');

-- Query table information with hierarchy
SELECT data.name AS table_name,
       data.json_response.properties.TableType AS table_type,
       data.database AS database_name,
       data.schema AS schema_name
FROM synapse_serverless_tables
WHERE type = 'table';

-- Filter tables by type
SELECT data.database AS database_name,
       data.json_response.properties.TableType AS table_type,
       COUNT(*) AS table_count
FROM synapse_serverless_tables
WHERE type = 'table'
GROUP BY database_name, table_type;
```

### Dedicated Databases and Tables

```sql
-- Create table from dedicated database files
CREATE TABLE synapse_dedicated_databases AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/data/dedicated_databases/databases/*/*.json');

-- Create table from dedicated table files
CREATE TABLE synapse_dedicated_tables AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/data/dedicated_databases/databases/*/schemas/*/tables/*.json');

-- Query dedicated table statistics
SELECT data.name AS table_name,
       data.database AS database_name,
       data.schema AS schema_name,
       data.statistics.distribution_policy_name AS distribution_policy,
       data.statistics.table_row_count AS row_count,
       CAST(data.statistics.table_reserved_space_gb AS DECIMAL(18,3)) AS reserved_space_gb,
       CAST(data.statistics.table_data_space_gb AS DECIMAL(18,3)) AS data_space_gb
FROM synapse_dedicated_tables
WHERE type = 'table' AND data.statistics IS NOT NULL;

-- Aggregate statistics by database and distribution policy
SELECT data.database AS database_name,
       data.statistics.distribution_policy_name AS distribution_policy,
       SUM(data.statistics.table_row_count) AS total_rows,
       SUM(CAST(data.statistics.table_reserved_space_gb AS DECIMAL(18,3))) AS total_reserved_gb,
       SUM(CAST(data.statistics.table_data_space_gb AS DECIMAL(18,3))) AS total_data_gb,
       COUNT(*) AS table_count
FROM synapse_dedicated_tables
WHERE type = 'table' AND data.statistics IS NOT NULL
GROUP BY database_name, distribution_policy
ORDER BY total_data_gb DESC;
```

## Databricks Assessment Queries

### Unity Catalog Structure

```sql
-- Create table from Unity Catalog files
CREATE TABLE databricks_catalogs AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/data/unity_catalog/catalogs/*/*.json');

-- Query catalog information
SELECT data.name AS catalog_name,
       data.comment,
       data.owner,
       data.storage_root
FROM databricks_catalogs
WHERE type = 'unity_catalog';
```

### Unity Catalog Schemas

```sql
-- Create table from Unity Catalog schema files
CREATE TABLE databricks_schemas AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/data/unity_catalog/catalogs/*/schemas/*/*.json');

-- Query schema information with catalog context
SELECT data.name AS schema_name,
       data.comment,
       data.storage_root,
       data.catalog AS catalog_name
FROM databricks_schemas
WHERE type = 'schema';

-- Group schemas by catalog
SELECT data.catalog AS catalog_name,
       COUNT(*) AS schema_count
FROM databricks_schemas
WHERE type = 'schema'
GROUP BY catalog_name;
```

### Unity Catalog Tables

```sql
-- Create table from Unity Catalog table files
CREATE TABLE databricks_tables AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/data/unity_catalog/catalogs/*/schemas/*/tables/*.json', union_by_name=True);

-- Query table information with full hierarchy
SELECT data.name AS table_name,
       data.type AS table_type,
       data.format,
       data.columns AS column_count,
       data.comment,
       data.catalog AS catalog_name,
       data.schema AS schema_name
FROM databricks_tables
WHERE type = 'table';

-- Filter tables by format
SELECT data.catalog AS catalog_name,
       data.format,
       COUNT(*) AS table_count
FROM databricks_tables
WHERE type = 'table' AND data.format IS NOT NULL
GROUP BY catalog_name, data.format
ORDER BY catalog_name, table_count DESC;

-- Find tables with many columns
SELECT data.name AS table_name,
       data.catalog AS catalog_name,
       data.schema AS schema_name,
       data.columns AS column_count
FROM databricks_tables
WHERE type = 'table' AND data.columns > 50
ORDER BY data.columns DESC;
```

### Unity Catalog Volumes

```sql
-- Create table from Unity Catalog volume files
CREATE TABLE databricks_volumes AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/data/unity_catalog/catalogs/*/schemas/*/volumes/*.json');

-- Query volume information
SELECT data.name AS volume_name,
       data.type AS volume_type,
       data.catalog AS catalog_name,
       data.schema AS schema_name
FROM databricks_volumes
WHERE type = 'volume';
```

### Unity Catalog Functions

```sql
-- Create table from Unity Catalog function files
CREATE TABLE databricks_functions AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/data/unity_catalog/catalogs/*/schemas/*/functions/*.json');

-- Query function information
SELECT data.name AS function_name,
       data.catalog AS catalog_name,
       data.schema AS schema_name
FROM databricks_functions
WHERE type = 'function';
```

### Clusters and Jobs

```sql
-- Create table from cluster files
CREATE TABLE databricks_clusters AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/resources/clusters/*.json');

-- Query cluster information
SELECT cluster_data.cluster_name,
       cluster_data.state,
       cluster_data.node_type_id,
       cluster_data.cluster_cores,
       cluster_data.spark_version
FROM databricks_clusters;

-- Create table from job files
CREATE TABLE databricks_jobs AS
SELECT *
FROM read_json_auto('/path/to/your/assessment/results/*/resources/jobs/*.json');

-- Query job information
SELECT job_data.job_id,
       job_data.settings.name AS job_name,
       len(job_data.settings.json_response.tasks) AS task_number
FROM databricks_jobs;
```

## More examples


You can check more examples in the [provided notebook](../resources/assessment_analysis.ipynb)

