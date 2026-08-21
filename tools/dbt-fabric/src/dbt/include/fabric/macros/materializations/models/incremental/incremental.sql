{% materialization incremental, adapter='fabric', supported_languages=['sql', 'python'] %}

  {# Configs #}
  {%- set language = model['language'] -%}
  {%- set full_refresh_mode = should_full_refresh() -%}
  {%- set unique_key = config.get('unique_key') -%}
  {%- set incremental_strategy = config.get('incremental_strategy') or 'default' -%}
  {%- set grant_config = config.get('grants') -%}
  {%- set on_schema_change = incremental_validate_on_schema_change(config.get('on_schema_change'), default='ignore') -%}
  {%- set incremental_predicates = config.get('predicates', none) or config.get('incremental_predicates', none) -%}
  {%- set strategy_sql_macro_func = adapter.get_incremental_strategy_macro(context, incremental_strategy) -%}

  {# Load target relation #}
  {%- set target_relation = this.incorporate(type='table') -%}
  {%- set existing_relation = load_cached_relation(this) -%}

  {# Can't overwrite a view with a table - we must drop #}
  {% if existing_relation is not none and existing_relation.type == 'view' %}
    {{ log("Dropping relation " ~ existing_relation ~ " because it is a view and target is a table.") }}
    {% do adapter.drop_relation(existing_relation) %}
    {%- set existing_relation = none -%}
  {% endif %}

  {{ run_hooks(pre_hooks, inside_transaction=False) }}
  {# `BEGIN` happens here: #}
  {{ run_hooks(pre_hooks, inside_transaction=True) }}

  {# Full rebuild when no target table exists or full refresh requested #}
  {% if existing_relation is none or full_refresh_mode %}

    {# Set up intermediate and backup relations #}
    {%- set intermediate_relation = make_intermediate_relation(target_relation) -%}
    {%- set preexisting_intermediate_relation = load_cached_relation(intermediate_relation) -%}
    {%- set backup_relation = make_backup_relation(target_relation, 'table') -%}
    {%- set preexisting_backup_relation = load_cached_relation(backup_relation) -%}

    {{ drop_relation_if_exists(preexisting_backup_relation) }}
    {{ drop_relation_if_exists(preexisting_intermediate_relation) }}

    {# Build model into intermediate relation #}
    {%- call statement('main', language=language) -%}
      {{ create_table_as(False, intermediate_relation, compiled_code, language) }}
    {%- endcall -%}

    {% do create_indexes(intermediate_relation) %}

    {# Swap: rename existing → backup, intermediate → target, then drop backup #}
    {% if existing_relation is not none %}
      {{ adapter.rename_relation(existing_relation, backup_relation) }}
      {{ adapter.rename_relation(intermediate_relation, target_relation) }}
      {{ adapter.drop_relation(backup_relation) }}
    {% else %}
      {{ adapter.rename_relation(intermediate_relation, target_relation) }}
    {% endif %}

  {# Incremental merge into existing target table #}
  {% else %}

    {%- set temp_relation = make_temp_relation(target_relation) -%}
    {{ drop_relation_if_exists(temp_relation) }}

    {%- call statement('create_tmp_relation', language=language) -%}
      {{ create_table_as(True, temp_relation, compiled_code, language) }}
    {%- endcall -%}

    {% do adapter.expand_target_column_types(
        from_relation=temp_relation,
        to_relation=target_relation
    ) %}

    {# Process schema changes. Returns dict of changes if successful. Use source columns for upserting/merging #}
    {% set dest_columns = process_schema_changes(on_schema_change, temp_relation, existing_relation) %}
    {% if not dest_columns %}
      {% set dest_columns = adapter.get_columns_in_relation(existing_relation) %}
    {% endif %}

    {# Build the SQL for the incremental strategy macro #}
    {%- set strategy_arg_dict = ({
        'target_relation': target_relation,
        'temp_relation': temp_relation,
        'unique_key': unique_key,
        'dest_columns': dest_columns,
        'incremental_predicates': incremental_predicates,
    }) -%}

    {%- call statement('main') -%}
      {{ strategy_sql_macro_func(strategy_arg_dict) }}
    {%- endcall -%}

    {{ adapter.drop_relation(temp_relation) }}

  {% endif %}

  {{ run_hooks(post_hooks, inside_transaction=True) }}

  {%- set should_revoke = should_revoke(existing_relation, full_refresh_mode) -%}
  {% do apply_grants(target_relation, grant_config, should_revoke=should_revoke) %}
  {% do persist_docs(target_relation, model) %}

  {# `COMMIT` happens here #}
  {% do adapter.commit() %}

  {# Add constraints including FK relation #}
  {{ build_model_constraints(target_relation) }}
  {{ create_or_update_statistics(target_relation, existing_table=(existing_relation is not none and not full_refresh_mode)) }}
  {{ run_hooks(post_hooks, inside_transaction=False) }}

  {{ return({'relations': [target_relation]}) }}

{% endmaterialization %}
