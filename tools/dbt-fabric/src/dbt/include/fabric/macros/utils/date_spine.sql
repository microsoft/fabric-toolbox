{% macro fabric__get_intervals_between(start_date, end_date, datepart) -%}
    {%- call statement('get_intervals_between', fetch_result=True) %}

        select {{ dbt.datediff(start_date, end_date, datepart) }} as diff

    {%- endcall -%}

    {%- set value_list = load_result('get_intervals_between') -%}

    {%- if value_list and value_list['data'] -%}
        {%- set values = value_list['data'] | map(attribute=0) | list %}
        {{ return(values[0]) }}
    {%- else -%}
        {{ return(1) }}
    {%- endif -%}

{%- endmacro %}

{% macro fabric__date_spine(datepart, start_date, end_date) %}
    
    select *
    from (
        select (
            {{
                dbt.dateadd(
                    datepart,
                    "row_number() over (order by generated_number) - 1",
                    start_date
                )
            }}
        ) as date_{{datepart}}
        from ({{  
                dbt.generate_series(
                    dbt.get_intervals_between(start_date, end_date, datepart)
                )
            }}) raw_data
    ) all_periods
    where date_{{datepart}} <= {{ end_date }}

{% endmacro %}