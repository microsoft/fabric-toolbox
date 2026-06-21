{%- macro fabric__measure_median(column_name, data_type, cte_name) -%}
{%- if dbt_profiler.is_numeric_dtype(data_type) and not dbt_profiler.is_struct_dtype(data_type) -%}
{# Upstream uses median(); T-SQL only has PERCENTILE_CONT as a window function, TOP 1 extracts scalar #}
(select top 1 percentile_cont(0.5) within group (order by {{ adapter.quote(column_name) }}) over () from {{ cte_name }})
{%- else -%}
cast(null as {{ dbt.type_numeric() }})
{%- endif -%}
{%- endmacro -%}

{%- macro fabric__measure_std_dev_population(column_name, data_type) -%}
{%- if dbt_profiler.is_numeric_dtype(data_type) and not dbt_profiler.is_struct_dtype(data_type) -%}
{# Upstream uses stddev_pop(); T-SQL equivalent is stdevp() #}
stdevp({{ adapter.quote(column_name) }})
{%- else -%}
cast(null as {{ dbt.type_numeric() }})
{%- endif -%}
{%- endmacro -%}

{%- macro fabric__measure_std_dev_sample(column_name, data_type) -%}
{%- if dbt_profiler.is_numeric_dtype(data_type) and not dbt_profiler.is_struct_dtype(data_type) -%}
{# Upstream uses stddev_samp(); T-SQL equivalent is stdev() #}
stdev({{ adapter.quote(column_name) }})
{%- else -%}
cast(null as {{ dbt.type_numeric() }})
{%- endif -%}
{%- endmacro -%}

{%- macro fabric__measure_is_unique(column_name, data_type) -%}
{%- if not dbt_profiler.is_struct_dtype(data_type) -%}
{# Upstream returns boolean true/false; T-SQL has no boolean type, use strings to match package expectations #}
case when cast(count(*) as {{ dbt.type_bigint() }}) > 0 then
        case when count(distinct {{ adapter.quote(column_name) }}) = count(*) then 'TRUE' else 'FALSE' end
    else null
    end
{%- else -%}
null
{%- endif -%}
{%- endmacro -%}

{%- macro fabric__measure_avg(column_name, data_type) -%}
{%- if dbt_profiler.is_numeric_dtype(data_type) and not dbt_profiler.is_struct_dtype(data_type) -%}
avg({{ adapter.quote(column_name) }})
{%- elif dbt_profiler.is_logical_dtype(data_type) -%}
{# Upstream uses avg(col) directly; T-SQL AVG rejects bit columns, cast via CASE preserving NULLs #}
avg(case when {{ adapter.quote(column_name) }} = 1 then 1 when {{ adapter.quote(column_name) }} = 0 then 0 else null end)
{%- else -%}
cast(null as {{ dbt.type_numeric() }})
{%- endif -%}
{%- endmacro -%}
