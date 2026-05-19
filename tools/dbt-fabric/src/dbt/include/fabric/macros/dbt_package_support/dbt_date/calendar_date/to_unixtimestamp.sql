{#- Override: uses DATEDIFF(s, '1970-01-01', timestamp) instead of EXTRACT(epoch FROM timestamp). T-SQL requires DATEDIFF to compute seconds since Unix epoch. -#}
{%- macro fabric__to_unixtimestamp(timestamp) -%}
    DATEDIFF(s, '1970-01-01 00:00:00', {{ timestamp }})
{%- endmacro %}