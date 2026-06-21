{#-
Overrides: dbt_date.default__get_fiscal_periods (godatadriven/dbt-date >= 0.18.0)
What differs:
  1. Upstream calls dbt_date.get_fiscal_year_dates(...) which produces a nested
     CTE. Fabric doesn't allow nested CTEs in CREATE VIEW, so we inline it.
  2. Upstream uses positional GROUP BY (1, 2) and ORDER BY (1, 2). T-SQL does
     not support either, so we use explicit column references and drop the
     trailing ORDER BY (Fabric views/subqueries can't ORDER BY anyway).
  3. Upstream uses mod(x, 13). T-SQL uses the % operator.
Why: works around T-SQL dialect limitations vs the default implementation.
Once these limitations are lifted, this whole override can be removed.
-#}
{% macro fabric__get_fiscal_periods(dates, year_end_month, week_start_day, shift_year=1) %}
{#
This macro requires you to pass in a ref to a date dimension, created via
dbt_date.get_date_dimension()s
#}

{#- Inlined dbt_date.get_fiscal_year_dates below to avoid nested CTEs in CREATE VIEW. #}
-- this gets all the dates within a fiscal year
-- determined by the given year-end-month
-- ending on the saturday closest to that month's end date
with fsc_date_dimension as (
    select * from {{ dates }}
),
year_month_end as (

    select
       d.year_number - {{ shift_year }} as fiscal_year_number,
       d.month_end_date
    from
        fsc_date_dimension d
    where
        d.month_of_year = {{ year_end_month }}
    {#- Upstream uses GROUP BY 1,2. T-SQL doesn't support positional GROUP BY. #}
    group by
        d.year_number - {{ shift_year }},
        d.month_end_date

),
weeks as (

    select
        d.year_number,
        d.month_of_year,
        d.date_day as week_start_date,
        cast({{ dbt.dateadd('day', 6, 'd.date_day') }} as date) as week_end_date
    from
        fsc_date_dimension d
    where
        d.day_of_week = {{ week_start_day }}

),
-- get all the weeks that start in the month the year ends
year_week_ends as (

    select
        d.year_number - {{ shift_year }} as fiscal_year_number,
        d.week_end_date
    from
        weeks d
    where
        d.month_of_year = {{ year_end_month }}
    group by
        d.year_number - {{ shift_year }},
        d.week_end_date

),
-- then calculate which Saturday is closest to month end
weeks_at_month_end as (

    select
        d.fiscal_year_number,
        d.week_end_date,
        m.month_end_date,
        rank() over
            (partition by d.fiscal_year_number
                order by
                abs({{ dbt.datediff('d.week_end_date', 'm.month_end_date', 'day') }})

            ) as closest_to_month_end
    from
        year_week_ends d
        join
        year_month_end m on d.fiscal_year_number = m.fiscal_year_number
),
fiscal_year_range as (

    select
        w.fiscal_year_number,
        cast(
            {{ dbt.dateadd('day', 1,
            'lag(w.week_end_date) over(order by w.week_end_date)') }}
            as date) as fiscal_year_start_date,
        w.week_end_date as fiscal_year_end_date
    from
        weeks_at_month_end w
    where
        w.closest_to_month_end = 1

),
fscl_year_dates_for_periods as (

    select
        d.date_day,
        m.fiscal_year_number,
        m.fiscal_year_start_date,
        m.fiscal_year_end_date,
        w.week_start_date,
        w.week_end_date,
        -- we reset the weeks of the year starting with the merch year start date
        dense_rank()
            over(
                partition by m.fiscal_year_number
                order by w.week_start_date
                ) as fiscal_week_of_year
    from
        fsc_date_dimension d
        join
        fiscal_year_range m on d.date_day between m.fiscal_year_start_date and m.fiscal_year_end_date
        join
        weeks w on d.date_day between w.week_start_date and w.week_end_date

),
{#- end of inlined get_fiscal_year_dates #}

fscl_year_w13 as (

    select
        f.*,
        -- We count the weeks in a 13 week period
        -- and separate the 4-5-4 week sequences
        {#- Upstream uses mod(..., 13). T-SQL uses % operator. #}
        cast(
            (f.fiscal_week_of_year-1) as {{ dbt.type_int() }}
            ) % 13 as w13_number,
        -- Chop weeks into 13 week merch quarters
        cast(
            least(
                floor((f.fiscal_week_of_year-1)/13.0)
                , 3)
            as {{ dbt.type_int() }}) as quarter_number
    from
        fscl_year_dates_for_periods f

),
fscl_periods as (

    select
        f.date_day,
        f.fiscal_year_number,
        f.week_start_date,
        f.week_end_date,
        f.fiscal_week_of_year,
        case
            -- we move week 53 into the 3rd period of the quarter
            when f.fiscal_week_of_year = 53 then 3
            when f.w13_number between 0 and 3 then 1
            when f.w13_number between 4 and 8 then 2
            when f.w13_number between 9 and 12 then 3
        end as period_of_quarter,
        f.quarter_number
    from
        fscl_year_w13 f

),
fscl_periods_quarters as (

    select
        f.*,
        cast((
            (f.quarter_number * 3) + f.period_of_quarter
         ) as {{ dbt.type_int() }}) as fiscal_period_number
    from
        fscl_periods f

)
select
    date_day,
    fiscal_year_number,
    week_start_date,
    week_end_date,
    fiscal_week_of_year,
    dense_rank() over(partition by fiscal_period_number order by fiscal_week_of_year) as fiscal_week_of_period,
    fiscal_period_number,
    quarter_number+1 as fiscal_quarter_number,
    period_of_quarter as fiscal_period_of_quarter
from
    fscl_periods_quarters
{#- Upstream has ORDER BY 1,2 here. Removed: Fabric doesn't support ORDER BY in views/subqueries. #}
{% endmacro %}
