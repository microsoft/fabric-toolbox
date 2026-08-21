{% macro fabric__can_clone_table() %}
    {{ return(True) }}
{% endmacro %}

{% macro fabric__create_or_replace_clone(target_relation, defer_relation) %}
    {{ get_drop_sql(target_relation) }}
    CREATE TABLE {{target_relation}}
    AS CLONE OF {{defer_relation}}
{% endmacro %}
