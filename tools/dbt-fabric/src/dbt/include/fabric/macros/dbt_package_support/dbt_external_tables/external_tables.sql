{#
    Fabric Data Warehouse overrides for dbt-external-tables.

    Fabric Data Warehouse does not support CREATE EXTERNAL TABLE (that is
    Azure Synapse). Instead, external data access uses OPENROWSET(BULK ...).
    These macros override the package's Fabric plugin so that
    stage_external_sources creates views wrapping OPENROWSET queries.

    Users must configure dispatch so that dbt checks the adapter's
    built-in macros before the package's defaults:

        dispatch:
          - macro_namespace: dbt_external_tables
            search_order: ['dbt', 'dbt_external_tables']

    The package's fabric__get_external_build_plan already dispatches each
    sub-call (dropif, create_external_table, etc.) through
    dbt_external_tables.*, so only the leaf macros need to be overridden.

    Supported formats: PARQUET, CSV, JSONL.

    Source configuration example:

        sources:
          - name: my_external
            schema: dbo
            tables:
              - name: sales_parquet
                external:
                  location: "https://onelake.dfs.fabric.microsoft.com/.../sales.parquet"
                  file_format: parquet
                columns:
                  - name: id
                    data_type: int
                  - name: amount
                    data_type: "decimal(10,2)"

    CSV-specific options go in external.options:

        external:
          location: "https://.../data.csv"
          file_format: csv
          options:
            header_row: "true"
            fieldterminator: ","
            parser_version: "2.0"

#}


{#- Override: upstream creates a CREATE EXTERNAL TABLE with external file format and data source objects. Fabric DW lacks Synapse-style external tables, so we create a view wrapping OPENROWSET(BULK ...) instead. -#}
{% macro fabric__create_external_table(source_node) %}

    {%- set columns = source_node.columns.values() -%}
    {%- set external = source_node.external -%}
    {%- set location = external.location -%}

    {%- if not location -%}
        {{ exceptions.raise_compiler_error(
            "External source " ~ source_node.name ~ " is missing required 'location' property"
        ) }}
    {%- endif -%}

    {%- set file_format = fabric__resolve_file_format(external) -%}
    {%- set options = external.get('options', {}) -%}

    {%- set openrowset_sql = fabric__build_openrowset(location, file_format, options, columns) -%}
    {%- set view_relation = source(source_node.source_name, source_node.name).include(database=False) -%}

    {%- set ddl %}
{{ get_use_database_sql(source_node.database) }}
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = '{{ source_node.schema }}')
BEGIN
EXEC('CREATE SCHEMA [{{ source_node.schema }}]')
END;

EXEC('
CREATE VIEW {{ view_relation | replace("'", "''") }} AS
SELECT *
FROM {{ openrowset_sql | replace("'", "''") }}
');
    {% endset -%}

    {{ return(ddl) }}

{% endmacro %}


{#- Override: upstream resolves file format to a named EXTERNAL FILE FORMAT object. Fabric DW has no such objects, so we resolve to a FORMAT string literal for OPENROWSET. -#}
{% macro fabric__resolve_file_format(external) %}
    {%- set file_format = (external.get('file_format', '') or '') | lower -%}

    {%- if file_format -%}
        {%- if file_format in ['parquet', 'csv', 'jsonl'] -%}
            {{ return(file_format | upper) }}
        {%- else -%}
            {{ exceptions.raise_compiler_error(
                "Unsupported file_format '" ~ file_format ~ "'. "
                "Fabric Data Warehouse supports: parquet, csv, jsonl"
            ) }}
        {%- endif -%}
    {%- endif -%}

    {%- set location = external.location | lower -%}
    {%- if location.endswith('.parquet') -%}
        {{ return('PARQUET') }}
    {%- elif location.endswith('.csv') or location.endswith('.tsv') -%}
        {{ return('CSV') }}
    {%- elif location.endswith('.jsonl') or location.endswith('.ldjson') or location.endswith('.ndjson') -%}
        {{ return('JSONL') }}
    {%- else -%}
        {{ return('') }}
    {%- endif -%}
{% endmacro %}


{#- New macro (no upstream equivalent): builds the OPENROWSET(BULK ...) expression with format, options, and WITH clause. Upstream has no counterpart because it uses CREATE EXTERNAL TABLE DDL instead. -#}
{% macro fabric__build_openrowset(location, file_format, options, columns) %}
    {%- set parts = [] -%}
    {%- set escaped_location = location | replace("'", "''") -%}

    {%- do parts.append("OPENROWSET(") -%}
    {%- do parts.append("    BULK '" ~ escaped_location ~ "'") -%}

    {%- if file_format -%}
        {%- do parts.append("    , FORMAT = '" ~ file_format ~ "'") -%}
    {%- endif -%}

    {#- CSV-specific and other OPENROWSET options -#}
    {%- set valid_options = [
        'header_row', 'fieldterminator', 'rowterminator', 'fieldquote',
        'escapechar', 'parser_version', 'firstrow', 'codepage',
        'data_source', 'rows_per_batch', 'maxerrors', 'datafiletype'
    ] -%}

    {%- for key, value in options.items() if value is not none -%}
        {%- set opt_key = key | lower -%}
        {%- set escaped_value = (value | string).replace("'", "''") -%}
        {%- if opt_key in valid_options -%}
            {%- if opt_key in ['header_row'] and value | lower in ['true', 'false'] -%}
                {%- do parts.append("    , " ~ opt_key | upper ~ " = " ~ value) -%}
            {%- elif opt_key in ['firstrow', 'rows_per_batch', 'maxerrors'] -%}
                {%- do parts.append("    , " ~ opt_key | upper ~ " = " ~ value) -%}
            {%- elif opt_key == 'data_source' -%}
                {%- do parts.append("    , DATA_SOURCE = '" ~ escaped_value ~ "'") -%}
            {%- else -%}
                {%- do parts.append("    , " ~ opt_key | upper ~ " = '" ~ escaped_value ~ "'") -%}
            {%- endif -%}
        {%- endif -%}
    {%- endfor -%}

    {%- do parts.append(")") -%}

    {#- WITH clause for explicit column schema -#}
    {%- if columns | length > 0 -%}
        {%- set col_defs = [] -%}
        {%- for column in columns if column.data_type -%}
            {%- do col_defs.append("    " ~ adapter.quote(column.name) ~ " " ~ column.data_type) -%}
        {%- endfor -%}

        {%- if col_defs | length > 0 -%}
            {%- do parts.append("WITH (") -%}
            {%- do parts.append(col_defs | join(",\n")) -%}
            {%- do parts.append(")") -%}
        {%- endif -%}
    {%- endif -%}

    {{ return(parts | join("\n")) }}
{% endmacro %}


{#- Override: upstream drops the external table with DROP EXTERNAL TABLE IF EXISTS. Fabric DW uses views instead of external tables, so we drop the view. -#}
{% macro fabric__dropif(node) %}

    {%- set source_relation = source(node.source_name, node.name) -%}
    {%- set view_relation = source_relation.include(database=False) -%}

    {%- set ddl %}
{{ get_use_database_sql(source_relation.database) }}
EXEC('DROP VIEW IF EXISTS {{ view_relation | replace("'", "''") }};');
    {% endset -%}

    {{ return(ddl) }}

{% endmacro %}


{#- Override: upstream refreshes external table metadata (e.g., partition reloads). OPENROWSET reads live data on every query, so no refresh action is needed. -#}
{% macro fabric__refresh_external_table(source_node) %}
    {# OPENROWSET reads live data, no refresh needed #}
    {% do return([]) %}
{% endmacro %}
