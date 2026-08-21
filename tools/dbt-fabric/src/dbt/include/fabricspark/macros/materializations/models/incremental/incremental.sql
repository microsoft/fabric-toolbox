{% materialization incremental, adapter='fabricspark', supported_languages=['sql', 'python'] -%}

  {%- set full_refresh_mode = should_full_refresh() -%}
  {#-- dbt-spark defaults to 'parquet'; Fabric Lakehouse is always Delta --#}
  {%- set raw_file_format = config.get('file_format', default='delta') -%}
  {%- set unique_key = config.get('unique_key', none) -%}
  {#-- dbt-spark always defaults to 'append'; we default to 'merge' when unique_key is set --#}
  {%- set raw_strategy = config.get('incremental_strategy') or ('merge' if unique_key else 'append') -%}
  {%- set grant_config = config.get('grants') -%}

  {%- set file_format = dbt_spark_validate_get_file_format(raw_file_format) -%}
  {%- set strategy = dbt_spark_validate_get_incremental_strategy(raw_strategy, file_format) -%}

  {%- set partition_by = config.get('partition_by', none) -%}
  {%- set language = model['language'] -%}
  {%- set on_schema_change = incremental_validate_on_schema_change(config.get('on_schema_change'), default='ignore') -%}
  {%- set incremental_predicates = config.get('predicates', none) or config.get('incremental_predicates', none) -%}
  {%- set target_relation = this.incorporate(type='table') -%}
  {%- set existing_relation = load_relation(this) -%}
  {#-- dbt-spark strips database+schema for SQL (temp view); we keep them because Fabric has no temp views --#}
  {% set tmp_relation = this.incorporate(path={"identifier": this.identifier ~ '__dbt_tmp'}, type='table') -%}

  {%- if strategy in ['insert_overwrite', 'microbatch'] and partition_by -%}
    {%- call statement() -%}
      set spark.sql.sources.partitionOverwriteMode = DYNAMIC
    {%- endcall -%}
  {%- endif -%}

  {{ run_hooks(pre_hooks, inside_transaction=False) }}
  {{ run_hooks(pre_hooks, inside_transaction=True) }}

  {%- if existing_relation is none -%}
    {%- call statement('main', language=language) -%}
      {{ create_table_as(False, target_relation, compiled_code, language) }}
    {%- endcall -%}
    {% do persist_constraints(target_relation, model) %}
  {#-- dbt-spark only checks is_view; we also check is_materialized_view (Fabric has no plain views) --#}
  {%- elif existing_relation.is_view or existing_relation.is_materialized_view or full_refresh_mode -%}
    {# Drop and recreate: Fabric Lakehouse does not support atomic rename for tables #}
    {% do adapter.drop_relation(existing_relation) %}
    {%- call statement('main', language=language) -%}
      {{ create_table_as(False, target_relation, compiled_code, language) }}
    {%- endcall -%}
    {% do persist_constraints(target_relation, model) %}
  {%- else -%}
    {#-- dbt-spark uses create_table_as(True, ...) for a temp view; we use False (real table) --#}
    {%- call statement('create_tmp_relation', language=language) -%}
      {{ create_table_as(False, tmp_relation, compiled_code, language) }}
    {%- endcall -%}
    {%- do process_schema_changes(on_schema_change, tmp_relation, existing_relation) -%}
    {%- call statement('main') -%}
      {{ fabricspark_get_incremental_sql(strategy, tmp_relation, target_relation, existing_relation, unique_key, incremental_predicates) }}
    {%- endcall -%}
    {#-- dbt-spark only drops tmp for Python (temp views auto-expire); we always drop (real tables) --#}
    {% call statement('drop_tmp_relation') -%}
      drop table if exists {{ tmp_relation }}
    {%- endcall %}
  {%- endif -%}

  {% set should_revoke = should_revoke(existing_relation, full_refresh_mode) %}
  {% do apply_grants(target_relation, grant_config, should_revoke) %}

  {% do persist_docs(target_relation, model) %}

  {{ run_hooks(post_hooks, inside_transaction=True) }}
  {{ run_hooks(post_hooks, inside_transaction=False) }}

  {{ return({'relations': [target_relation]}) }}

{%- endmaterialization %}
