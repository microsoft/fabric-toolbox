{#- Override: uses Jinja's modules.datetime.date() at compile time instead of SQL-level date construction. T-SQL requires this approach because it lacks a simple DATE(y,m,d) constructor function. -#}
{%- macro fabric__date(year, month, day) -%}
    {{- return(modules.datetime.date(year, month, day)) -}}
{%- endmacro -%}
