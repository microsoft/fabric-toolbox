{% macro fabric__bool_or(expression) -%}
    MAX(
        CASE
            WHEN {{ expression }} THEN 1
            ELSE 0
        END
    )
{%- endmacro %}
