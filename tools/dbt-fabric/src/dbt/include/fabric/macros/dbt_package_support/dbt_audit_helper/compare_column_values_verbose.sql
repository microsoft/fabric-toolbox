{#- T-SQL has no boolean column type. Bare boolean expressions like
    `a.col = b.col and a.pk is not null` and `coalesce(..., false)` are
    replaced with CASE WHEN → 0/1 integers.
    Uses inline subqueries instead of CTEs so the output can be nested
    inside UNION ALL (as compare_all_columns does). -#}
{% macro fabric__compare_column_values_verbose(a_query, b_query, primary_key, column_to_compare) -%}
    select
        coalesce(a_query.{{ primary_key }}, b_query.{{ primary_key }}) as primary_key,
        '{{ column_to_compare }}' as column_name,
        case
            when a_query.{{ column_to_compare }} = b_query.{{ column_to_compare }}
                and a_query.{{ primary_key }} is not null
                and b_query.{{ primary_key }} is not null then 1
            when a_query.{{ column_to_compare }} is null
                and b_query.{{ column_to_compare }} is null
                and a_query.{{ primary_key }} is not null
                and b_query.{{ primary_key }} is not null then 1
            else 0
        end as perfect_match,
        case
            when a_query.{{ column_to_compare }} is null
                and a_query.{{ primary_key }} is not null then 1
            else 0
        end as null_in_a,
        case
            when b_query.{{ column_to_compare }} is null
                and b_query.{{ primary_key }} is not null then 1
            else 0
        end as null_in_b,
        case when a_query.{{ primary_key }} is null then 1 else 0 end as missing_from_a,
        case when b_query.{{ primary_key }} is null then 1 else 0 end as missing_from_b,
        case
            when a_query.{{ primary_key }} is not null
                and b_query.{{ primary_key }} is not null
                and (
                    a_query.{{ column_to_compare }} != b_query.{{ column_to_compare }}
                    or (a_query.{{ column_to_compare }} is not null and b_query.{{ column_to_compare }} is null)
                    or (a_query.{{ column_to_compare }} is null and b_query.{{ column_to_compare }} is not null)
                ) then 1
            else 0
        end as conflicting_values

    from ({{ a_query }}) a_query

    full outer join ({{ b_query }}) b_query on (a_query.{{ primary_key }} = b_query.{{ primary_key }})

{% endmacro %}
