{% macro fabric__array_construct(inputs, data_type) -%}
    {% set as_json = data_type|lower == "json" %}
    JSON_ARRAY({{ (inputs|join(', ') if inputs|length > 0 else 'NULL') ~ (' RETURNING JSON' if as_json else '') }})
{%- endmacro %}