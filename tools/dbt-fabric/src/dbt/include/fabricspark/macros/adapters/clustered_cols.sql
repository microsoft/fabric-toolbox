{#-
  Overrides dbt-spark's `spark__clustered_cols` (dbt-spark/macros/adapters.sql).

  Upstream only emits a clause when both `clustered_by` and `buckets` are set
  (Hive bucketing); `clustered_by` alone is a silent no-op. Fabric Lakehouse
  Spark accepts `CLUSTER BY (cols)` on Delta CTAS for liquid clustering, so
  we wire `clustered_by` through to that DDL when `buckets` is absent.

  Branches:
    - `clustered_by` + `buckets`           → unchanged Hive bucketing
    - `clustered_by` alone on Delta        → `cluster by (cols)` (liquid clustering)
    - `clustered_by` + `partition_by` Delta → compile-time error (mutually exclusive)
    - `clustered_by` on non-Delta format   → no-op (Hive bucketing requires `buckets`)

  Fabric Lakehouse is Delta-only; a missing `file_format` is treated as `delta`.
-#}
{% macro fabricspark__clustered_cols(label, required=false) %}
  {%- set cols = config.get('clustered_by', validator=validation.any[list, basestring]) -%}
  {%- set buckets = config.get('buckets', validator=validation.any[int]) -%}
  {%- set file_format = config.get('file_format', default='delta') -%}
  {%- set partition_by = config.get('partition_by') -%}

  {%- if cols is not none -%}
    {%- if cols is string -%}
      {%- set cols = [cols] -%}
    {%- endif -%}

    {%- if buckets is not none -%}
      {{ label }} (
      {%- for item in cols -%}
        {{ item }}{%- if not loop.last -%},{%- endif -%}
      {%- endfor -%}
      ) into {{ buckets }} buckets
    {%- elif file_format == 'delta' -%}
      {%- if partition_by is not none -%}
        {{ exceptions.raise_compiler_error(
          "Delta tables in Fabric Lakehouse cannot combine `clustered_by` (liquid clustering) with `partition_by`. "
          ~ "Drop one, or set `buckets` to switch to Hive bucketing."
        ) }}
      {%- endif -%}
      cluster by (
      {%- for item in cols -%}
        {{ item }}{%- if not loop.last -%},{%- endif -%}
      {%- endfor -%}
      )
    {%- endif -%}
  {%- endif -%}
{% endmacro %}
