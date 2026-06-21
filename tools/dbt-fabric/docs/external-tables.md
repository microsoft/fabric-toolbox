# External tables (dbt-external-tables)

This adapter provides compatibility macros for the [dbt-external-tables](https://github.com/dbt-labs/dbt-external-tables) package, enabling you to define external data sources that query files stored in Azure Blob Storage, Azure Data Lake Storage, or Fabric OneLake directly from your Fabric Data Warehouse.

## How it works

The dbt-external-tables package includes a Fabric plugin, but it uses `CREATE EXTERNAL TABLE` syntax designed for Azure Synapse, which Fabric Data Warehouse does not support. Instead, Fabric Data Warehouse uses the T-SQL [`OPENROWSET(BULK ...)`](https://learn.microsoft.com/sql/t-sql/functions/openrowset-bulk-transact-sql?view=fabric) function for external data access.

This adapter provides override macros that replace the package's Fabric plugin. When you run `dbt run-operation stage_external_sources`, the overridden macros create **views** that wrap `OPENROWSET` queries. This means:

- External sources are queryable as regular views via `{{ source('my_external', 'my_table') }}`
- Data is always fresh -- `OPENROWSET` reads directly from the file on each query
- No refresh is needed (the `refresh_external_table` macro is a no-op)

Supported file formats: **Parquet**, **CSV**, **JSONL**.

## Setup

### 1. Install dbt-external-tables

Add the package to your `packages.yml`:

```yaml
packages:
  - package: dbt-labs/dbt_external_tables
    version: "0.11.0"  # or latest
```

Then run:

```shell
dbt deps
```

### 2. Configure dispatch

Add the following to your `dbt_project.yml` so that dbt-external-tables uses the OPENROWSET macros from this adapter instead of the Synapse-style macros bundled with the package:

```yaml
dispatch:
  - macro_namespace: dbt_external_tables
    search_order: ['dbt', 'dbt_external_tables']
```

The `dbt` entry in the search order tells dbt to check the adapter's built-in macros before falling back to the package's defaults. This is how the adapter's OPENROWSET-based macros take priority over the package's `CREATE EXTERNAL TABLE` macros.

## Quick start

You can try OPENROWSET with a CSV file stored in your Fabric OneLake. First, upload a file to your lakehouse's Files section, then define a source pointing to its OneLake URL.

Add this source to your `sources.yml`:

```yaml
sources:
  - name: my_external
    schema: dbo
    tables:
      - name: sample_csv
        external:
          location: "https://onelake.dfs.fabric.microsoft.com/<workspace-id>/<lakehouse-id>/Files/data/sample.csv"
          file_format: csv
          options:
            header_row: "true"
            fieldterminator: ","
            parser_version: "2.0"
        columns:
          - name: id
            data_type: int
          - name: name
            data_type: "varchar(100)"
          - name: amount
            data_type: "decimal(10,2)"
```

Replace `<workspace-id>` and `<lakehouse-id>` with your Fabric workspace and lakehouse GUIDs. You can find these in the OneLake URL shown in the Fabric portal.

Stage the source and query it:

```shell
dbt run-operation stage_external_sources
```

```sql
-- In a dbt model
select *
from {{ source('my_external', 'sample_csv') }}
where amount > 20.00
```

## Source configuration

Define external sources in your `sources.yml` files. The `external` property controls how `OPENROWSET` is called.

### Parquet

```yaml
sources:
  - name: my_external
    schema: dbo
    tables:
      - name: sales
        external:
          location: "https://onelake.dfs.fabric.microsoft.com/<workspace-id>/<lakehouse-id>/Files/data/sales.parquet"
          file_format: parquet
        columns:
          - name: id
            data_type: int
          - name: amount
            data_type: "decimal(10,2)"
          - name: sale_date
            data_type: datetime2(6)
```

For Parquet files, defining columns is optional. If omitted, `OPENROWSET` will automatically infer the schema from the file. Defining columns explicitly generates a `WITH` clause that gives you precise control over data types.

### CSV

```yaml
sources:
  - name: my_external
    schema: dbo
    tables:
      - name: transactions
        external:
          location: "https://myaccount.blob.core.windows.net/container/data/transactions.csv"
          file_format: csv
          options:
            header_row: "true"
            fieldterminator: ","
            parser_version: "2.0"
        columns:
          - name: id
            data_type: int
          - name: description
            data_type: "varchar(200)"
          - name: amount
            data_type: "decimal(10,2)"
```

### JSONL

```yaml
sources:
  - name: my_external
    schema: dbo
    tables:
      - name: events
        external:
          location: "https://myaccount.dfs.core.windows.net/container/events/latest.jsonl"
          file_format: jsonl
```

### Auto-detected format

If `file_format` is not specified, the adapter detects the format from the file extension:

| Extension | Detected format |
|---|---|
| `.parquet` | PARQUET |
| `.csv`, `.tsv` | CSV |
| `.jsonl`, `.ldjson`, `.ndjson` | JSONL |

If the extension is not recognized and `file_format` is not set, `OPENROWSET` is called without a `FORMAT` option and Fabric will attempt to detect the format automatically.

## Configuration reference

### `external.location`

**Required.** The full URL to the file. Supported storage locations:

- Azure Blob Storage: `https://<account>.blob.core.windows.net/<container>/<path>`
- Azure Data Lake Storage Gen2: `https://<account>.dfs.core.windows.net/<container>/<path>`
- Fabric OneLake: `https://onelake.dfs.fabric.microsoft.com/<workspace-id>/<lakehouse-id>/Files/<path>`

Wildcards are supported (e.g., `*.parquet` to read all Parquet files in a folder).

### `external.file_format`

Optional. One of: `parquet`, `csv`, `jsonl`. Case-insensitive. If omitted, the format is detected from the file extension.

### `external.options`

Optional dictionary of additional `OPENROWSET` options. These are format-specific:

| Option | Applies to | Description |
|---|---|---|
| `header_row` | CSV | `true` or `false` -- whether the first row contains column names |
| `fieldterminator` | CSV | Character separating fields (default: `,`) |
| `rowterminator` | CSV | Character separating rows (default: `\r\n`) |
| `fieldquote` | CSV | Character used to quote fields |
| `escapechar` | CSV | Escape character for special characters |
| `parser_version` | CSV | `1.0` or `2.0` (`2.0` required for `HEADER_ROW`) |
| `firstrow` | CSV, JSONL | Row number to start reading from |
| `codepage` | CSV, JSONL | Character encoding |
| `data_source` | All | Name of an external data source (when using relative paths) |
| `rows_per_batch` | All | Hint for batch processing |
| `maxerrors` | All | Maximum number of errors before failing |

### Columns with `data_type`

When columns are defined with `data_type`, the adapter generates a `WITH` clause that explicitly maps columns to specific SQL types. This is recommended for CSV and JSONL files where automatic type inference may not produce the desired types.

## Usage

After configuring your sources, stage the external tables:

```shell
dbt run-operation stage_external_sources
```

This creates views in your Fabric Data Warehouse. You can then reference them in your models:

```sql
select *
from {{ source('my_external', 'sales') }}
where sale_date > '2024-01-01'
```

To recreate all views (e.g., after changing the source configuration):

```shell
dbt run-operation stage_external_sources --vars 'ext_full_refresh: true'
```

## Limitations

- Fabric Data Warehouse does not support the `DELTA` format in `OPENROWSET`. For Delta Lake tables, use cross-database queries to a Lakehouse instead.
- `OPENROWSET` queries may be slower than querying data stored directly in the warehouse. For frequently accessed data, consider ingesting it into warehouse tables.
- Authentication to external storage is handled by Fabric. The files must be accessible from your Fabric workspace (either publicly accessible or via configured storage credentials).
