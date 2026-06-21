{#- New macro: dbt-date has no default__iso_year_week. T-SQL implementation using CONCAT + RIGHT for zero-padded ISO year-week. -#}
{%- macro fabric__iso_year_week(date) -%}
    case
        when {{ dbt_date.iso_week_of_year(date) }} = 1
        then
            concat(
                {{ dbt_date.date_part("year", dbt_date.iso_week_end(date)) }},
                '-W',
                right('0' + cast({{ dbt_date.iso_week_of_year(date) }} as varchar), 2)
            )
        else
            concat(
                {{ dbt_date.date_part("year", dbt_date.iso_week_start(date)) }},
                '-W',
                right('0' + cast({{ dbt_date.iso_week_of_year(date) }} as varchar), 2)
            )
    end
{%- endmacro -%}
