{% macro fabric__test_equal_rowcount(model, compare_model, group_by_columns = []) %}

{{ config(fail_calc = 'sum(coalesce(diff_count, 0))') }}

{%- if not execute -%}
    {{ return('') }}
{% endif %}

{% if group_by_columns|length() > 0 %}
  {% set select_gb_cols = group_by_columns|join(', ') + ', ' %}
  {% set join_gb_cols %}
    {% for c in group_by_columns %}
      and a.{{c}} = b.{{c}}
    {% endfor %}
  {% endset %}
  {% set groupby_gb_cols = 'group by ' + group_by_columns|join(',') %}
{% endif %}

with a as (

    select
      {{ select_gb_cols }}
      {#- Synthetic join key: T-SQL FULL JOIN requires an explicit ON clause (upstream uses subqueries) -#}
      1 as id_dbtutils_test_equal_rowcount,
      count(*) as count_a
    from {{ model }}
    {{ groupby_gb_cols }}

),
b as (

    select
      {{ select_gb_cols }}
      1 as id_dbtutils_test_equal_rowcount,
      count(*) as count_b
    from {{ compare_model }}
    {{ groupby_gb_cols }}

),
final as (

    select

        {% for c in group_by_columns -%}
          a.{{c}} as {{c}}_a,
          b.{{c}} as {{c}}_b,
        {% endfor %}

        coalesce(count_a, 0) as count_a,
        coalesce(count_b, 0) as count_b,
        abs(coalesce(count_a, 0) - coalesce(count_b, 0)) as diff_count

    from a
    full join b
    on a.id_dbtutils_test_equal_rowcount = b.id_dbtutils_test_equal_rowcount
    {{ join_gb_cols }}

)

select * from final

{% endmacro %}
