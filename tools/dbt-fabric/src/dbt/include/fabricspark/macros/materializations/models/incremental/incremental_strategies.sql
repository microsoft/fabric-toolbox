{% macro fabricspark_get_incremental_sql(strategy, source, target, existing, unique_key, incremental_predicates) %}
  {%- if strategy == 'append' -%}
    {{ fabricspark__get_insert_into_sql(source, target) }}
  {%- elif strategy == 'insert_overwrite' -%}
    {{ fabricspark__get_insert_overwrite_sql(source, target) }}
  {%- elif strategy == 'microbatch' -%}
    {% set missing_partition_key_microbatch_msg -%}
      The 'microbatch' incremental strategy requires a `partition_by` config.
      Ensure you are using a `partition_by` column that is of grain {{ config.get('batch_size') }}.
    {%- endset %}
    {%- if not config.get('partition_by') -%}
      {{ exceptions.raise_compiler_error(missing_partition_key_microbatch_msg) }}
    {%- endif -%}
    {{ fabricspark__get_insert_overwrite_sql(source, target) }}
  {%- elif strategy == 'merge' -%}
    {#-- dest_columns=none is fine: spark__get_merge_sql ignores it and fetches from adapter --#}
    {{ get_merge_sql(target, source, unique_key, dest_columns=none, incremental_predicates=incremental_predicates) }}
  {%- else -%}
    {% set no_sql_for_strategy_msg -%}
      No known SQL for the incremental strategy provided: {{ strategy }}
    {%- endset %}
    {{ exceptions.raise_compiler_error(no_sql_for_strategy_msg) }}
  {%- endif -%}
{% endmacro %}


{# Fabric Lakehouse INSERT INTO ... SELECT fails with REQUIRES_SINGLE_PART_NAMESPACE.
   Use MERGE with always-false condition to append all rows instead. #}
{% macro fabricspark__get_insert_into_sql(source_relation, target_relation) %}

    merge into {{ target_relation }} as DBT_INTERNAL_DEST
    using {{ source_relation }} as DBT_INTERNAL_SOURCE
    on false
    when not matched then insert *

{% endmacro %}


{#-- dbt-spark uses full target_relation; we strip database because INSERT OVERWRITE
     fails with REQUIRES_SINGLE_PART_NAMESPACE on 3-part names --#}
{% macro fabricspark__get_insert_overwrite_sql(source_relation, target_relation) %}

    {%- set dest_columns = adapter.get_columns_in_relation(target_relation) -%}
    {%- set dest_cols_csv = dest_columns | map(attribute='quoted') | join(', ') -%}
    insert overwrite table {{ target_relation.include(database=false) }}
    {{ partition_cols(label="partition") }}
    select {{ dest_cols_csv }} from {{ source_relation }}

{% endmacro %}
