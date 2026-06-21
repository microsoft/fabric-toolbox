{# Delta SHALLOW CLONE works within the same schema in Fabric Lakehouse. #}
{% macro fabricspark__can_clone_table() %}
    {{ return(True) }}
{% endmacro %}

{% macro fabricspark__create_or_replace_clone(this_relation, defer_relation) %}
    create or replace table {{ this_relation }} shallow clone {{ defer_relation }}
{% endmacro %}


{# dbt-spark's clone requires file_format='delta' and errors if not set. We skip that check
   (Fabric Lakehouse always uses Delta). SHALLOW CLONE works within the same schema; for
   cross-schema we fall back to the view materialization since SHALLOW CLONE fails there. #}
{% materialization clone, adapter='fabricspark' %}

  {%- set relations = {'relations': []} -%}

  {%- if not defer_relation -%}
      {{ log("No relation found in state manifest for " ~ model.unique_id, info=True) }}
      {{ return(relations) }}
  {%- endif -%}

  {%- set existing_relation = load_cached_relation(this) -%}

  {%- if existing_relation and not flags.FULL_REFRESH -%}
      {{ log("Relation " ~ existing_relation ~ " already exists", info=True) }}
      {{ return(relations) }}
  {%- endif -%}

  {%- set other_existing_relation = load_cached_relation(defer_relation) -%}
  {%- set grant_config = config.get('grants') -%}

  {# Same schema + source is a table → SHALLOW CLONE (zero-copy, instant) #}
  {%- if other_existing_relation and other_existing_relation.type == 'table'
         and this.schema == defer_relation.schema -%}

      {%- set target_relation = this.incorporate(type='table') -%}
      {% if existing_relation is not none and not existing_relation.is_table %}
        {{ drop_relation_if_exists(existing_relation) }}
      {% endif %}

      {% call statement('main') %}
          {{ create_or_replace_clone(target_relation, defer_relation) }}
      {% endcall %}

      {% set should_revoke = should_revoke(existing_relation, full_refresh_mode=True) %}
      {% do apply_grants(target_relation, grant_config, should_revoke=should_revoke) %}
      {% do persist_docs(target_relation, model) %}

      {{ return({'relations': [target_relation]}) }}

  {%- else -%}

      {# Cross-schema or non-table source → delegate to view materialization #}
      {% set search_name = "materialization_view_" ~ adapter.type() %}
      {% if not search_name in context %}
          {% set search_name = "materialization_view_default" %}
      {% endif %}
      {% set materialization_macro = context[search_name] %}
      {% set relations = materialization_macro() %}
      {{ return(relations) }}

  {%- endif -%}

{% endmaterialization %}
