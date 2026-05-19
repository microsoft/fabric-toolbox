{#- Override: uses DATEADD from epoch '1970-01-01' instead of TO_TIMESTAMP()/FROM_UNIXTIME(). T-SQL requires DATEADD with explicit scale units (s/ms/mcs/ns) to convert Unix timestamps. -#}
{%- macro fabric__from_unixtimestamp(epochs, format) -%}
    
    {%- if format == "seconds" -%}
    {%- set scale = "S" -%}
    {%- elif format == "milliseconds" -%}
    {%- set scale = "ms" -%}
    {%- elif format == "microseconds" -%}
    {%- set scale = "mcs" -%}
    {%- elif format == "nanoseconds" -%}
    {%- set scale = "ns" -%}
    {%- else -%}
    {{ exceptions.raise_compiler_error(
        "value " ~ format ~ " for `format` for from_unixtimestamp is not supported."
        ) 
    }}
    {% endif -%}

    {%- if format == "nanoseconds" -%}
        dateadd(ns, {{ epochs }} % 1000000000, dateadd(s,{{ epochs }} / 1000000000,cast('1970-01-01' as datetime2(7))) )
    {%- else -%}
        dateadd({{ scale }}, {{ epochs }}, '1970-01-01')
    {% endif -%}

{%- endmacro %}
