{#- Override: uses FORMAT(date, 'ddd'/'dddd') instead of TO_CHAR(date, 'Dy'/'Day'). T-SQL requires FORMAT() for locale-aware date name formatting. -#}
{%- macro fabric__day_name(date, short, language="default") -%}
{%- if language == "default" -%}
    {%- set f = 'ddd' if short else 'dddd' -%}
    cast(format({{ date }}, '{{ f }}') as varchar(4000))
{%- else -%}
    {{ dbt_date.day_name_localized(date, short, language) }}
{%- endif -%}
{%- endmacro %}
