{#- Override: uses DATEPART(part, date) instead of EXTRACT(part FROM date). T-SQL requires the DATEPART function syntax. -#}
{% macro fabric__date_part(datepart, date) -%}
    datepart({{ datepart }}, {{ date }})
{%- endmacro %}
