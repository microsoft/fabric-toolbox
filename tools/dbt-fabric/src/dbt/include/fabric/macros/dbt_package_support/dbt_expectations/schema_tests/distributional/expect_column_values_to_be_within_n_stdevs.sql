{#- Upstream uses STDDEV(). T-SQL spells it STDEV(). #}
{% macro fabric__test_expect_column_values_to_be_within_n_stdevs(model,
                                  column_name,
                                  group_by,
                                  sigma_threshold
                                ) %}
with metric_values as (

    {% if group_by -%}
    select
        {{ group_by }} as metric_date,
        sum({{ column_name }}) as {{ column_name }}
    from
        {{ model }}
    group by
        {{ group_by }}
    {%- else -%}
    select
        {{ column_name }} as {{ column_name }}
    from
        {{ model }}
    {%- endif %}

),
metric_values_with_statistics as (

    select
        *,
        avg({{ column_name }}) over() as {{ column_name }}_average,
        stdev({{ column_name }}) over() as {{ column_name }}_stddev
    from
        metric_values

),
metric_values_z_scores as (

    select
        *,
        ({{ column_name }} - {{ column_name }}_average)/{{ column_name }}_stddev as {{ column_name }}_sigma
    from
        metric_values_with_statistics

)
select
    count(*) as error_count
from
    metric_values_z_scores
where
    abs({{ column_name }}_sigma) > {{ sigma_threshold }}
{%- endmacro %}
