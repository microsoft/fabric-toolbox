{#- Override: audit_helper.default__quick_are_queries_identical
    (dbt-audit-helper 0.13.0, macros/quick_are_queries_identical.sql)

    The default raises a compiler error for unknown adapters. This
    implements a Spark version modeled after the Snowflake variant:
    - hash_agg() replaced with bit_xor(xxhash64()) (Spark equivalents)
    - No CTEs to avoid Spark's view text qualification issue -#}
{% macro fabricspark__quick_are_queries_identical(query_a, query_b, columns, event_time) %}
    {% set joined_cols = columns | join(", ") %}
    {% if event_time %}
        {% set event_time_props = audit_helper._get_comparison_bounds(event_time) %}
    {% endif %}

    select count(distinct hash_result) = 1 as are_tables_identical
    from (
        select bit_xor(xxhash64({{ joined_cols }})) as hash_result
        from ({{ query_a }}) query_a_subq
        {{ audit_helper.event_time_filter(event_time_props) }}

        union all

        select bit_xor(xxhash64({{ joined_cols }})) as hash_result
        from ({{ query_b }}) query_b_subq
        {{ audit_helper.event_time_filter(event_time_props) }}
    ) as hashes
{% endmacro %}
