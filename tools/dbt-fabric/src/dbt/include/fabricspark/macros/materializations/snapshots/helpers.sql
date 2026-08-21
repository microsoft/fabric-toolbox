{% macro fabricspark__build_snapshot_staging_table(strategy, sql, target_relation) %}
    {% set tmp_identifier = target_relation.identifier ~ '__dbt_tmp' %}

    {%- set tmp_relation = api.Relation.create(
        identifier=tmp_identifier,
        schema=target_relation.schema,
        database=target_relation.database,
        workspace=target_relation.workspace,
        type='table'
    ) -%}

    {% set select = snapshot_staging_table(strategy, sql, target_relation) %}

    {{ adapter.drop_relation(tmp_relation) }}

    {% call statement('build_snapshot_staging_relation') %}
        {{ create_table_as(False, tmp_relation, select) }}
    {% endcall %}

    {% do return(tmp_relation) %}
{% endmacro %}


{% macro fabricspark__post_snapshot(staging_relation) %}
    {% do adapter.drop_relation(staging_relation) %}
{% endmacro %}


{% macro fabricspark__create_columns(relation, columns) %}
    {% if columns|length > 0 %}
    {% call statement() %}
      alter table {{ relation }} add columns (
        {% for column in columns %}
          `{{ column.name }}` {{ column.data_type }} {{- ',' if not loop.last -}}
        {% endfor %}
      );
    {% endcall %}
    {% endif %}
{% endmacro %}
