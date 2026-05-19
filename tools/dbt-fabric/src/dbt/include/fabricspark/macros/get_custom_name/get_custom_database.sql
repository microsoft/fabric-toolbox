{% macro fabricspark__generate_database_name(custom_database_name=none, node=none) -%}
    {% do return(default__generate_database_name(custom_database_name, node)) %}
{%- endmacro %}