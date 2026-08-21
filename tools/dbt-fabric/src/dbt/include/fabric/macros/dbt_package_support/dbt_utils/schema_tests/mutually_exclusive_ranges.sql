{#- Override: uses CASE WHEN for boolean checks and integer flags (1/0) instead of true/false.
    T-SQL has no native boolean type; conditional logic must use integer expressions. -#}
{% macro fabric__test_mutually_exclusive_ranges(model, lower_bound_column, upper_bound_column, partition_by=None, gaps='allowed', zero_length_range_allowed=False) %}

{% if gaps == 'not_allowed' %}
    {% set allow_gaps_operator='=' %}
{% elif gaps == 'allowed' %}
    {% set allow_gaps_operator='<=' %}
{% elif gaps == 'required' %}
    {% set allow_gaps_operator='<' %}
{% else %}
    {{ exceptions.raise_compiler_error(
        "`gaps` argument for mutually_exclusive_ranges test must be one of ['not_allowed', 'allowed', 'required'] Got: '" ~ gaps ~"'.'"
    ) }}
{% endif %}

{% if not zero_length_range_allowed %}
    {% set allow_zero_length_operator='<' %}
{% elif zero_length_range_allowed %}
    {% set allow_zero_length_operator='<=' %}
{% else %}
    {{ exceptions.raise_compiler_error(
        "`zero_length_range_allowed` argument for mutually_exclusive_ranges test must be one of [true, false] Got: '" ~ zero_length_range_allowed ~"'.'"
    ) }}
{% endif %}

{% set partition_clause="partition by " ~ partition_by if partition_by else '' %}

with window_functions as (

    select
        {% if partition_by %}
        {{ partition_by }},
        {% endif %}
        {{ lower_bound_column }} as lower_bound,
        {{ upper_bound_column }} as upper_bound,

        lead({{ lower_bound_column }}) over (
            {{ partition_clause }}
            order by {{ lower_bound_column }}, {{ upper_bound_column }}
        ) as next_lower_bound,

        case when
            row_number() over (
                {{ partition_clause }}
                order by {{ lower_bound_column }} desc, {{ upper_bound_column }} desc
            ) = 1
        then 1 else 0 end as is_last_record
    from {{ model }}

),

calc as (

    select
        *,

        case
            when lower_bound is null or upper_bound is null then 0
            when lower_bound {{ allow_zero_length_operator }} upper_bound then 1
            else 0
        end as lower_bound_check,

        case
            when next_lower_bound is not null and upper_bound {{ allow_gaps_operator }} next_lower_bound then 1
            when next_lower_bound is null and is_last_record = 1 then 1
            else 0
        end as upper_bound_check

    from window_functions

),

validation_errors as (

    select
        *
    from calc

    where not(
        lower_bound_check = 1
        and upper_bound_check = 1
    )
)

select *
from validation_errors
{% endmacro %}
