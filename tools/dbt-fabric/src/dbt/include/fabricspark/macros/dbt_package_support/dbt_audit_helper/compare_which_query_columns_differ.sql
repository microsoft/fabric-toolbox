{#- Override: audit_helper.default__compare_which_query_columns_differ
    (dbt-audit-helper 0.13.0, macros/compare_which_query_columns_differ.sql)

    Upstream uses CTEs named `a`, `b`, `calculated` and UNION ALL to unpivot.
    Spark fully qualifies CTE names when storing view text (e.g. `a` becomes
    `catalog.schema.a`), making the view unqueryable.

    Changes vs upstream:
    - CTEs replaced with inline subqueries to avoid Spark's CTE qualification
    - UNION ALL unpivot replaced with lateral view inline(array(named_struct(...)))
      for a single-pass unpivot that doesn't reference a CTE multiple times -#}
{% macro fabricspark__compare_which_query_columns_differ(a_query, b_query, primary_key_columns, columns, event_time) %}
    {% set columns = audit_helper._ensure_all_pks_are_in_column_set(primary_key_columns, columns) %}
    {% if event_time %}
        {% set event_time_props = audit_helper._get_comparison_bounds(event_time) %}
    {% endif %}

    {% set joined_cols = columns | join(", ") %}

    select column_name, has_difference
    from (
        select
            {% for column in columns %}
                {% set quoted_column = adapter.quote(column) %}
                {{ dbt.bool_or("("
                    ~ "dbt_ah_a." ~ quoted_column ~ " != dbt_ah_b." ~ quoted_column
                    ~ " or (dbt_ah_a." ~ quoted_column ~ " is null and dbt_ah_b." ~ quoted_column ~ " is not null)"
                    ~ " or (dbt_ah_a." ~ quoted_column ~ " is not null and dbt_ah_b." ~ quoted_column ~ " is null)"
                    ~ ")") }} as {{ column | lower }}_has_difference
                {%- if not loop.last %}, {% endif %}
            {% endfor %}
        {#- inline subqueries instead of CTEs `a` and `b` -#}
        from (
            select
                {{ joined_cols }},
                {{ audit_helper._generate_null_safe_surrogate_key(primary_key_columns) }} as dbt_audit_surrogate_key
            from ({{ a_query }}) as a_subq
            {{ audit_helper.event_time_filter(event_time_props) }}
        ) dbt_ah_a
        inner join (
            select
                {{ joined_cols }},
                {{ audit_helper._generate_null_safe_surrogate_key(primary_key_columns) }} as dbt_audit_surrogate_key
            from ({{ b_query }}) as b_subq
            {{ audit_helper.event_time_filter(event_time_props) }}
        ) dbt_ah_b
        on dbt_ah_a.dbt_audit_surrogate_key = dbt_ah_b.dbt_audit_surrogate_key
    ) dbt_ah_calculated
    {#- lateral view inline replaces upstream's UNION ALL over CTE `calculated` #}
    lateral view inline(array(
        {% for column in columns %}
            named_struct('column_name', '{{ column }}', 'has_difference', {{ column | lower }}_has_difference)
            {%- if not loop.last %}, {% endif %}
        {% endfor %}
    )) v as column_name, has_difference

{% endmacro %}
