{% macro fabricspark__string_literal(value) -%}
    '{{ value }}'
{%- endmacro %}

{#- Override: dbt-spark spark__escape_single_quotes (escape_single_quotes.sql)
    uses backslash escaping (\'), but Fabric Lakehouse has
    escapedStringLiterals=false so backslash is a literal character.
    Reverts to the dbt-adapters default__escape_single_quotes behavior:
    SQL-standard doubled quotes (''). -#}
{% macro fabricspark__escape_single_quotes(expression) -%}
{{ expression | replace("'","''") }}
{%- endmacro %}
