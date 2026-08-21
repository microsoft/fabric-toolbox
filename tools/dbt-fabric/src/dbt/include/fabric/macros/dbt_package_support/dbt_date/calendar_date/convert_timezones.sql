{#- Override: uses CAST(expr AT TIME ZONE 'src' AT TIME ZONE 'tgt') instead of CONVERT_TIMEZONE(). T-SQL requires the AT TIME ZONE operator for timezone conversions. -#}
{% macro fabric__convert_timezone(column, target_tz, source_tz) -%}
    CAST(CAST({{ column }} as {{ dbt.type_timestamp() }}) AT TIME ZONE '{{ source_tz }}' AT TIME ZONE '{{ target_tz }}' AS {{ dbt.type_timestamp() }})
{%- endmacro -%}
