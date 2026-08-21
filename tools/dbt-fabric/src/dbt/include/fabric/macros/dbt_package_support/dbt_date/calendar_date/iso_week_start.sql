{#- Override: uses DATEADD/DATEDIFF week arithmetic from day 0 instead of DATE_TRUNC('isoweek'). T-SQL lacks an ISO week truncation function, requiring manual calculation. -#}
{%- macro fabric__iso_week_start(date) -%}
    cast(dateadd(week, datediff(week, 0, dateadd(day, -1, {{date}})), 0) as date)
{%- endmacro %}
