{% macro fabricspark__refresh_materialized_view(relation) %}
    refresh materialized lake view {{ relation }}
{% endmacro %}