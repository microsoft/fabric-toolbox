{#- Override: uses DATEADD/DATE_TRUNC with day offset instead of DATE_TRUNC('week'). T-SQL's week truncation is Monday-based, so a -1/+1 day shift is needed for Sunday-start weeks. -#}
{%- macro fabric__week_start(date) -%}
-- Sunday as week start date
cast({{ dbt.dateadd('day', -1, dbt.date_trunc('week', dbt.dateadd('day', 1, date))) }} as date)
{%- endmacro %}
