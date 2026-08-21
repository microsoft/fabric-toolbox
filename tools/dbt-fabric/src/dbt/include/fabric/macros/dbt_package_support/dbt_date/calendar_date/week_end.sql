{#- Override: computes week_end as week_start + 6 days instead of DATE_TRUNC('week') + interval '6 days'. T-SQL lacks interval arithmetic, so this delegates to week_start and n_days_away. -#}
{%- macro fabric__week_end(date) -%}
{%- set dt = dbt_date.week_start(date) -%}
{{ dbt_date.n_days_away(6, dt) }}
{%- endmacro %}
