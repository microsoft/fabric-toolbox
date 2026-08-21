{% macro create_or_update_statistics(relation, existing_table=false) %}
    {{ return(adapter.dispatch('create_or_update_statistics', 'dbt')(relation, existing_table)) }}
{% endmacro %}

{% macro default__create_or_update_statistics(relation, existing_table=false) %}
{% endmacro %}

{% macro fabric__create_or_update_statistics(relation, existing_table=false) %}
    {%- set statistics = config.get('statistics') -%}
    {%- if statistics is none or statistics is false -%}
        {{ return('') }}
    {%- endif -%}

    {%- set statistics_sample_percent = config.get('statistics_sample_percent') -%}

    {%- if statistics is true -%}
        {%- set columns = adapter.get_columns_in_relation(relation) -%}
        {%- set column_names = columns | map(attribute='name') | list -%}
    {%- elif statistics is string -%}
        {%- set column_names = [statistics] -%}
    {%- else -%}
        {%- set column_names = statistics -%}
    {%- endif -%}

    {%- if statistics_sample_percent is not none -%}
        {%- if statistics_sample_percent is not number or statistics_sample_percent < 1 or statistics_sample_percent > 100 -%}
            {% do exceptions.raise_compiler_error("statistics_sample_percent must be a number between 1 and 100, got: " ~ statistics_sample_percent) %}
        {%- endif -%}
        {%- set with_clause = "WITH SAMPLE " ~ statistics_sample_percent | int ~ " PERCENT" -%}
    {%- else -%}
        {%- set with_clause = "WITH FULLSCAN" -%}
    {%- endif -%}

    {%- set relation_fqn = relation.render() -%}
    {%- set relation_fqn_escaped = relation_fqn | replace("'", "''") -%}

    {%- for col in column_names -%}
        {%- set stats_name = 'dbt_stats__' ~ local_md5(relation.identifier ~ '__' ~ col) -%}
        {%- set stats_name_escaped = stats_name | replace("'", "''") -%}
        {%- set quoted_stats_name = '[' ~ stats_name | replace(']', ']]') ~ ']' -%}
        {%- set quoted_col = '[' ~ col | replace(']', ']]') ~ ']' -%}

        {% call statement('create_or_update_statistics_' ~ loop.index) %}
            {%- if existing_table %}
            IF EXISTS (
                SELECT 1 FROM sys.stats
                WHERE name = N'{{ stats_name_escaped }}'
                AND object_id = OBJECT_ID(N'{{ relation_fqn_escaped }}')
            )
                UPDATE STATISTICS {{ relation_fqn }} {{ quoted_stats_name }} {{ with_clause }}
            ELSE
            {%- endif %}
                CREATE STATISTICS {{ quoted_stats_name }}
                ON {{ relation_fqn }} ({{ quoted_col }}) {{ with_clause }}
        {% endcall %}
    {%- endfor -%}
{% endmacro %}
