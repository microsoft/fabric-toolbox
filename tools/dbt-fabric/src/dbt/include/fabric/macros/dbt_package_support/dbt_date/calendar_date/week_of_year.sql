{#- Override: uses DATEPART(week, date) instead of EXTRACT(week FROM date). T-SQL requires the DATEPART function for week number extraction. -#}
{%- macro fabric__week_of_year(date) -%}
cast({{ dbt_date.date_part('week', date)}} as {{ dbt.type_int() }})
{%- endmacro %}
