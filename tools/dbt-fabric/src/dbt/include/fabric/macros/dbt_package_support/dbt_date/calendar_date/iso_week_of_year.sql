{#- Override: uses DATEPART(iso_week, date) instead of EXTRACT(isoweek FROM date). T-SQL requires the iso_week datepart keyword. -#}
{%- macro fabric__iso_week_of_year(date) -%}
cast({{ dbt_date.date_part('iso_week', date) }} as {{ dbt.type_int() }}) 
{%- endmacro %}
