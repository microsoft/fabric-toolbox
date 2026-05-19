{# spark__create_schema/drop_schema skip .without_identifier() because Spark has no schemas.
   Fabric Lakehouse does, so we restore the default dbt-adapters behavior. #}

{% macro fabricspark__create_schema(relation) -%}
  {%- call statement('create_schema') -%}
    create schema if not exists {{ relation.without_identifier() }}
  {% endcall %}
{% endmacro %}

{% macro fabricspark__drop_schema(relation) -%}
  {%- call statement('drop_schema') -%}
    drop schema if exists {{ relation.without_identifier() }} cascade
  {%- endcall -%}
{% endmacro %}
