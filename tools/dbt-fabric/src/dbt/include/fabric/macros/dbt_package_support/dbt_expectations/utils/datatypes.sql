{#- T-SQL's `timestamp` is a synonym for `rowversion` (binary, not a date/time type).
    Both type_timestamp() and type_datetime() map to datetime2(6). #}
{% macro fabric__type_timestamp() -%}
    datetime2(6)
{%- endmacro %}

{% macro fabric__type_datetime() -%}
    datetime2(6)
{%- endmacro %}
