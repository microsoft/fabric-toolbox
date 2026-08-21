{% macro information_schema_hints() %}
    {{ return(adapter.dispatch('information_schema_hints')()) }}
{% endmacro %}

{% macro default__information_schema_hints() %}{% endmacro %}
{% macro fabric__information_schema_hints() %}{% endmacro %}

{% macro fabric__information_schema_name(database) -%}
  information_schema
{%- endmacro %}

{% macro get_use_database_sql(database) %}
    {{ return(adapter.dispatch('get_use_database_sql', 'dbt')(database)) }}
{% endmacro %}

{%- macro fabric__get_use_database_sql(database) -%}
  {%- if database is not none -%}
    USE [{{database | replace('[', '') | replace(']', '') | replace('"', '')}}];
  {%- endif -%}
{%- endmacro -%}

{% macro fabric__list_schemas(database) %}
  {% call statement('list_schemas', fetch_result=True, auto_begin=False) -%}
    {{ get_use_database_sql(database) }}
    select  name as [schema]
    from sys.schemas {{ information_schema_hints() }}
  {% endcall %}
  {{ return(load_result('list_schemas').table) }}
{% endmacro %}

{% macro fabric__check_schema_exists(information_schema, schema) -%}
  {% call statement('check_schema_exists', fetch_result=True, auto_begin=False) -%}
    SELECT count(*) as schema_exist FROM sys.schemas WHERE name = '{{ schema }}'
  {%- endcall %}
  {{ return(load_result('check_schema_exists').table) }}
{% endmacro %}

{% macro fabric__list_relations_without_caching(schema_relation) -%}
  {% call statement('list_relations_without_caching', fetch_result=True) -%}
    {{ get_use_database_sql(schema_relation.database) }}
    with base as (
      select
          DB_NAME() as [database],
          t.name as [name],
          SCHEMA_NAME(t.schema_id) as [schema],
          'table' as table_type
      from sys.tables as t {{ information_schema_hints() }}
      where SCHEMA_NAME(t.schema_id) like '{{ schema_relation.schema }}'
      union all
      select
          DB_NAME() as [database],
          v.name as [name],
          SCHEMA_NAME(v.schema_id) as [schema],
          'view' as table_type
      from sys.views as v {{ information_schema_hints() }}
      where SCHEMA_NAME(v.schema_id) like '{{ schema_relation.schema }}'
      union all
      select
          DB_NAME() as [database],
          f.name as [name],
          SCHEMA_NAME(f.schema_id) as [schema],
          'function' as table_type
      from sys.objects as f {{ information_schema_hints() }}
      where f.type_desc like '%function%'
        and SCHEMA_NAME(f.schema_id) like '{{ schema_relation.schema }}'
    )
    select * from base
  {% endcall %}
  {{ return(load_result('list_relations_without_caching').table) }}
{% endmacro %}

{% macro fabric__list_function_relations_without_caching(schema_relation) %}
  {% call statement('list_function_relations_without_caching', fetch_result=True) %}
    {{ get_use_database_sql(schema_relation.database) }}
    select
        DB_NAME() as [database],
        f.name as [name],
        SCHEMA_NAME(f.schema_id) as [schema],
        'function' as table_type
    from sys.objects as f {{ information_schema_hints() }}
    where f.type_desc like '%function%'
      and SCHEMA_NAME(f.schema_id) like '{{ schema_relation.schema }}'
  {% endcall %}
  {{ return(load_result('list_function_relations_without_caching').table) }}
{% endmacro %}

{% macro fabric__get_relation_last_modified(information_schema, relations) -%}
  {%- call statement('last_modified', fetch_result=True) -%}
        {{ get_use_database_sql(information_schema.database) }}
        select
            o.name as [identifier]
            , s.name as [schema]
            , CAST(o.modify_date AS datetime2(6)) as last_modified
            , current_timestamp as snapshotted_at
        from sys.objects o
        inner join sys.schemas s on o.schema_id = s.schema_id and [type] = 'U'
        where (
            {%- for relation in relations -%}
            (upper(s.name) = upper('{{ relation.schema }}') and
                upper(o.name) = upper('{{ relation.identifier }}')){%- if not loop.last %} or {% endif -%}
            {%- endfor -%}
        )
  {%- endcall -%}
  {{ return(load_result('last_modified')) }}

{% endmacro %}
