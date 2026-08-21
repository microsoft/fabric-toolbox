{% macro fabricspark__get_materialized_view_configuration_changes(existing_relation, new_config) %}
    {# Retrieve the current CREATE statement #}
    {% call statement('show_create', fetch_result=True) %}
        SHOW CREATE MATERIALIZED LAKE VIEW {{ existing_relation }}
    {% endcall %}
    {% set current_create_sql = load_result('show_create')['data'][0][0] | trim %}

    {# Generate the desired CREATE statement #}
    {% set desired_create_sql = get_create_materialized_view_as_sql(existing_relation, sql) | trim %}

    {{ return(current_create_sql != desired_create_sql) }}
{% endmacro %}