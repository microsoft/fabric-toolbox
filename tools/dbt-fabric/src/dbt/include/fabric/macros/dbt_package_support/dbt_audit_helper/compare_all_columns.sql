{#- T-SQL does not support positional GROUP BY or ORDER BY inside CTEs.
    Boolean columns from compare_column_values_verbose are 0/1 integers,
    so sum() works directly without CASE WHEN wrappers. -#}
{% macro fabric__compare_all_columns(a_relation, b_relation, primary_key, exclude_columns=[], summarize=true) -%}

  {% set column_names = dbt_utils.get_filtered_columns_in_relation(from=a_relation, except=exclude_columns) %}

  {% set a_query %}
    select
      *,
      {{ primary_key }} as dbt_audit_helper_pk
    from {{ a_relation }}
  {% endset %}

  {% set b_query %}
    select
      *,
      {{ primary_key }} as dbt_audit_helper_pk
    from {{ b_relation }}
  {% endset %}

  {% for column_name in column_names %}

    {% set audit_query = audit_helper.compare_column_values_verbose(
      a_query=a_query,
      b_query=b_query,
      primary_key="dbt_audit_helper_pk",
      column_to_compare=column_name
    ) %}

    {% if loop.first %}
      with main as (
    {% endif %}

    ( {{ audit_query }} )

    {% if not loop.last %}
      union all
    {% else %}
    ),

      {%- if summarize %}

        final as (
          select
            upper(column_name) as column_name,
            sum(perfect_match) as perfect_match,
            sum(null_in_a) as null_in_a,
            sum(null_in_b) as null_in_b,
            sum(missing_from_a) as missing_from_a,
            sum(missing_from_b) as missing_from_b,
            sum(conflicting_values) as conflicting_values
          from main
          group by upper(column_name)
        )

      {%- else %}

        final as (
          select
            primary_key,
            upper(column_name) as column_name,
            perfect_match,
            null_in_a,
            null_in_b,
            missing_from_a,
            missing_from_b,
            conflicting_values
          from main
        )

      {%- endif %}

      select * from final

    {% endif %}

  {% endfor %}

{% endmacro %}
