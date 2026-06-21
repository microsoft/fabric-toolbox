{#- Override: uses FORMAT(date, 'MMM'/'MMMM') instead of TO_CHAR(date, 'Mon'/'Month'). T-SQL requires FORMAT() for locale-aware month name formatting. -#}
{%- macro fabric__month_name(date, short, language="default") -%}
{%- if language == "default" -%}
    {%- set f = 'MMM' if short else 'MMMM' -%}
    cast(format({{ date }}, '{{ f }}') as varchar(4000))
{%- else -%}
    {{ dbt_date.month_name_localized(date, short, language) }}
{%- endif -%}
{%- endmacro %}
