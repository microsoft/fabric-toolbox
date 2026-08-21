{#- T-SQL has no boolean type. Upstream compares `= true`; we use `CASE WHEN ... THEN 1` and compare `= 1`. #}
{% macro fabric__expression_is_true(model, expression, test_condition, group_by_columns, row_condition) %}

{% if test_condition == "= true" %}
  {% set test_condition = "= 1" %}
{% endif %}


with grouped_expression as (

    select
        {% if group_by_columns %}
        {% for group_by_column in group_by_columns -%}
        {{ group_by_column }} as col_{{ loop.index }},
        {% endfor -%}
        {% endif %}
        case when {{ expression }} then 1 else 0 end as expression
    from {{ model }}
     {%- if row_condition %}
    where
        {{ row_condition }}
    {% endif %}
    {% if group_by_columns %}
    group by
    {% for group_by_column in group_by_columns -%}
        {{ group_by_column }}{% if not loop.last %},{% endif %}
    {% endfor %}
    {% endif %}

),
validation_errors as (

    select
        *
    from
        grouped_expression
    where
        not(expression {{ test_condition }})

)

select *
from validation_errors

{% endmacro %}
