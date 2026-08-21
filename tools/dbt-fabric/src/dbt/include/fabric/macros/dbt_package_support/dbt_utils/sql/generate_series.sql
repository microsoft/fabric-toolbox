{#- Override: uses T-SQL's native generate_series() TVF instead of recursive CTE.
    T-SQL (Fabric) supports generate_series() as a table-valued function returning 'value'. -#}
{% macro fabric__generate_series(upper_bound) %}
    select value as generated_number
    from generate_series(1, {{ upper_bound }})
{% endmacro %}
