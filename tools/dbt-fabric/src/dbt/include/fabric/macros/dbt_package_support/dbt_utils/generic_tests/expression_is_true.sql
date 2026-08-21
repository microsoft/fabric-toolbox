{#- Upstream default: condition='true'. T-SQL has no boolean type. -#}
{% macro fabric__test_expression_is_true(model, expression, column_name=none, condition='1=1') %}

{% set column_list = '*' if should_store_failures() else "1 as col" %}

select
    {{ column_list }}
from {{ model }}
{% if condition and condition is not none %}
where {{ condition }}
and (
{%- else %}
where (
{%- endif %}
{% if column_name is none %}
    not({{ expression }})
{%- else %}
    not({{ column_name }} {{ expression }})
{%- endif %}
)

{% endmacro %}
